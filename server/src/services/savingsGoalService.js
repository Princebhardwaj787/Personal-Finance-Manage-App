import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  GOAL_STATUS,
  GOAL_STATUSES,
  isGoalComplete,
  resolveGoalStatus,
  serializeGoal,
  calculateRemainingAmount,
  round2
} from '../utils/goalCalculator.js';

/** Fields the list/detail views actually render — keeps reads narrow. */
const GOAL_SELECT = {
  id: true,
  name: true,
  description: true,
  targetAmount: true,
  currentAmount: true,
  targetDate: true,
  status: true,
  accountId: true,
  createdAt: true,
  updatedAt: true
};

const parseDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${field} must be a valid date`, 400);
  }
  return date;
};

const assertPositive = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new AppError(`${field} must be a number`, 400);
  if (num <= 0) throw new AppError(`${field} must be greater than 0`, 400);
  return num;
};

const assertNonNegative = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new AppError(`${field} must be a number`, 400);
  if (num < 0) throw new AppError(`${field} must not be negative`, 400);
  return num;
};

const assertStatus = (value) => {
  if (!GOAL_STATUSES.includes(value)) {
    throw new AppError(`Status must be one of: ${GOAL_STATUSES.join(', ')}`, 400);
  }
  return value;
};

/** Fetch a goal scoped to its owner. Throws 404 for other users' goals. */
const findOwnedGoal = async (userId, goalId) => {
  const goal = await prisma.savingsGoal.findFirst({
    where: { id: goalId, userId },
    select: { ...GOAL_SELECT, _count: { select: { contributions: true } } }
  });
  if (!goal) throw new AppError('Savings goal not found', 404);
  return goal;
};

const withCounts = (goal) =>
  serializeGoal(goal, { contributionsCount: goal._count?.contributions ?? 0 });

/**
 * List the authenticated user's goals with derived progress fields.
 * Aggregates are computed in memory from two columns — no extra queries.
 */
export const listGoals = async (userId, { status } = {}) => {
  const where = { userId };
  if (status) {
    assertStatus(status);
    where.status = status;
  }

  const goals = await prisma.savingsGoal.findMany({
    where,
    select: { ...GOAL_SELECT, _count: { select: { contributions: true } } },
    orderBy: [{ status: 'asc' }, { targetDate: 'asc' }]
  });

  return goals.map(withCounts);
};

export const getGoal = async (userId, goalId) => {
  const goal = await findOwnedGoal(userId, goalId);
  return withCounts(goal);
};

export const createGoal = async (userId, payload) => {
  const name = String(payload.name ?? '').trim();
  if (!name) throw new AppError('Name is required', 400);

  const targetAmount = assertPositive(payload.targetAmount, 'Target amount');
  const currentAmount = payload.currentAmount === undefined || payload.currentAmount === null
    ? 0
    : assertNonNegative(payload.currentAmount, 'Current amount');

  if (currentAmount > targetAmount) {
    throw new AppError('Current amount cannot exceed the target amount', 400);
  }

  const targetDate = parseDate(payload.targetDate, 'Target date');

  // Creation never accepts a status directly: completion is derived.
  const draft = { targetAmount, currentAmount, status: GOAL_STATUS.ACTIVE };

  const goal = await prisma.savingsGoal.create({
    data: {
      userId,
      name,
      description: payload.description ? String(payload.description).trim() : null,
      targetAmount,
      currentAmount,
      targetDate,
      status: resolveGoalStatus(draft)
    },
    select: GOAL_SELECT
  });

  return withCounts({ ...goal, _count: { contributions: 0 } });
};

export const updateGoal = async (userId, goalId, payload) => {
  const existing = await findOwnedGoal(userId, goalId);

  const data = {};

  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) throw new AppError('Name cannot be empty', 400);
    data.name = name;
  }

  if (payload.description !== undefined) {
    data.description = payload.description ? String(payload.description).trim() : null;
  }

  let targetAmount = existing.targetAmount;
  if (payload.targetAmount !== undefined) {
    targetAmount = assertPositive(payload.targetAmount, 'Target amount');
    data.targetAmount = targetAmount;
  }

  if (payload.targetDate !== undefined) {
    data.targetDate = parseDate(payload.targetDate, 'Target date');
  }

  // Guard: shrinking the target below what is already saved is not allowed.
  if (targetAmount < existing.currentAmount) {
    throw new AppError(
      'Target amount cannot be lower than the amount already saved',
      400
    );
  }

  if (payload.status !== undefined) {
    // Explicit user choice wins (this is how manual reopen / archive works).
    data.status = assertStatus(payload.status);
  } else {
    // No explicit choice: derive completion from the resulting amounts.
    data.status = resolveGoalStatus({
      ...existing,
      ...data,
      targetAmount
    });
  }

  const updated = await prisma.savingsGoal.update({
    where: { id: goalId },
    data,
    select: GOAL_SELECT
  });

  return withCounts({ ...updated, _count: { contributions: existing._count?.contributions ?? 0 } });
};

/**
 * Delete a goal. Only the goal row and its contribution history are removed
 * (cascade). Savings goals have no relation to Transaction, so deleting a
 * goal can never remove financial transactions.
 */
export const deleteGoal = async (userId, goalId) => {
  const existing = await findOwnedGoal(userId, goalId);

  await prisma.savingsGoal.delete({ where: { id: existing.id } });

  return { id: existing.id, deletedContributions: existing._count?.contributions ?? 0 };
};

/**
 * Record a contribution and increase the goal's saved amount ATOMICALLY.
 *
 * Both writes happen inside one interactive transaction: if either one
 * fails, Prisma rolls back and neither is committed. The goal is re-read
 * inside the transaction so two concurrent contributions cannot overfund it.
 */
export const addContribution = async (userId, goalId, payload) => {
  const amount = assertPositive(payload.amount, 'Amount');
  const note = payload.note ? String(payload.note).trim() : null;
  const date = payload.date ? parseDate(payload.date, 'Contribution date') : new Date();

  return prisma.$transaction(async (tx) => {
    const goal = await tx.savingsGoal.findFirst({
      where: { id: goalId, userId },
      select: { ...GOAL_SELECT, _count: { select: { contributions: true } } }
    });
    if (!goal) throw new AppError('Savings goal not found', 404);

    if (goal.status === GOAL_STATUS.ARCHIVED) {
      throw new AppError('Archived goals cannot receive contributions', 400);
    }

    const remaining = calculateRemainingAmount(goal);
    if (amount > remaining) {
      throw new AppError(
        `Contribution exceeds the remaining amount (${round2(remaining)})`,
        400
      );
    }

    const contribution = await tx.savingsContribution.create({
      data: { goalId: goal.id, amount, date, note },
      select: { id: true, goalId: true, amount: true, date: true, note: true, createdAt: true }
    });

    const nextCurrentAmount = round2(goal.currentAmount + amount);
    const status = resolveGoalStatus({
      ...goal,
      currentAmount: nextCurrentAmount
    });

    const updated = await tx.savingsGoal.update({
      where: { id: goal.id },
      data: { currentAmount: nextCurrentAmount, status },
      select: GOAL_SELECT
    });

    return {
      goal: withCounts({
        ...updated,
        _count: { contributions: (goal._count?.contributions ?? 0) + 1 }
      }),
      contribution
    };
  });
};

/** Paginated contribution history, newest first. */
export const listContributions = async (userId, goalId, { page = 1, limit = 10 } = {}) => {
  await findOwnedGoal(userId, goalId);

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const skip = (safePage - 1) * safeLimit;

  const [contributions, total] = await Promise.all([
    prisma.savingsContribution.findMany({
      where: { goalId },
      select: { id: true, goalId: true, amount: true, date: true, note: true, createdAt: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: safeLimit
    }),
    prisma.savingsContribution.count({ where: { goalId } })
  ]);

  return {
    contributions,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
};

/** Aggregate across every goal of a user — used by the dashboard (single query). */
export const getSavingsSummary = async (userId) => {
  const [byStatus, totals] = await Promise.all([
    prisma.savingsGoal.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.savingsGoal.aggregate({
      // Archived goals are opted out of totals, matching the UI copy.
      where: { userId, status: { not: GOAL_STATUS.ARCHIVED } },
      _sum: { currentAmount: true, targetAmount: true }
    })
  ]);

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));

  return {
    activeCount: counts[GOAL_STATUS.ACTIVE] ?? 0,
    completedCount: counts[GOAL_STATUS.COMPLETED] ?? 0,
    archivedCount: counts[GOAL_STATUS.ARCHIVED] ?? 0,
    totalSaved: round2(totals._sum.currentAmount ?? 0),
    totalTargets: round2(totals._sum.targetAmount ?? 0)
  };
};

export { isGoalComplete };
