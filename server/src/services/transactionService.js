import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { dateFilter } from '../utils/dateRange.js';
import { buildOrderBy } from '../utils/sortOrder.js';

/**
 * TRANSACTION SERVICE
 * ===================
 * Every read goes through `buildTransactionWhere` + `resolveOrderBy`, so the
 * transaction list, the detail view, bulk operations and any future export all
 * share ONE query definition (Phase 7 §27). Nothing here ever loads a whole
 * history into memory: filtering, sorting, paging and totals are database work.
 *
 * Ownership is always part of the `where` clause (`userId` first), so a date
 * filter can only narrow a query — it can never widen it beyond the caller.
 */

/** Phase 7: transfers live in their own table and are never Transactions. */
export const TRANSACTION_TYPES = Object.freeze(['INCOME', 'EXPENSE']);

/** Whitelists — user input is NEVER interpolated into an order-by (§E). */
export const SORTABLE_FIELDS = Object.freeze(['date', 'amount', 'createdAt']);
export const SORT_ORDERS = Object.freeze(['asc', 'desc']);

/** Bulk delete guard: one request can never touch an unbounded row set. */
export const MAX_BULK_DELETE = 200;

const MAX_NOTES_LENGTH = 2000;
const MAX_REFERENCE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

/** Narrow, stable projection used by list + detail (to-one joins, no N+1). */
const TRANSACTION_SELECT = {
  id: true,
  type: true,
  amount: true,
  description: true,
  notes: true,
  reference: true,
  date: true,
  accountId: true,
  categoryId: true,
  recurringExpenseId: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, type: true, icon: true, color: true, currency: true } },
  category: { select: { id: true, name: true, type: true, icon: true, color: true } },
  recurringExpense: { select: { id: true, name: true, frequency: true } }
};

/** Optional text fields: trim, empty -> null, enforce max length. */
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
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new AppError(`${field} must be a number`, 400);
  if (amount <= 0) throw new AppError(`${field} must be greater than 0`, 400);
  return amount;
};

const parseDate = (value, field = 'Date') => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
  return date;
};

/**
 * Shared WHERE builder. `userId` is always present, every other key is an
 * optional narrowing filter. Search is case-insensitive and spans description,
 * notes, reference, category name and account name — all evaluated in SQL.
 */
export const buildTransactionWhere = (userId, filters = {}) => {
  const { type, accountId, categoryId, startDate, endDate, minAmount, maxAmount, search } = filters;

  const where = { userId };

  if (type) {
    if (!TRANSACTION_TYPES.includes(type)) {
      throw new AppError(`type must be one of: ${TRANSACTION_TYPES.join(', ')}`, 400);
    }
    where.type = type;
  }
  if (accountId) where.accountId = accountId;
  if (categoryId) where.categoryId = categoryId;

  const range = dateFilter(startDate, endDate);
  if (range) where.date = range;

  const amountFilter = {};
  if (minAmount !== undefined && minAmount !== null && minAmount !== '') {
    const value = Number(minAmount);
    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('minAmount must be a non-negative number', 400);
    }
    amountFilter.gte = value;
  }
  if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') {
    const value = Number(maxAmount);
    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('maxAmount must be a non-negative number', 400);
    }
    amountFilter.lte = value;
  }
  if (amountFilter.gte !== undefined && amountFilter.lte !== undefined && amountFilter.gte > amountFilter.lte) {
    throw new AppError('minAmount cannot be greater than maxAmount', 400);
  }
  if (Object.keys(amountFilter).length > 0) where.amount = amountFilter;

  const term = search ? String(search).trim() : '';
  if (term) {
    // NOTE: `mode: 'insensitive'` does not exist on Prisma's SQLite connector.
    // `contains` compiles to SQL LIKE, which SQLite treats as case-insensitive
    // for ASCII, so search is case-insensitive here without the extra flag.
    where.OR = [
      { description: { contains: term } },
      { notes: { contains: term } },
      { reference: { contains: term } },
      { category: { name: { contains: term } } },
      { account: { name: { contains: term } } }
    ];
  }

  return where;
};

/**
 * Whitelisted order-by with a stable `id` tiebreaker so paginated pages never
 * repeat or skip a row when several transactions share a date/amount.
 * Delegates to the shared sort utility (single whitelist implementation).
 */
export const resolveOrderBy = (sortBy = 'date', sortOrder = 'desc') =>
  buildOrderBy({ sortBy, sortOrder, allowed: SORTABLE_FIELDS, fallback: 'date' });

/** User-facing shape — internal columns (userId, raw FKs) are never exposed. */
export const serializeTransaction = (transaction) => ({
  id: transaction.id,
  type: transaction.type,
  amount: transaction.amount,
  description: transaction.description ?? null,
  notes: transaction.notes ?? null,
  reference: transaction.reference ?? null,
  date: transaction.date,
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? null,
  account: transaction.account ?? null,
  category: transaction.category ?? null,
  recurringExpenseId: transaction.recurringExpenseId ?? null,
  recurringExpense: transaction.recurringExpense ?? null,
  isAutoGenerated: Boolean(transaction.recurringExpenseId),
  createdAt: transaction.createdAt,
  updatedAt: transaction.updatedAt
});

/**
 * Paged list. Reusable by the transactions page, bulk operations and (later)
 * CSV export — everything is decided in SQL.
 */
export const getTransactions = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'date',
    sortOrder = 'desc',
    ...filters
  } = options;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const where = buildTransactionWhere(userId, filters);
  const orderBy = resolveOrderBy(sortBy, sortOrder);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: TRANSACTION_SELECT
    }),
    prisma.transaction.count({ where })
  ]);

  return {
    transactions: transactions.map(serializeTransaction),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  };
};

const findOwned = async (userId, transactionId) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: TRANSACTION_SELECT
  });
  if (!transaction) throw new AppError('Transaction not found', 404);
  return transaction;
};

export const getTransactionById = async (userId, transactionId) =>
  serializeTransaction(await findOwned(userId, transactionId));

export const createTransaction = async (userId, data) => {
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
  const date = parseDate(data.date, 'Date') ?? new Date();

  if (!data.accountId) throw new AppError('Account is required', 400);

  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
    select: { id: true }
  });
  if (!account) throw new AppError('Account not found', 404);

  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId, type },
      select: { id: true }
    });
    if (!category) throw new AppError('Invalid category for this transaction type', 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: account.id },
      data: { balance: { increment: type === 'INCOME' ? amount : -amount } }
    });

    const transaction = await tx.transaction.create({
      data: {
        type,
        amount,
        description,
        notes,
        reference,
        date,
        userId,
        accountId: account.id,
        categoryId: data.categoryId ?? null
      },
      select: TRANSACTION_SELECT
    });

    return serializeTransaction(transaction);
  });
};

export const updateTransaction = async (userId, transactionId, data) => {
  const existing = await findOwned(userId, transactionId);

  const newType = data.type !== undefined ? data.type : existing.type;
  if (!TRANSACTION_TYPES.includes(newType)) {
    throw new AppError(
      `type must be one of: ${TRANSACTION_TYPES.join(', ')}. Transfers are managed via /api/transfers`,
      400
    );
  }

  const newAmount = data.amount !== undefined ? parseAmount(data.amount) : existing.amount;
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
    const account = await prisma.account.findFirst({
      where: { id: newAccountId, userId },
      select: { id: true }
    });
    if (!account) throw new AppError('Account not found', 404);
  }

  if (newCategoryId) {
    const category = await prisma.category.findFirst({
      where: { id: newCategoryId, userId, type: newType },
      select: { id: true }
    });
    if (!category) throw new AppError('Invalid category for this transaction type', 400);
  }

  // Balance maths: reverse exactly what the old row did, apply what the new
  // row does — one atomic step, never two half-applied updates.
  const signed = (type, amount) => (type === 'INCOME' ? amount : -amount);
  const oldDelta = signed(existing.type, existing.amount);
  const newDelta = signed(newType, newAmount);

  return prisma.$transaction(async (tx) => {
    if (existing.accountId === newAccountId) {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { balance: { increment: newDelta - oldDelta } }
      });
    } else {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { balance: { increment: -oldDelta } }
      });
      await tx.account.update({
        where: { id: newAccountId },
        data: { balance: { increment: newDelta } }
      });
    }

    const transaction = await tx.transaction.update({
      where: { id: existing.id },
      data: {
        type: newType,
        amount: newAmount,
        date: newDate,
        accountId: newAccountId,
        categoryId: newCategoryId ?? null,
        description: newDescription,
        notes: newNotes,
        reference: newReference
      },
      select: TRANSACTION_SELECT
    });

    return serializeTransaction(transaction);
  });
};

export const deleteTransaction = async (userId, transactionId) => {
  const existing = await findOwned(userId, transactionId);

  await prisma.$transaction(async (tx) => {
    // Reverse the money the row moved, then remove it — atomically.
    await tx.account.update({
      where: { id: existing.accountId },
      data: { balance: { increment: existing.type === 'INCOME' ? -existing.amount : existing.amount } }
    });
    await tx.transaction.delete({ where: { id: existing.id } });
  });

  return { success: true };
};

/**
 * Duplicate (Phase 7 §8): the source row is READ, never cloned. A brand new
 * record is built through the normal create path, so it gets a new id, its own
 * `createdAt`, and its own balance impact. Optionally takes `date`.
 */
export const duplicateTransaction = async (userId, transactionId, payload = {}) => {
  const source = await findOwned(userId, transactionId);

  return createTransaction(userId, {
    type: source.type,
    amount: source.amount,
    description: source.description,
    notes: source.notes,
    reference: source.reference,
    date: payload.date ? parseDate(payload.date, 'Date') ?? new Date() : new Date(),
    accountId: source.accountId,
    categoryId: source.categoryId
  });
};

/**
 * Bulk delete (Phase 7 §26). Every id is re-checked against `req.user.id`;
 * if any id is missing or foreign the whole request fails, so a partial delete
 * can never happen behind the user's back. Balance reversals + deletes run in
 * ONE database transaction.
 */
export const bulkDeleteTransactions = async (userId, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError('ids must be a non-empty array of transaction ids', 400);
  }
  const uniqueIds = [...new Set(ids.map(String))];
  if (uniqueIds.length > MAX_BULK_DELETE) {
    throw new AppError(`You can delete at most ${MAX_BULK_DELETE} transactions at a time`, 400);
  }

  const rows = await prisma.transaction.findMany({
    where: { userId, id: { in: uniqueIds } },
    select: { id: true, type: true, amount: true, accountId: true }
  });

  if (rows.length !== uniqueIds.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new AppError(`Transaction(s) not found: ${missing.join(', ')}`, 404);
  }

  // One net change per account — computed in memory over a bounded row set.
  const balanceChanges = new Map();
  for (const row of rows) {
    const delta = row.type === 'INCOME' ? -row.amount : row.amount;
    balanceChanges.set(row.accountId, (balanceChanges.get(row.accountId) ?? 0) + delta);
  }

  await prisma.$transaction(async (tx) => {
    for (const [accountId, change] of balanceChanges) {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: change } }
      });
    }
    await tx.transaction.deleteMany({ where: { id: { in: uniqueIds }, userId } });
  });

  return {
    deleted: rows.length,
    balanceChanges: [...balanceChanges.entries()].map(([accountId, change]) => ({ accountId, change }))
  };
};

export const getTransactionSummary = async (userId, options = {}) => {
  const where = buildTransactionWhere(userId, options);

  const [income, expenses] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...where, type: 'INCOME' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...where, type: 'EXPENSE' }, _sum: { amount: true } })
  ]);

  const totalIncome = income._sum.amount || 0;
  const totalExpenses = expenses._sum.amount || 0;

  return {
    totalIncome,
    totalExpenses,
    netSavings: totalIncome - totalExpenses
  };
};

export const getTransactionsByCategory = async (userId, options = {}) => {
  const { type = 'EXPENSE' } = options;
  const where = { ...buildTransactionWhere(userId, options), type };

  return prisma.transaction.groupBy({
    by: ['categoryId'],
    where,
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } }
  });
};
