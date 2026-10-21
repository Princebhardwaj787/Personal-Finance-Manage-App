import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { dateFilter } from '../utils/dateRange.js';
import { buildOrderBy } from '../utils/sortOrder.js';
import { toMinorUnits, fromMinorUnits } from '../utils/money.js';

/**
 * TRANSFER SERVICE (Phase 7 §B)
 * =============================
 * A transfer moves money between two accounts the authenticated user owns.
 * It is stored in its own table, never as an income/expense row, so moving
 * money between your own accounts can never change your net worth.
 *
 * Guarantees:
 *  - Both accounts are verified against `userId` (cross-user transfers are
 *    impossible — the identity always comes from the JWT, never the body).
 *  - Source and destination must differ.
 *  - The source debit uses a conditional update (`balance >= amount`), so the
 *    balance check and the debit are ONE atomic step, not two.
 *  - Debit + credit + Transfer row are committed together or not at all.
 */

export const TRANSFER_SORT_FIELDS = Object.freeze(['date', 'amount', 'createdAt']);

const MAX_DESCRIPTION_LENGTH = 500;

const TRANSFER_SELECT = {
  id: true,
  amount: true,
  date: true,
  description: true,
  fromAccountId: true,
  toAccountId: true,
  createdAt: true,
  updatedAt: true,
  fromAccount: { select: { id: true, name: true, type: true, icon: true, color: true, currency: true } },
  toAccount: { select: { id: true, name: true, type: true, icon: true, color: true, currency: true } }
};

const serializeTransfer = (transfer) => ({
  id: transfer.id,
  // Integer minor units (paise) -> decimal major units for API output.
  amount: fromMinorUnits(transfer.amount),
  date: transfer.date,
  description: transfer.description ?? null,
  fromAccountId: transfer.fromAccountId,
  toAccountId: transfer.toAccountId,
  fromAccount: transfer.fromAccount ?? null,
  toAccount: transfer.toAccount ?? null,
  createdAt: transfer.createdAt,
  updatedAt: transfer.updatedAt
});

const parseAmount = (value) => {
  if (!Number.isFinite(Number(value))) throw new AppError('Amount must be a number', 400);
  const amount = Number(value);
  if (amount <= 0) throw new AppError('Amount must be greater than 0', 400);
  // Decimal input (e.g. 100.50) -> integer minor units (10050).
  return toMinorUnits(amount);
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError('Date must be a valid date', 400);
  return date;
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

/** Both accounts must exist AND belong to the caller. */
const loadOwnedAccounts = async (userId, fromAccountId, toAccountId) => {
  if (!fromAccountId || !toAccountId) {
    throw new AppError('Source account and destination account are required', 400);
  }
  if (fromAccountId === toAccountId) {
    throw new AppError('Cannot transfer to the same account', 400);
  }

  const accounts = await prisma.account.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, userId },
    select: { id: true, name: true, balance: true }
  });

  const from = accounts.find((a) => a.id === fromAccountId);
  const to = accounts.find((a) => a.id === toAccountId);

  if (!from) throw new AppError('Source account not found or does not belong to you', 404);
  if (!to) throw new AppError('Destination account not found or does not belong to you', 404);

  return { from, to };
};

/**
 * Atomic debit: the `balance >= amount` condition lives in the WHERE clause of
 * the UPDATE, so the balance can never be checked in one statement and changed
 * in another. Returns `false` when the account is missing or too low.
 */
const debitIfAffordable = (tx, userId, accountId, amount) =>
  tx.account.updateMany({
    where: { id: accountId, userId, balance: { gte: amount } },
    data: { balance: { decrement: amount } }
  });

const creditAccount = async (tx, userId, accountId, amount) => {
  const result = await tx.account.updateMany({
    where: { id: accountId, userId },
    data: { balance: { increment: amount } }
  });
  if (result.count === 0) {
    throw new AppError('Destination account not found or does not belong to you', 404);
  }
};

export const createTransfer = async (userId, payload = {}) => {
  const amount = parseAmount(payload.amount);
  const date = parseDate(payload.date);
  const description = parseDescription(payload.description);

  await loadOwnedAccounts(userId, payload.fromAccountId, payload.toAccountId);

  return prisma.$transaction(async (tx) => {
    const debited = await debitIfAffordable(tx, userId, payload.fromAccountId, amount);
    if (debited.count === 0) {
      const owned = await tx.account.findFirst({
        where: { id: payload.fromAccountId, userId },
        select: { id: true, name: true, balance: true }
      });
      if (!owned) throw new AppError('Source account not found or does not belong to you', 404);
      throw new AppError(
        `Insufficient balance in ${owned.name} (available ${fromMinorUnits(owned.balance)}, transfer ${fromMinorUnits(amount)})`,
        400
      );
    }

    await creditAccount(tx, userId, payload.toAccountId, amount);

    const transfer = await tx.transfer.create({
      data: {
        userId,
        fromAccountId: payload.fromAccountId,
        toAccountId: payload.toAccountId,
        amount,
        date,
        description
      },
      select: TRANSFER_SELECT
    });

    return serializeTransfer(transfer);
  });
};

export const getTransferById = async (userId, transferId) => {
  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, userId },
    select: TRANSFER_SELECT
  });
  if (!transfer) throw new AppError('Transfer not found', 404);
  return serializeTransfer(transfer);
};

/**
 * Transfer history with the same query rules as transactions: SQL-side date
 * range, account filter (either side), search over description + both account
 * names, whitelisted sort, stable pagination.
 */
export const getTransfers = async (userId, options = {}) => {
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

  const where = { userId };

  const range = dateFilter(startDate, endDate);
  if (range) where.date = range;

  if (accountId) {
    where.OR = [{ fromAccountId: accountId }, { toAccountId: accountId }];
  }

  const term = search ? String(search).trim() : '';
  if (term) {
    where.AND = [
      {
        // `mode: 'insensitive'` is not available on Prisma's SQLite connector;
        // `contains` compiles to LIKE, which SQLite compares case-insensitively
        // for ASCII.
        OR: [
          { description: { contains: term } },
          { fromAccount: { name: { contains: term } } },
          { toAccount: { name: { contains: term } } }
        ]
      }
    ];
  }

  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      orderBy: buildOrderBy({ sortBy, sortOrder, allowed: TRANSFER_SORT_FIELDS }),
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: TRANSFER_SELECT
    }),
    prisma.transfer.count({ where })
  ]);

  return {
    transfers: transfers.map(serializeTransfer),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  };
};

/**
 * Update: undo the old movement and apply the new one inside a single
 * transaction, re-checking affordability on the (possibly new) source.
 */
export const updateTransfer = async (userId, transferId, payload = {}) => {
  const existing = await prisma.transfer.findFirst({
    where: { id: transferId, userId },
    select: { id: true, amount: true, fromAccountId: true, toAccountId: true }
  });
  if (!existing) throw new AppError('Transfer not found', 404);

  const fromAccountId = payload.fromAccountId || existing.fromAccountId;
  const toAccountId = payload.toAccountId || existing.toAccountId;
  const amount = payload.amount !== undefined ? parseAmount(payload.amount) : existing.amount;
  const date = payload.date !== undefined ? parseDate(payload.date) : undefined;
  const description =
    payload.description !== undefined ? parseDescription(payload.description) : undefined;

  await loadOwnedAccounts(userId, fromAccountId, toAccountId);

  return prisma.$transaction(async (tx) => {
    // 1. Undo the previous movement (unconditional — this only reverses what
    //    this row already did, so it can never fail on balance grounds).
    await tx.account.update({
      where: { id: existing.fromAccountId },
      data: { balance: { increment: existing.amount } }
    });
    await tx.account.update({
      where: { id: existing.toAccountId },
      data: { balance: { decrement: existing.amount } }
    });

    // 2. Apply the new movement with the same affordability guarantee.
    const debited = await debitIfAffordable(tx, userId, fromAccountId, amount);
    if (debited.count === 0) {
      const owned = await tx.account.findFirst({
        where: { id: fromAccountId, userId },
        select: { id: true, name: true, balance: true }
      });
      if (!owned) throw new AppError('Source account not found or does not belong to you', 404);
      throw new AppError(
        `Insufficient balance in ${owned.name} (available ${fromMinorUnits(owned.balance)}, transfer ${fromMinorUnits(amount)})`,
        400
      );
    }
    await creditAccount(tx, userId, toAccountId, amount);

    const data = { amount, fromAccountId, toAccountId };
    if (date !== undefined) data.date = date;
    if (description !== undefined) data.description = description;

    const updated = await tx.transfer.update({
      where: { id: existing.id },
      data,
      select: TRANSFER_SELECT
    });

    return serializeTransfer(updated);
  });
};

/** Delete: reverse both sides of the movement, then drop the record. */
export const deleteTransfer = async (userId, transferId) => {
  const existing = await prisma.transfer.findFirst({
    where: { id: transferId, userId },
    select: { id: true, amount: true, fromAccountId: true, toAccountId: true }
  });
  if (!existing) throw new AppError('Transfer not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: existing.fromAccountId },
      data: { balance: { increment: existing.amount } }
    });
    await tx.account.update({
      where: { id: existing.toAccountId },
      data: { balance: { decrement: existing.amount } }
    });
    await tx.transfer.delete({ where: { id: existing.id } });
  });

  return { success: true };
};

/**
 * Total moved between the user's own accounts for a period. Used by the
 * transfers page header — computed in SQL, never from loaded rows.
 */
export const getTransferSummary = async (userId, options = {}) => {
  const { startDate, endDate } = options;
  const where = { userId };
  const range = dateFilter(startDate, endDate);
  if (range) where.date = range;

  const [aggregate, count] = await Promise.all([
    prisma.transfer.aggregate({ where, _sum: { amount: true } }),
    prisma.transfer.count({ where })
  ]);

  return {
    totalAmount: fromMinorUnits(aggregate._sum.amount ?? 0),
    count
  };
};
