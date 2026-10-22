/**
 * LOCAL TRANSFER SERVICE (Android conversion — Phase C)
 * =====================================================
 * The on-device counterpart of `server/src/services/transferService.js`.
 *
 * A transfer moves money between two of the user's own accounts. It is
 * stored in its own table, so it can never be counted as income or expense
 * and moving money between accounts can never change net worth.
 *
 * Guarantees preserved from the server:
 *  - both accounts are verified against the user (cross-user transfers are
 *    impossible);
 *  - source and destination must differ;
 *  - the source debit uses a conditional update (`balance >= amount`), so the
 *    affordability check and the debit are ONE atomic step;
 *  - debit + credit + the Transfer row commit together or not at all.
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import { dateFilter } from '@shared/dateRange.js';
import { buildOrderBy } from '@shared/sortOrder.js';
import { makeId } from '../schema.js';

const now = () => new Date().toISOString();

export const TRANSFER_SORT_FIELDS = Object.freeze(['date', 'amount', 'createdAt']);

const MAX_DESCRIPTION_LENGTH = 500;

const parseAmount = (value) => {
  if (!Number.isFinite(Number(value))) throw new AppError('Amount must be a number', 400);
  const amount = Number(value);
  if (amount <= 0) throw new AppError('Amount must be greater than 0', 400);
  return toMinorUnits(amount);
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === '') return now();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError('Date must be a valid date', 400);
  return date.toISOString();
};

const parseDescription = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    throw new AppError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`, 400);
  }
  return text;
};

const serializeTransfer = (row) => ({
  id: row.id,
  amount: fromMinorUnits(row.amount),
  date: row.date,
  description: row.description ?? null,
  fromAccountId: row.fromAccountId,
  toAccountId: row.toAccountId,
  fromAccount: row.fromName
    ? { id: row.fromAccountId, name: row.fromName, currency: row.fromCurrency ?? 'INR' }
    : null,
  toAccount: row.toName
    ? { id: row.toAccountId, name: row.toName, currency: row.toCurrency ?? 'INR' }
    : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const SELECT_WITH_RELATIONS = `
  SELECT tr.*,
         f.name AS fromName, f.currency AS fromCurrency,
         t.name AS toName, t.currency AS toCurrency
  FROM "Transfer" tr
  LEFT JOIN "Account" f ON f.id = tr."fromAccountId"
  LEFT JOIN "Account" t ON t.id = tr."toAccountId"`;

export const createTransferService = (db) => {
  const findOwned = async (userId, transferId) => {
    const rows = await db.select(`${SELECT_WITH_RELATIONS} WHERE tr.id = ? AND tr.userId = ?`, [
      transferId,
      userId
    ]);
    if (rows.length === 0) throw new AppError('Transfer not found', 404);
    return rows[0];
  };

  /** Both accounts must exist AND belong to the caller. */
  const loadOwnedAccounts = async (userId, fromAccountId, toAccountId) => {
    if (!fromAccountId || !toAccountId) {
      throw new AppError('Source account and destination account are required', 400);
    }
    if (fromAccountId === toAccountId) {
      throw new AppError('Cannot transfer to the same account', 400);
    }

    const rows = await db.select(
      'SELECT id, name, balance FROM "Account" WHERE id IN (?, ?) AND userId = ?',
      [fromAccountId, toAccountId, userId]
    );

    const from = rows.find((a) => a.id === fromAccountId);
    const to = rows.find((a) => a.id === toAccountId);

    if (!from) throw new AppError('Source account not found or does not belong to you', 404);
    if (!to) throw new AppError('Destination account not found or does not belong to you', 404);

    return { from, to };
  };

  return {
    async getTransfers(userId, options = {}) {
      const {
        page = 1,
        limit = 20,
        startDate,
        endDate,
        accountId,
        search,
        sortBy = 'date',
        sortOrder = 'desc'
      } = options;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

      const clauses = ['tr.userId = ?'];
      const params = [userId];

      const range = dateFilter(startDate, endDate);
      if (range) {
        if (range.gte) {
          clauses.push('tr.date >= ?');
          params.push(range.gte.toISOString());
        }
        if (range.lt) {
          clauses.push('tr.date < ?');
          params.push(range.lt.toISOString());
        }
      }

      if (accountId) {
        clauses.push('(tr."fromAccountId" = ? OR tr."toAccountId" = ?)');
        params.push(accountId, accountId);
      }

      const term = search ? String(search).trim() : '';
      if (term) {
        const like = `%${term}%`;
        clauses.push('(tr.description LIKE ? OR f.name LIKE ? OR t.name LIKE ?)');
        params.push(like, like, like);
      }

      const where = clauses.join(' AND ');
      const order = buildOrderBy({
        sortBy,
        sortOrder,
        allowed: TRANSFER_SORT_FIELDS
      })
        .map((entry) => {
          const [field, direction] = Object.entries(entry)[0];
          return `tr."${field}" ${direction}`;
        })
        .join(', ');

      const rows = await db.select(
        `${SELECT_WITH_RELATIONS} WHERE ${where} ORDER BY ${order}, tr.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
        [...params, limitNum, (pageNum - 1) * limitNum]
      );

      const totalRows = await db.select(
        `SELECT COUNT(*) AS c FROM "Transfer" tr
         LEFT JOIN "Account" f ON f.id = tr."fromAccountId"
         LEFT JOIN "Account" t ON t.id = tr."toAccountId"
         WHERE ${where}`,
        params
      );
      const total = Number(totalRows[0]?.c ?? 0);

      return {
        transfers: rows.map(serializeTransfer),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      };
    },

    async getTransferById(userId, transferId) {
      return serializeTransfer(await findOwned(userId, transferId));
    },

    async createTransfer(userId, payload = {}) {
      const amount = parseAmount(payload.amount);
      const date = parseDate(payload.date);
      const description = parseDescription(payload.description);

      await loadOwnedAccounts(userId, payload.fromAccountId, payload.toAccountId);

      const id = makeId();
      const timestamp = now();

      await db.transaction(async (tx) => {
        // Atomic debit: the `balance >= amount` condition lives in the WHERE
        // clause, so the check and the debit are one statement.
        const debited = await tx.execute(
          'UPDATE "Account" SET balance = balance - ? WHERE id = ? AND userId = ? AND balance >= ?',
          [amount, payload.fromAccountId, userId, amount]
        );

        if (debited.rowsAffected === 0) {
          const owned = await tx.select(
            'SELECT id, name, balance FROM "Account" WHERE id = ? AND userId = ?',
            [payload.fromAccountId, userId]
          );
          if (owned.length === 0) {
            throw new AppError('Source account not found or does not belong to you', 404);
          }
          throw new AppError(
            `Insufficient balance in ${owned[0].name} (available ${fromMinorUnits(owned[0].balance)}, transfer ${fromMinorUnits(amount)})`,
            400
          );
        }

        const credited = await tx.execute(
          'UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?',
          [amount, payload.toAccountId, userId]
        );
        if (credited.rowsAffected === 0) {
          throw new AppError('Destination account not found or does not belong to you', 404);
        }

        await tx.execute(
          `INSERT INTO "Transfer"
             (id, amount, date, description, userId, "fromAccountId", "toAccountId", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            amount,
            date,
            description,
            userId,
            payload.fromAccountId,
            payload.toAccountId,
            timestamp,
            timestamp
          ]
        );
      });

      return serializeTransfer(await findOwned(userId, id));
    },

    async updateTransfer(userId, transferId, payload = {}) {
      const existing = await findOwned(userId, transferId);

      const fromAccountId = payload.fromAccountId || existing.fromAccountId;
      const toAccountId = payload.toAccountId || existing.toAccountId;
      const amount =
        payload.amount !== undefined ? parseAmount(payload.amount) : existing.amount;
      const date = payload.date !== undefined ? parseDate(payload.date) : undefined;
      const description =
        payload.description !== undefined ? parseDescription(payload.description) : undefined;

      await loadOwnedAccounts(userId, fromAccountId, toAccountId);

      await db.transaction(async (tx) => {
        // 1. Undo the previous movement (unconditional).
        await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
          existing.amount,
          existing.fromAccountId,
          userId
        ]);
        await tx.execute('UPDATE "Account" SET balance = balance - ? WHERE id = ? AND userId = ?', [
          existing.amount,
          existing.toAccountId,
          userId
        ]);

        // 2. Apply the new movement with the same affordability guarantee.
        const debited = await tx.execute(
          'UPDATE "Account" SET balance = balance - ? WHERE id = ? AND userId = ? AND balance >= ?',
          [amount, fromAccountId, userId, amount]
        );
        if (debited.rowsAffected === 0) {
          const owned = await tx.select(
            'SELECT id, name, balance FROM "Account" WHERE id = ? AND userId = ?',
            [fromAccountId, userId]
          );
          if (owned.length === 0) {
            throw new AppError('Source account not found or does not belong to you', 404);
          }
          throw new AppError(
            `Insufficient balance in ${owned[0].name} (available ${fromMinorUnits(owned[0].balance)}, transfer ${fromMinorUnits(amount)})`,
            400
          );
        }
        await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
          amount,
          toAccountId,
          userId
        ]);

        await tx.execute(
          `UPDATE "Transfer" SET
             amount = ?, "fromAccountId" = ?, "toAccountId" = ?,
             date = COALESCE(?, date),
             description = COALESCE(?, description),
             "updatedAt" = ?
           WHERE id = ? AND userId = ?`,
          [
            amount,
            fromAccountId,
            toAccountId,
            date ?? null,
            description ?? null,
            now(),
            existing.id,
            userId
          ]
        );
      });

      return serializeTransfer(await findOwned(userId, existing.id));
    },

    async deleteTransfer(userId, transferId) {
      const existing = await findOwned(userId, transferId);

      await db.transaction(async (tx) => {
        await tx.execute('UPDATE "Account" SET balance = balance + ? WHERE id = ? AND userId = ?', [
          existing.amount,
          existing.fromAccountId,
          userId
        ]);
        await tx.execute('UPDATE "Account" SET balance = balance - ? WHERE id = ? AND userId = ?', [
          existing.amount,
          existing.toAccountId,
          userId
        ]);
        await tx.execute('DELETE FROM "Transfer" WHERE id = ? AND userId = ?', [
          existing.id,
          userId
        ]);
      });

      return { success: true };
    },

    /** Total moved between the user's own accounts for a period. */
    async getTransferSummary(userId, options = {}) {
      const { startDate, endDate } = options;

      const clauses = ['userId = ?'];
      const params = [userId];

      const range = dateFilter(startDate, endDate);
      if (range) {
        if (range.gte) {
          clauses.push('date >= ?');
          params.push(range.gte.toISOString());
        }
        if (range.lt) {
          clauses.push('date < ?');
          params.push(range.lt.toISOString());
        }
      }

      const where = clauses.join(' AND ');
      const rows = await db.select(
        `SELECT SUM(amount) AS total, COUNT(*) AS c FROM "Transfer" WHERE ${where}`,
        params
      );

      return {
        totalAmount: fromMinorUnits(Number(rows[0]?.total ?? 0)),
        count: Number(rows[0]?.c ?? 0)
      };
    }
  };
};

export default createTransferService;
