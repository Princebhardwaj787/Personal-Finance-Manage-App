import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  FREQUENCIES,
  summarize,
  daysUntil,
  serializeRecurringExpense
} from '../utils/recurringCalculator.js';

const RECURRING_SELECT = {
  id: true,
  name: true,
  amount: true,
  frequency: true,
  nextDueDate: true,
  description: true,
  isActive: true,
  accountId: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, type: true, icon: true, color: true } },
  category: { select: { id: true, name: true, type: true, icon: true, color: true } }
};

/** Narrow projection used for aggregate maths — never loads full rows. */
const TOTALS_SELECT = { id: true, amount: true, frequency: true };

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const parseDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
  return date;
};

const assertPositive = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new AppError(`${field} must be a number`, 400);
  if (num <= 0) throw new AppError(`${field} must be greater than 0`, 400);
  return num;
};

const assertFrequency = (value) => {
  if (!FREQUENCIES.includes(value)) {
    throw new AppError(`Frequency must be one of: ${FREQUENCIES.join(', ')}`, 400);
  }
  return value;
};

/**
 * Ownership is checked for both the account and the category, and the
 * category must be an EXPENSE category. A user can never attach another
 * user's account/category to their recurring expense.
 */
const assertOwnedAccountAndCategory = async (userId, accountId, categoryId) => {
  const [account, category] = await Promise.all([
    prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } }),
    prisma.category.findFirst({
      where: { id: categoryId, userId, type: 'EXPENSE' },
      select: { id: true }
    })
  ]);

  if (!account) throw new AppError('Account not found or does not belong to you', 400);
  if (!category) {
    throw new AppError('Category not found, does not belong to you, or is not an EXPENSE category', 400);
  }
};

const findOwned = async (userId, id) => {
  const item = await prisma.recurringExpense.findFirst({
    where: { id, userId },
    select: RECURRING_SELECT
  });
  if (!item) throw new AppError('Recurring expense not found', 404);
  return item;
};

export const listRecurringExpenses = async (userId, { status = 'active' } = {}) => {
  const where = { userId };
  if (status === 'active') where.isActive = true;
  else if (status === 'inactive') where.isActive = false;
  else if (status !== 'all') throw new AppError('Status must be active, inactive or all', 400);

  const items = await prisma.recurringExpense.findMany({
    where,
    select: RECURRING_SELECT,
    orderBy: { nextDueDate: 'asc' }
  });

  return items.map(serializeRecurringExpense);
};

export const getRecurringExpense = async (userId, id) =>
  serializeRecurringExpense(await findOwned(userId, id));

export const createRecurringExpense = async (userId, payload) => {
  const name = String(payload.name ?? '').trim();
  if (!name) throw new AppError('Name is required', 400);

  const amount = assertPositive(payload.amount, 'Amount');
  const frequency = assertFrequency(payload.frequency);
  const nextDueDate = parseDate(payload.nextDueDate, 'Next due date');

  if (!payload.accountId) throw new AppError('Account is required', 400);
  if (!payload.categoryId) throw new AppError('Category is required', 400);

  await assertOwnedAccountAndCategory(userId, payload.accountId, payload.categoryId);

  const item = await prisma.recurringExpense.create({
    data: {
      userId,
      name,
      amount,
      frequency,
      nextDueDate,
      description: payload.description ? String(payload.description).trim() : null,
      isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
      accountId: payload.accountId,
      categoryId: payload.categoryId
    },
    select: RECURRING_SELECT
  });

  return serializeRecurringExpense(item);
};

export const updateRecurringExpense = async (userId, id, payload) => {
  const existing = await findOwned(userId, id);
  const data = {};

  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) throw new AppError('Name cannot be empty', 400);
    data.name = name;
  }
  if (payload.amount !== undefined) data.amount = assertPositive(payload.amount, 'Amount');
  if (payload.frequency !== undefined) data.frequency = assertFrequency(payload.frequency);
  if (payload.nextDueDate !== undefined) data.nextDueDate = parseDate(payload.nextDueDate, 'Next due date');
  if (payload.description !== undefined) {
    data.description = payload.description ? String(payload.description).trim() : null;
  }
  // Pause / resume goes through here (isActive). Rows are never deleted.
  if (payload.isActive !== undefined) data.isActive = Boolean(payload.isActive);

  const accountId = payload.accountId ?? existing.accountId;
  const categoryId = payload.categoryId ?? existing.categoryId;
  if (payload.accountId !== undefined || payload.categoryId !== undefined) {
    await assertOwnedAccountAndCategory(userId, accountId, categoryId);
    data.accountId = accountId;
    data.categoryId = categoryId;
  }

  const updated = await prisma.recurringExpense.update({
    where: { id: existing.id },
    data,
    select: RECURRING_SELECT
  });

  return serializeRecurringExpense(updated);
};

export const deleteRecurringExpense = async (userId, id) => {
  const existing = await findOwned(userId, id);
  await prisma.recurringExpense.delete({ where: { id: existing.id } });
  return { id: existing.id };
};

/**
 * Totals for ACTIVE recurring expenses only, computed with one aggregate
 * read of the narrow TOTALS_SELECT projection — historical transactions are
 * never touched (recurring expenses are planning records).
 */
export const getSummary = async (userId, { days = 30 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

  const [activeRows, upcomingRows, nextRow] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { userId, isActive: true },
      select: TOTALS_SELECT
    }),
    prisma.recurringExpense.count({
      where: { userId, isActive: true, nextDueDate: { lte: horizon } }
    }),
    prisma.recurringExpense.findFirst({
      where: { userId, isActive: true },
      select: { id: true, name: true, amount: true, frequency: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' }
    })
  ]);

  const totals = summarize(activeRows);

  return {
    ...totals,
    pausedCount: await prisma.recurringExpense.count({ where: { userId, isActive: false } }),
    upcomingCount: upcomingRows,
    windowDays: window,
    nextPayment: nextRow
      ? {
          id: nextRow.id,
          name: nextRow.name,
          amount: nextRow.amount,
          nextDueDate: nextRow.nextDueDate,
          daysUntilDue: daysUntil(nextRow.nextDueDate)
        }
      : null
  };
};

/**
 * Upcoming payments: ACTIVE only, ordered by nextDueDate ASC.
 * Past-due rows are included (they still need paying) plus everything
 * inside the forward-looking window.
 */
export const getUpcoming = async (userId, { days = 30, limit = 20 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

  const items = await prisma.recurringExpense.findMany({
    where: { userId, isActive: true, nextDueDate: { lte: horizon } },
    select: RECURRING_SELECT,
    orderBy: { nextDueDate: 'asc' },
    take
  });

  return {
    windowDays: window,
    upcoming: items.map(serializeRecurringExpense)
  };
};

/** Dashboard aggregation: narrow reads, never touches transactions. */
export const getRecurringSummary = async (userId, { days = 30 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

  const [rows, upcomingCount, next] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { userId, isActive: true },
      select: TOTALS_SELECT
    }),
    prisma.recurringExpense.count({
      where: { userId, isActive: true, nextDueDate: { lte: horizon } }
    }),
    prisma.recurringExpense.findFirst({
      where: { userId, isActive: true },
      select: { nextDueDate: true },
      orderBy: { nextDueDate: 'asc' }
    })
  ]);

  return {
    ...summarize(rows),
    upcomingCount,
    nextDueDate: next?.nextDueDate ?? null
  };
};
