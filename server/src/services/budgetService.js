import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { monthRange, monthLabel } from '../utils/dateRange.js';
import { round2 } from '../utils/goalCalculator.js';

/**
 * Single source of truth for budget maths.
 *
 * The status thresholds and the spent/remaining/percentage calculation used to
 * live inline in `budgetController`, which meant the dashboard could only have
 * re-implemented them (spec §10: "Do not duplicate budget logic"). Everything
 * that needs a budget number now goes through this service.
 *
 * Status semantics are unchanged from Phase 4:
 *   ON_TRACK  < 80%   |   WARNING  < 100%   |   EXCEEDED >= 100%
 */
export const BUDGET_STATUS_THRESHOLDS = {
  ON_TRACK: 79.99,
  WARNING: 99.99,
  EXCEEDED: 100
};

/** Pure: percentage -> status. Used for per-budget AND overall totals. */
export const resolveBudgetStatus = (
  percentageUsed,
  thresholds = BUDGET_STATUS_THRESHOLDS
) => {
  if (percentageUsed >= thresholds.EXCEEDED) return 'EXCEEDED';
  if (percentageUsed >= thresholds.WARNING) return 'WARNING';
  return 'ON_TRACK';
};

/** Pure: derive every displayed number for one budget from two values. */
export const computeBudgetStatus = (budgetAmount, spentAmount) => {
  const safeBudget = Number(budgetAmount) || 0;
  const spent = Number(spentAmount) || 0;
  const percentageUsed = safeBudget > 0 ? (spent / safeBudget) * 100 : 0;

  return {
    budgetAmount: safeBudget,
    spentAmount: round2(spent),
    remainingAmount: round2(safeBudget - spent),
    percentageUsed: Math.round(percentageUsed * 100) / 100,
    status: resolveBudgetStatus(percentageUsed)
  };
};

export const CATEGORY_SELECT = { id: true, name: true, type: true, icon: true, color: true };

/** Budgets whose category was deleted arrive as `null` (onDelete: SetNull). */
const serializeCategory = (category) =>
  category
    ? { id: category.id, name: category.name, icon: category.icon, color: category.color }
    : { id: null, name: 'Uncategorized', icon: null, color: null };

export const serializeBudget = (budget, status) => ({
  id: budget.id,
  category: serializeCategory(budget.category),
  budgetAmount: budget.amount,
  ...status
});

/**
 * Spent totals for MANY budgets using ONE aggregate per distinct calendar month
 * (previously 1 aggregate + 1 lookup per budget = 2N queries).
 *
 * The range is `[start, endExclusive)` so the last day of the month is never
 * dropped — the old `lte: <last-day-midnight>` excluded it entirely.
 */
export const calculateBudgetStatusBulk = async (userId, budgets) => {
  if (!budgets.length) return [];

  const byMonth = new Map();
  for (const budget of budgets) {
    const key = `${budget.year}-${budget.month}`;
    if (!byMonth.has(key)) byMonth.set(key, { year: budget.year, month: budget.month, group: [] });
    byMonth.get(key).group.push(budget);
  }

  const statusById = new Map();

  await Promise.all(
    [...byMonth.values()].map(async ({ year, month, group }) => {
      const { start, end } = monthRange(year, month);
      const rows = await prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true }
      });

      const spentByCategory = new Map();
      for (const row of rows) spentByCategory.set(row.categoryId, row._sum.amount ?? 0);

      for (const budget of group) {
        statusById.set(
          budget.id,
          computeBudgetStatus(budget.amount, spentByCategory.get(budget.categoryId) ?? 0)
        );
      }
    })
  );

  return budgets.map((budget) => statusById.get(budget.id));
};

/** Single-budget variant, kept for the detail endpoints. */
export const calculateBudgetStatus = async (userId, categoryId, month, year) => {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const { start, end } = monthRange(numericYear, numericMonth);

  const [budget, aggregate] = await Promise.all([
    prisma.budget.findFirst({
      where: { userId, categoryId, month: numericMonth, year: numericYear },
      select: { id: true, amount: true }
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        categoryId,
        date: { gte: start, lt: end }
      }
    })
  ]);

  const spentAmount = aggregate._sum.amount ?? 0;

  if (!budget) {
    return {
      budgetAmount: 0,
      spentAmount: round2(spentAmount),
      remainingAmount: 0,
      percentageUsed: 0,
      status: 'NO_BUDGET'
    };
  }

  return computeBudgetStatus(budget.amount, spentAmount);
};

/**
 * Budget overview for one calendar month: every budget, its status, the
 * period totals, and descriptive alerts for WARNING/EXCEEDED only.
 * Alerts are never invented when no budget exists.
 */
export const getBudgetOverview = async (userId, { month, year }) => {
  const numericMonth = Number(month);
  const numericYear = Number(year);

  if (
    !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12 ||
    !Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2999
  ) {
    throw new AppError('A valid month and year is required', 400);
  }

  const budgets = await prisma.budget.findMany({
    where: { userId, month: numericMonth, year: numericYear },
    include: { category: { select: CATEGORY_SELECT } },
    orderBy: { amount: 'desc' }
  });

  const statuses = await calculateBudgetStatusBulk(userId, budgets);
  const items = budgets.map((budget, index) => serializeBudget(budget, statuses[index]));

  const totalBudget = round2(items.reduce((sum, item) => sum + item.budgetAmount, 0));
  const totalSpent = round2(items.reduce((sum, item) => sum + item.spentAmount, 0));
  const remainingAmount = round2(totalBudget - totalSpent);
  const usagePercent = totalBudget > 0
    ? Math.round((totalSpent / totalBudget) * 10000) / 100
    : 0;

  const alerts = items
    .filter((item) => item.status === 'WARNING' || item.status === 'EXCEEDED')
    .map((item) => ({
      budgetId: item.id,
      category: item.category,
      status: item.status,
      spentAmount: item.spentAmount,
      budgetAmount: item.budgetAmount,
      remainingAmount: item.remainingAmount,
      percentageUsed: item.percentageUsed
    }));

  return {
    month: numericMonth,
    year: numericYear,
    monthLabel: monthLabel(numericYear, numericMonth),
    budgetCount: items.length,
    budgets: items,
    alerts,
    totals: {
      totalBudget,
      totalSpent,
      remainingAmount,
      usagePercent,
      status: items.length ? resolveBudgetStatus(usagePercent) : 'NO_BUDGET',
      exceededCount: items.filter((item) => item.status === 'EXCEEDED').length,
      warningCount: items.filter((item) => item.status === 'WARNING').length
    }
  };
};
