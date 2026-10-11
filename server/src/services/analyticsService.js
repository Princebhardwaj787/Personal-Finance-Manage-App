import { prisma } from '../config/database.js';
import { round2 } from '../utils/goalCalculator.js';
import {
  addUtcDays,
  enumerateBuckets,
  enumerateMonthlyBuckets
} from '../utils/dateRange.js';
import { getSavingsSummary, listGoals } from './savingsGoalService.js';
import { getRecurringSummary, getUpcoming } from './recurringExpenseService.js';
import { buildTransactionWhere } from './transactionService.js';

/**
 * Analytics service (spec §17).
 *
 * Every number here is produced by a database aggregate/groupBy over indexed
 * columns and returned as a small object. No historical transaction is ever
 * loaded into memory and shipped to the client (§16), and no React component
 * does financial maths (§3).
 *
 * All queries are scoped to the caller's `userId` — period filters can only
 * narrow a query, never widen it beyond the authenticated user (§28).
 */

const EXPENSE_TYPE = 'EXPENSE';

/**
 * Savings = Income − Expenses; Savings Rate = Savings / Income × 100.
 * Income 0 returns `savingsRate: null` (never NaN or Infinity, §9).
 */
export const getSavingsRate = (income, expenses) => {
  const safeIncome = Number(income) || 0;
  const safeExpenses = Number(expenses) || 0;
  const savings = round2(safeIncome - safeExpenses);
  const hasIncome = safeIncome > 0;
  const savingsRate = hasIncome ? round2((savings / safeIncome) * 100) : null;
  return { savings, savingsRate, hasIncome };
};

/**
 * Income / expense totals from Transaction, plus the amount moved between the
 * user's own accounts (Phase 7: transfers live in their own table, so they are
 * read separately and still never counted as income or expense).
 * Returns a `[start, end)` snapshot.
 *
 * `filters` (optional) is merged through `buildTransactionWhere` so callers such
 * as the yearly report can apply account/category/type/amount filters to every
 * monthly bucket without a second filtering implementation.
 */
export const fetchTypeTotals = async (userId, start, end, filters = {}) => {
  const where = buildTransactionWhere(userId, {
    ...filters,
    startDate: start.toISOString().slice(0, 10),
    endDate: addUtcDays(end, -1).toISOString().slice(0, 10)
  });

  const [rows, transfers] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true }
    }),
    prisma.transfer.aggregate({
      where: { userId, date: { gte: start, lt: end } },
      _sum: { amount: true }
    })
  ]);

  const byType = Object.fromEntries(
    rows.map((row) => [row.type, round2(row._sum.amount ?? 0)])
  );

  return {
    income: byType.INCOME ?? 0,
    expense: byType.EXPENSE ?? 0,
    transfer: round2(transfers._sum.amount ?? 0)
  };
};

const buildSeries = (buckets, values) =>
  buckets.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    start: bucket.start.toISOString(),
    end: bucket.end.toISOString(),
    income: values[index].income,
    expense: values[index].expense,
    net: round2(values[index].income - values[index].expense)
  }));

const totalOf = (series) => {
  const income = round2(series.reduce((sum, point) => sum + point.income, 0));
  const expense = round2(series.reduce((sum, point) => sum + point.expense, 0));
  return { income, expense, net: round2(income - expense) };
};

const periodShape = (range) => ({
  period: range.period,
  start: range.start.toISOString(),
  end: range.end.toISOString(), // exclusive
  endInclusive: range.endInclusiveISO,
  label: range.label,
  granularity: range.granularity,
  days: range.days
});

/**
 * GET /api/dashboard/summary payload.
 * Balance is a POINT-IN-TIME figure (sum of account balances, the same figure
 * the Accounts page shows) so it is deliberately not period-scoped.
 * Income / expenses / net / savings-rate are period-scoped.
 */
export const getDashboardSummary = async (userId, range) => {
  const [balanceAgg, byType, transfers, savings, recurring] = await Promise.all([
    prisma.account.aggregate({ where: { userId }, _sum: { balance: true } }),
    prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true }
    }),
    // Phase 7: transfers have their own table — read separately, still never
    // counted as income or expense.
    prisma.transfer.aggregate({
      where: { userId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true }
    }),
    getSavingsSummary(userId),
    getRecurringSummary(userId)
  ]);

  const totals = Object.fromEntries(
    byType.map((row) => [row.type, round2(row._sum.amount ?? 0)])
  );

  const income = totals.INCOME ?? 0;
  const expenses = totals.EXPENSE ?? 0;
  const rate = getSavingsRate(income, expenses);

  return {
    period: periodShape(range),
    totalBalance: round2(balanceAgg._sum.balance ?? 0),
    totalIncome: income,
    totalExpenses: expenses,
    totalTransfers: round2(transfers._sum.amount ?? 0),
    netSavings: rate.savings,
    savingsRate: rate.savingsRate,
    hasIncome: rate.hasIncome,
    // Money sitting in savings goals (Phase 5) — distinct from netSavings.
    totalSavings: savings.totalSaved,
    savings: {
      activeCount: savings.activeCount,
      completedCount: savings.completedCount,
      archivedCount: savings.archivedCount,
      totalSaved: savings.totalSaved,
      totalTargets: savings.totalTargets
    },
    recurring: {
      activeCount: recurring.activeCount,
      monthlyCost: recurring.monthlyCost,
      yearlyCost: recurring.yearlyCost,
      upcomingCount: recurring.upcomingCount,
      nextDueDate: recurring.nextDueDate
    }
  };
};

/** Income vs expenses over time, bucketed by day / week / month (§5). */
export const getIncomeExpenseTrend = async (userId, range, granularity) => {
  const buckets = enumerateBuckets(range, granularity);
  const values = await Promise.all(
    buckets.map((bucket) => fetchTypeTotals(userId, bucket.start, bucket.end))
  );

  const series = buildSeries(buckets, values);

  return {
    period: periodShape(range),
    granularity: granularity || range.granularity,
    buckets: series,
    totals: totalOf(series)
  };
};

/**
 * Expense totals grouped by category for the period.
 * One query serves BOTH the category chart (§7) and the top-categories list (§8).
 */
/**
 * Category spending for a range. `filters` (optional) is merged through
 * `buildTransactionWhere` so the Phase 8 category report can apply the same
 * account/type/amount filters as every other report. The dashboard call stays
 * `(userId, range)` and is unchanged. `type` defaults to EXPENSE (this is a
 * spending report) but can be overridden to INCOME via the filters.
 */
export const getCategorySpending = async (userId, range, filters = {}) => {
  const { type = EXPENSE_TYPE, ...restFilters } = filters;
  const where = {
    ...buildTransactionWhere(userId, {
      ...restFilters,
      startDate: range.startISO,
      endDate: range.endInclusiveISO
    }),
    type
  };

  const rows = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 50
  });

  const categoryIds = rows.map((row) => row.categoryId).filter(Boolean);
  const categories = categoryIds.length
    ? await prisma.category.findMany({
        where: { id: { in: categoryIds }, userId },
        select: { id: true, name: true, icon: true, color: true }
      })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const totalExpenses = round2(
    rows.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)
  );

  const items = rows.map((row) => {
    const category = row.categoryId ? categoryById.get(row.categoryId) : null;
    const amount = round2(row._sum.amount ?? 0);
    return {
      categoryId: row.categoryId,
      name: category?.name ?? 'Uncategorized',
      icon: category?.icon ?? null,
      color: category?.color ?? null,
      amount,
      count: row._count._all,
      sharePercent: totalExpenses > 0 ? round2((amount / totalExpenses) * 100) : 0
    };
  });

  return {
    period: periodShape(range),
    totalExpenses,
    categories: items,
    topCategories: items.slice(0, 5),
    hasExpenses: items.length > 0
  };
};

/** Last N calendar months of income vs expense, ending with the current month (§6). */
export const getMonthlyTrend = async (userId, months = 12) => {
  const buckets = enumerateMonthlyBuckets(months);
  const values = await Promise.all(
    buckets.map((bucket) => fetchTypeTotals(userId, bucket.start, bucket.end))
  );

  const series = buildSeries(buckets, values);
  const totals = totalOf(series);

  return {
    months: series,
    count: series.length,
    totals: {
      ...totals,
      ...getSavingsRate(totals.income, totals.expense)
    }
  };
};

/**
 * Recent transactions + active savings goals + upcoming payments in ONE call.
 * These three are not period-scoped, so they are fetched once and survive
 * period changes without reloading (§4, §12–14).
 */
export const getWidgetData = async (
  userId,
  { transactionLimit = 8, goalLimit = 5, upcomingLimit = 5 } = {}
) => {
  const safeTransactionLimit = Math.min(Math.max(parseInt(transactionLimit, 10) || 8, 1), 20);
  const safeGoalLimit = Math.min(Math.max(parseInt(goalLimit, 10) || 5, 1), 20);
  const safeUpcomingLimit = Math.min(Math.max(parseInt(upcomingLimit, 10) || 5, 1), 20);

  const [recentTransactions, goals, upcoming, activity] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        date: true,
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, icon: true, color: true } }
      },
      orderBy: { date: 'desc' },
      take: safeTransactionLimit
    }),
    listGoals(userId, { status: 'ACTIVE' }),
    getUpcoming(userId, { days: 30, limit: safeUpcomingLimit }),
    getUserActivity(userId)
  ]);

  return {
    recentTransactions,
    savingsGoals: goals.slice(0, safeGoalLimit),
    savingsGoalsTotal: goals.length,
    upcomingPayments: upcoming.upcoming,
    upcomingWindowDays: upcoming.windowDays,
    activity
  };
};

/** Empty-state hint used by the UI: has this user ever recorded anything? */
export const getUserActivity = async (userId) => {
  const [transactionCount, budgetCount, goalCount, recurringCount] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.budget.count({ where: { userId } }),
    prisma.savingsGoal.count({ where: { userId } }),
    prisma.recurringExpense.count({ where: { userId } })
  ]);

  return { transactionCount, budgetCount, goalCount, recurringCount };
};
