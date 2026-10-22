/**
 * LOCAL ANALYTICS SERVICE (Android conversion — Phase C)
 * =====================================================
 * The on-device counterpart of `server/src/services/analyticsService.js`.
 *
 * Every number here is produced by a database aggregate over indexed
 * columns. No history is ever loaded into memory and shipped to the UI.
 *
 * Two rules are preserved from the server:
 *  - internal transfers live in their own table and are NEVER counted as
 *    income or expense;
 *  - the date strategy is UTC calendar days with an EXCLUSIVE end, so the
 *    last day of a period is never dropped.
 */

import { round2 } from '@shared/goalCalculator.js';
import { fromMinorUnits } from '@shared/money.js';
import {
  addUtcDays,
  enumerateBuckets,
  enumerateMonthlyBuckets
} from '@shared/dateRange.js';

const EXPENSE_TYPE = 'EXPENSE';

/**
 * Savings = Income − Expenses; Savings Rate = Savings / Income × 100.
 * Income 0 returns `savingsRate: null` (never NaN or Infinity).
 */
export const getSavingsRate = (income, expenses) => {
  const safeIncome = Number(income) || 0;
  const safeExpenses = Number(expenses) || 0;
  const savings = round2(safeIncome - safeExpenses);
  const hasIncome = safeIncome > 0;
  const savingsRate = hasIncome ? round2((savings / safeIncome) * 100) : null;
  return { savings, savingsRate, hasIncome };
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
 * Income / expense totals for a `[start, end)` snapshot, plus the amount
 * moved between the user's own accounts (reported separately so it can never
 * leak into the income/expense columns).
 */
export const fetchTypeTotals = async (db, userId, start, end, filters = {}) => {
  const clauses = ['userId = ?', 'date >= ?', 'date < ?'];
  const params = [userId, start.toISOString(), end.toISOString()];

  if (filters.type) {
    clauses.push('type = ?');
    params.push(filters.type);
  }
  if (filters.accountId) {
    clauses.push('accountId = ?');
    params.push(filters.accountId);
  }
  if (filters.categoryId) {
    clauses.push('categoryId = ?');
    params.push(filters.categoryId);
  }

  const where = clauses.join(' AND ');

  const [rows, transferRows] = await Promise.all([
    db.select(
      `SELECT type, SUM(amount) AS total FROM "Transaction" WHERE ${where} GROUP BY type`,
      params
    ),
    db.select(
      'SELECT SUM(amount) AS total FROM "Transfer" WHERE userId = ? AND date >= ? AND date < ?',
      [userId, start.toISOString(), end.toISOString()]
    )
  ]);

  const byType = Object.fromEntries(
    rows.map((row) => [row.type, fromMinorUnits(Number(row.total ?? 0))])
  );

  return {
    income: byType.INCOME ?? 0,
    expense: byType.EXPENSE ?? 0,
    transfer: fromMinorUnits(Number(transferRows[0]?.total ?? 0))
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

export const createAnalyticsService = (db, { savingsGoalService, recurringExpenseService } = {}) => ({
  /**
   * GET /api/dashboard/summary payload.
   * Balance is a POINT-IN-TIME figure (the sum of account balances), so it is
   * deliberately not period-scoped.
   */
  async getDashboardSummary(userId, range) {
    const [balanceRows, typeRows, transferRows, savings, recurring] = await Promise.all([
      db.select('SELECT SUM(balance) AS total FROM "Account" WHERE userId = ?', [userId]),
      db.select(
        'SELECT type, SUM(amount) AS total FROM "Transaction" WHERE userId = ? AND date >= ? AND date < ? GROUP BY type',
        [userId, range.start.toISOString(), range.end.toISOString()]
      ),
      db.select(
        'SELECT SUM(amount) AS total FROM "Transfer" WHERE userId = ? AND date >= ? AND date < ?',
        [userId, range.start.toISOString(), range.end.toISOString()]
      ),
      savingsGoalService ? savingsGoalService.getSavingsSummary(userId) : null,
      recurringExpenseService ? recurringExpenseService.getRecurringSummary(userId) : null
    ]);

    const totals = Object.fromEntries(
      typeRows.map((row) => [row.type, fromMinorUnits(Number(row.total ?? 0))])
    );

    const income = totals.INCOME ?? 0;
    const expenses = totals.EXPENSE ?? 0;
    const rate = getSavingsRate(income, expenses);

    return {
      period: periodShape(range),
      totalBalance: fromMinorUnits(Number(balanceRows[0]?.total ?? 0)),
      totalIncome: income,
      totalExpenses: expenses,
      totalTransfers: fromMinorUnits(Number(transferRows[0]?.total ?? 0)),
      netSavings: rate.savings,
      savingsRate: rate.savingsRate,
      hasIncome: rate.hasIncome,
      totalSavings: savings?.totalSaved ?? 0,
      savings: savings
        ? {
            activeCount: savings.activeCount,
            completedCount: savings.completedCount,
            archivedCount: savings.archivedCount,
            totalSaved: savings.totalSaved,
            totalTargets: savings.totalTargets
          }
        : null,
      recurring: recurring
        ? {
            activeCount: recurring.activeCount,
            monthlyCost: recurring.monthlyCost,
            yearlyCost: recurring.yearlyCost,
            upcomingCount: recurring.upcomingCount,
            nextDueDate: recurring.nextDueDate
          }
        : null
    };
  },

  /** Income vs expenses over time, bucketed by day / week / month. */
  async getIncomeExpenseTrend(userId, range, granularity) {
    const buckets = enumerateBuckets(range, granularity);
    const values = await Promise.all(
      buckets.map((bucket) => fetchTypeTotals(db, userId, bucket.start, bucket.end))
    );

    const series = buildSeries(buckets, values);

    return {
      period: periodShape(range),
      granularity: granularity || range.granularity,
      buckets: series,
      totals: totalOf(series)
    };
  },

  /** Expense totals grouped by category. */
  async getCategorySpending(userId, range, filters = {}) {
    const { type = EXPENSE_TYPE, ...restFilters } = filters;

    const clauses = [
      't.userId = ?',
      't.date >= ?',
      't.date < ?',
      't.type = ?'
    ];
    const params = [
      userId,
      range.start.toISOString(),
      range.end.toISOString(),
      type
    ];

    if (restFilters.accountId) {
      clauses.push('t.accountId = ?');
      params.push(restFilters.accountId);
    }
    if (restFilters.categoryId) {
      clauses.push('t.categoryId = ?');
      params.push(restFilters.categoryId);
    }

    const where = clauses.join(' AND ');

    const rows = await db.select(
      `SELECT t.categoryId, SUM(t.amount) AS total, COUNT(*) AS c
       FROM "Transaction" t
       WHERE ${where}
       GROUP BY t.categoryId
       ORDER BY total DESC
       LIMIT 50`,
      params
    );

    const categoryIds = rows.map((row) => row.categoryId).filter(Boolean);
    const categories = categoryIds.length
      ? await db.select(
          'SELECT id, name, icon, color FROM "Category" WHERE userId = ? AND id IN (' +
            categoryIds.map(() => '?').join(',') + ')',
          [userId, ...categoryIds]
        )
      : [];
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const totalExpenses = fromMinorUnits(
      rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
    );

    const items = rows.map((row) => {
      const category = row.categoryId ? categoryById.get(row.categoryId) : null;
      const amount = fromMinorUnits(Number(row.total ?? 0));
      return {
        categoryId: row.categoryId,
        name: category?.name ?? 'Uncategorized',
        icon: category?.icon ?? null,
        color: category?.color ?? null,
        amount,
        count: Number(row.c ?? 0),
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
  },

  /** The last N calendar months of income vs expense. */
  async getMonthlyTrend(userId, months = 12) {
    const buckets = enumerateMonthlyBuckets(months);
    const values = await Promise.all(
      buckets.map((bucket) => fetchTypeTotals(db, userId, bucket.start, bucket.end))
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
  },

  /**
   * Recent transactions + active savings goals + upcoming payments in ONE
   * call. These are not period-scoped.
   */
  async getWidgetData(
    userId,
    { transactionLimit = 8, goalLimit = 5, upcomingLimit = 5 } = {}
  ) {
    const safeTransactionLimit = Math.min(Math.max(parseInt(transactionLimit, 10) || 8, 1), 20);
    const safeGoalLimit = Math.min(Math.max(parseInt(goalLimit, 10) || 5, 1), 20);
    const safeUpcomingLimit = Math.min(Math.max(parseInt(upcomingLimit, 10) || 5, 1), 20);

    const [recentTransactions, goals, upcoming, activity] = await Promise.all([
      db.select(
        `SELECT t.id, t.type, t.amount, t.description, t.date,
                a.id AS accountId, a.name AS accountName,
                c.id AS categoryId, c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
         FROM "Transaction" t
         LEFT JOIN "Account" a ON a.id = t.accountId
         LEFT JOIN "Category" c ON c.id = t.categoryId
         WHERE t.userId = ?
         ORDER BY t.date DESC LIMIT ?`,
        [userId, safeTransactionLimit]
      ),
      savingsGoalService
        ? savingsGoalService.listGoals(userId, { status: 'ACTIVE' })
        : Promise.resolve([]),
      recurringExpenseService
        ? recurringExpenseService.getUpcoming(userId, { days: 30, limit: safeUpcomingLimit })
        : Promise.resolve({ upcoming: [], windowDays: 30 }),
      this.getUserActivity(userId)
    ]);

    return {
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: fromMinorUnits(t.amount),
        description: t.description,
        date: t.date,
        account: t.accountId ? { id: t.accountId, name: t.accountName } : null,
        category: t.categoryId
          ? { id: t.categoryId, name: t.categoryName, icon: t.categoryIcon, color: t.categoryColor }
          : null
      })),
      savingsGoals: goals.slice(0, safeGoalLimit),
      savingsGoalsTotal: goals.length,
      upcomingPayments: upcoming.upcoming,
      upcomingWindowDays: upcoming.windowDays,
      activity
    };
  },

  /** Empty-state hint used by the UI: has this user ever recorded anything? */
  async getUserActivity(userId) {
    const rows = await db.select(
      `SELECT
         (SELECT COUNT(*) FROM "Transaction" WHERE userId = ?) AS transactionCount,
         (SELECT COUNT(*) FROM "Budget" WHERE userId = ?) AS budgetCount,
         (SELECT COUNT(*) FROM "SavingsGoal" WHERE userId = ?) AS goalCount,
         (SELECT COUNT(*) FROM "RecurringExpense" WHERE userId = ?) AS recurringCount`,
      [userId, userId, userId, userId]
    );

    return {
      transactionCount: Number(rows[0]?.transactionCount ?? 0),
      budgetCount: Number(rows[0]?.budgetCount ?? 0),
      goalCount: Number(rows[0]?.goalCount ?? 0),
      recurringCount: Number(rows[0]?.recurringCount ?? 0)
    };
  }
});

export { addUtcDays };
export default createAnalyticsService;
