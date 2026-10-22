/**
 * LOCAL TRANSACTION SERVICE (Android conversion — Phase C)
 * ======================================================
 * The on-device counterpart of `server/src/services/transactionService.js`.
 *
 * Financial rules preserved exactly:
 *   - amounts are integer minor units (paise) everywhere;
 *   - the account balance is updated in the SAME transaction that writes the
 *     transaction row, so a failure can never leave a balance out of step;
 *   - a transfer is NOT a transaction — it lives in its own table and can
 *     never be counted as income or expense;
 *   - editing reverses the old movement and applies the new one atomically.
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import { dateFilter } from '@shared/dateRange.js';
import { buildOrderBy } from '@shared/sortOrder.js';
import { makeId } from '../schema.js';

const now = () => new Date().toISOString();

/** Transfers live in their own table and are never income/expense rows. */
export const TRANSACTION_TYPES = Object.freeze(['INCOME', 'EXPENSE']);

/** Whitelists — user input is NEVER interpolated into an order-by. */
export const SORTABLE_FIELDS = Object.freeze(['date', 'amount', 'createdAt']);
export const SORT_ORDERS = Object.freeze(['asc', 'desc']);

/** Bulk delete guard: one request can never touch an unbounded row set. */
export const MAX_BULK_DELETE = 200;

const MAX_NOTES_LENGTH = 2000;
const MAX_REFERENCE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

const optionalText = (value, maxLength, field) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new AppError(`${field} must be ${maxLength} characters or fewer`, 400);
  }
  return text;
};

const parseAmount = (value, field = 'Amount') => {
  if (!Number.isFinite(Number(value))) throw new AppError(`${field} must be a number`, 400);
  const amount = Number(value);
  if (amount <= 0) throw new AppError(`${field} must be greater than 0`, 400);
  return toMinorUnits(amount);
};

const parseDate = (value, field = 'Date') => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
  return date.toISOString();
};

/** The signed effect of a transaction on its account balance (minor units). */
const signed = (type, amount) => (type === 'INCOME' ? amount : -amount);

/**
 * Shared WHERE builder. `userId` is always present; every other key is an
 * optional narrowing filter, so a filter can never widen the result set.
 */
export const buildTransactionWhere = (userId, filters = {}) => {
  const { type, accountId, categoryId, startDate, endDate, minAmount, maxAmount, search } = filters;

  const clauses = ['t.userId = ?'];
  const params = [userId];

  if (type) {
    if (!TRANSACTION_TYPES.includes(type)) {
      throw new AppError(`type must be one of: ${TRANSACTION_TYPES.join(', ')}`, 400);
    }
    clauses.push('t.type = ?');
    params.push(type);
  }
  if (accountId) {
    clauses.push('t.accountId = ?');
    params.push(accountId);
  }
  if (categoryId) {
    clauses.push('t.categoryId = ?');
    params.push(categoryId);
  }

  const range = dateFilter(startDate, endDate);
  if (range) {
    if (range.gte) {
      clauses.push('t.date >= ?');
      params.push(range.gte.toISOString());
    }
    if (range.lt) {
      clauses.push('t.date < ?');
      params.push(range.lt.toISOString());
    }
  }

  if (minAmount !== undefined && minAmount !== null && minAmount !== '') {
    const value = Number(minAmount);
    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('minAmount must be a non-negative number', 400);
    }
    clauses.push('t.amount >= ?');
    params.push(toMinorUnits(value));
  }
  if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') {
    const value = Number(maxAmount);
    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('maxAmount must be a non-negative number', 400);
    }
    clauses.push('t.amount <= ?');
    params.push(toMinorUnits(value));
  }

  const term = search ? String(search).trim() : '';
  if (term) {
    // SQLite's LIKE is case-insensitive for ASCII, which is what we want.
    const like = `%${term}%`;
    clauses.push(
      '(t.description LIKE ? OR t.notes LIKE ? OR t.reference LIKE ? OR c.name LIKE ? OR a.name LIKE ?)'
    );
    params.push(like, like, like, like, like);
  }

  return { where: clauses.join(' AND '), params };
};

/** Whitelisted order-by with a stable `id` tiebreaker. */
export const resolveOrderBy = (sortBy = 'date', sortOrder = 'desc') => {
  const order = buildOrderBy({
    sortBy,
    sortOrder,
    allowed: SORTABLE_FIELDS,
    fallback: 'date'
  });
  // `buildOrderBy` returns [{ field: direction }, { id: direction }].
  return order
    .map((entry) => {
      const [field, direction] = Object.entries(entry)[0];
      return `t."${field}" ${direction}`;
    })
    .join(', ');
};

/** Convert a stored row into the shape the UI expects. */
const serializeTransaction = (row) => ({
  id: row.id,
  type: row.type,
  amount: fromMinorUnits(row.amount),
  description: row.description ?? null,
  notes: row.notes ?? null,
  reference: row.reference ?? null,
  date: row.date,
  accountId: row.accountId,
  categoryId: row.categoryId ?? null,
  account: row.accountName
    ? { id: row.accountId, name: row.accountName, currency: row.accountCurrency ?? 'INR' }
    : null,
  category: row.categoryName
    ? { id: row.categoryId, name: row.categoryName, type: row.categoryType ?? null }
    : null,
  recurringExpenseId: row.recurringExpenseId ?? null,
  isAutoGenerated: Boolean(row.recurringExpenseId),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const SELECT_WITH_RELATIONS = `
  SELECT t.*,
         a.name AS accountName, a.currency AS accountCurrency,
         c.name AS categoryName, c.type AS categoryType
  FROM "Transaction" t
  LEFT JOIN "Account" a ON a.id = t.accountId
  LEFT JOIN "Category" c ON c.id = t.categoryId`;

export const createTransactionService = (db) => {
  const findOwned = async (userId, transactionId) => {
    const rows = await db.select(
      `${SELECT_WITH_RELATIONS} WHERE t.id = ? AND t.userId = ?`,
      [transactionId, userId]
    );
    if (rows.length === 0) throw new AppError('Transaction not found', 404);
    return rows[0];
  };

  return {
    TRANSACTION_TYPES,
    buildTransactionWhere,
    resolveOrderBy,

    async getTransactions(userId, options = {}) {
      const {
        page = 1,
        limit = 20,
        sortBy = 'date',
        sortOrder = 'desc',
        ...filters
      } = options;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

      const { where, params } = buildTransactionWhere(userId, filters);
      const orderBy = resolveOrderBy(sortBy, sortOrder);

      const rows = await db.select(
        `${SELECT_WITH_RELATIONS} WHERE ${where} ORDER BY ${orderBy}, t.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
        [...params, limitNum, (pageNum - 1) * limitNum]
      );

      const totalRows = await db.select(
        `SELECT COUNT(*) AS c FROM "Transaction" t LEFT JOIN "Account" a ON a.id = t.accountId LEFT JOIN "Category" c ON c.id = t.categoryId WHERE ${where}`,
        params
      );
      const total = Number(totalRows[0]?.c ?? 0);

      return {
        transactions: rows.map(serializeTransaction),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      };
    },

    async getTransactionById(userId, transactionId) {
      return serializeTransaction(await findOwned(userId, transactionId));
    },

    async createTransaction(userId, data) {
      const type = data.type;
      if (!TRANSACTION_TYPES.includes(type)) {
        throw new AppError(
          `type must be one of: ${TRANSACTION_TYPES.join(', ')}. Transfers are created via /api/transfers`,
          400
        );
      }

      const amount = parseAmount(data.amount);
      const description = optionalText(data.description, MAX_DESCRIPTION_LENGTH, 'Description');
      const notes = optionalText(data.notes, MAX_NOTES_LENGTH, 'Notes');
      const reference = optionalText(data.reference, MAX_REFERENCE_LENGTH, 'Reference');
      const date = parseDate(data.date, 'Date') ?? now();

      if (!data.accountId) throw new AppError('Account is required', 400);

      const accountRows = await db.select('SELECT id FROM "Account" WHERE id = ? AND userId = ?', [
        data.accountId,
        userId
      ]);
      if (accountRows.length === 0) throw new AppError('Account not found', 404);

      if (data.categoryId) {
        const categoryRows = await db.select(
          'SELECT id FROM "Category" WHERE id = ? AND userId = ? AND type = ?',
          [data.categoryId, userId, type]
        );
        if (categoryRows.length === 0) {
          throw new AppError('Invalid category for this transaction type', 400);
        }
      }

      const id = makeId();
      const timestamp = now();

      await db.transaction(async (tx) => {
        await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
          signed(type, amount),
          data.accountId,
          userId
        ]);

        await tx.execute(
          `INSERT INTO "Transaction"
             (id, type, amount, description, notes, reference, date, userId, accountId, categoryId, "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            type,
            amount,
            description ?? null,
            notes ?? null,
            reference ?? null,
            date,
            userId,
            data.accountId,
            data.categoryId ?? null,
            timestamp,
            timestamp
          ]
        );
      });

      return serializeTransaction(await findOwned(userId, id));
    },

    async updateTransaction(userId, transactionId, data) {
      const existing = await findOwned(userId, transactionId);

      const newType = data.type !== undefined ? data.type : existing.type;
      if (!TRANSACTION_TYPES.includes(newType)) {
        throw new AppError(
          `type must be one of: ${TRANSACTION_TYPES.join(', ')}. Transfers are managed via /api/transfers`,
          400
        );
      }

      const newAmount =
        data.amount !== undefined ? parseAmount(data.amount) : existing.amount;
      const newAccountId = data.accountId || existing.accountId;
      const newCategoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId;
      const newDate = data.date !== undefined ? (parseDate(data.date, 'Date') ?? existing.date) : existing.date;
      const newDescription =
        data.description !== undefined
          ? optionalText(data.description, MAX_DESCRIPTION_LENGTH, 'Description')
          : existing.description;
      const newNotes =
        data.notes !== undefined ? optionalText(data.notes, MAX_NOTES_LENGTH, 'Notes') : existing.notes;
      const newReference =
        data.reference !== undefined
          ? optionalText(data.reference, MAX_REFERENCE_LENGTH, 'Reference')
          : existing.reference;

      if (newAccountId !== existing.accountId) {
        const accountRows = await db.select(
          'SELECT id FROM "Account" WHERE id = ? AND userId = ?',
          [newAccountId, userId]
        );
        if (accountRows.length === 0) throw new AppError('Account not found', 404);
      }

      if (newCategoryId) {
        const categoryRows = await db.select(
          'SELECT id FROM "Category" WHERE id = ? AND userId = ? AND type = ?',
          [newCategoryId, userId, newType]
        );
        if (categoryRows.length === 0) {
          throw new AppError('Invalid category for this transaction type', 400);
        }
      }

      const oldDelta = signed(existing.type, existing.amount);
      const newDelta = signed(newType, newAmount);

      await db.transaction(async (tx) => {
        if (existing.accountId === newAccountId) {
          await tx.execute(
            'UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?',
            [newDelta - oldDelta, newAccountId, userId]
          );
        } else {
          await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
            -oldDelta,
            existing.accountId,
            userId
          ]);
          await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
            newDelta,
            newAccountId,
            userId
          ]);
        }

        await tx.execute(
          `UPDATE "Transaction" SET
             type = ?, amount = ?, date = ?, accountId = ?, categoryId = ?,
             description = ?, notes = ?, reference = ?, "updatedAt" = ?
           WHERE id = ? AND userId = ?`,
          [
            newType,
            newAmount,
            newDate,
            newAccountId,
            newCategoryId ?? null,
            newDescription,
            newNotes,
            newReference,
            now(),
            existing.id,
            userId
          ]
        );
      });

      return serializeTransaction(await findOwned(userId, existing.id));
    },

    async deleteTransaction(userId, transactionId) {
      const existing = await findOwned(userId, transactionId);

      await db.transaction(async (tx) => {
        await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
          -signed(existing.type, existing.amount),
          existing.accountId,
          userId
        ]);
        await tx.execute('DELETE FROM "Transaction" WHERE id = ? AND userId = ?', [
          existing.id,
          userId
        ]);
      });

      return { success: true };
    },

    /**
     * Duplicate: the source row is READ, never cloned. A brand new record is
     * created through the normal create path, so it gets its own id, its own
     * `createdAt` and its own balance impact.
     */
    async duplicateTransaction(userId, transactionId, payload = {}) {
      const source = await findOwned(userId, transactionId);

      return this.createTransaction(userId, {
        type: source.type,
        // `source.amount` is stored in minor units; convert back to decimal
        // so the normal create path stores it correctly.
        amount: fromMinorUnits(source.amount),
        description: source.description,
        notes: source.notes,
        reference: source.reference,
        date: payload.date ? parseDate(payload.date, 'Date') ?? now() : now(),
        accountId: source.accountId,
        categoryId: source.categoryId
      });
    },

    /**
     * Bulk delete: every id is re-checked against the user; if any id is
     * missing or foreign the whole request fails, so a partial delete can
     * never happen. Balance reversals + deletes run in ONE transaction.
     */
    async bulkDeleteTransactions(userId, ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('ids must be a non-empty array of transaction ids', 400);
      }
      const uniqueIds = [...new Set(ids.map(String))];
      if (uniqueIds.length > MAX_BULK_DELETE) {
        throw new AppError(`You can delete at most ${MAX_BULK_DELETE} transactions at a time`, 400);
      }

      const placeholders = uniqueIds.map(() => '?').join(',');
      const rows = await db.select(
        `SELECT id, type, amount, accountId FROM "Transaction" WHERE userId = ? AND id IN (${placeholders})`,
        [userId, ...uniqueIds]
      );

      if (rows.length !== uniqueIds.length) {
        const found = new Set(rows.map((row) => row.id));
        const missing = uniqueIds.filter((id) => !found.has(id));
        throw new AppError(`Transaction(s) not found: ${missing.join(', ')}`, 404);
      }

      // One net change per account — computed over a bounded row set.
      const balanceChanges = new Map();
      for (const row of rows) {
        const delta = -signed(row.type, row.amount);
        balanceChanges.set(row.accountId, (balanceChanges.get(row.accountId) ?? 0) + delta);
      }

      await db.transaction(async (tx) => {
        for (const [accountId, change] of balanceChanges) {
          await tx.execute(
            'UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?',
            [change, accountId, userId]
          );
        }
        await tx.execute(
          `DELETE FROM "Transaction" WHERE userId = ? AND id IN (${placeholders})`,
          [userId, ...uniqueIds]
        );
      });

      return {
        deleted: rows.length,
        balanceChanges: [...balanceChanges.entries()].map(([accountId, change]) => ({
          accountId,
          change: fromMinorUnits(change)
        }))
      };
    },

    /** Period + filter scoped totals (DB aggregate, never a sum of rows). */
    async getTransactionSummary(userId, options = {}) {
      const { where, params } = buildTransactionWhere(userId, options);

      const rows = await db.select(
        `SELECT t.type AS type, SUM(t.amount) AS total FROM "Transaction" t
         LEFT JOIN "Account" a ON a.id = t.accountId
         LEFT JOIN "Category" c ON c.id = t.categoryId
         WHERE ${where} GROUP BY t.type`,
        params
      );

      const totals = Object.fromEntries(
        rows.map((row) => [row.type, Number(row.total ?? 0)])
      );

      const incomeMinor = totals.INCOME ?? 0;
      const expenseMinor = totals.EXPENSE ?? 0;

      return {
        totalIncome: fromMinorUnits(incomeMinor),
        totalExpenses: fromMinorUnits(expenseMinor),
        netSavings: fromMinorUnits(incomeMinor - expenseMinor)
      };
    },

    /** Expense/income totals grouped by category. */
    async getTransactionsByCategory(userId, options = {}) {
      const { type = 'EXPENSE' } = options;
      const { where, params } = buildTransactionWhere(userId, options);

      const rows = await db.select(
        `SELECT t.categoryId, SUM(t.amount) AS total, COUNT(*) AS c
         FROM "Transaction" t
         LEFT JOIN "Account" a ON a.id = t.accountId
         LEFT JOIN "Category" c ON c.id = t.categoryId
         WHERE ${where} AND t.type = ?
         GROUP BY t.categoryId
         ORDER BY total DESC`,
        [...params, type]
      );

      return rows.map((row) => ({
        categoryId: row.categoryId,
        amount: fromMinorUnits(Number(row.total ?? 0)),
        count: Number(row.c ?? 0)
      }));
    }
  };
};

export default createTransactionService;
