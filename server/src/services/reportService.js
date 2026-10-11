import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { round2 } from '../utils/goalCalculator.js';
import {
  enumerateBuckets,
  monthAtEnd,
  resolveRange
} from '../utils/dateRange.js';
import {
  buildTransactionWhere,
  getTransactions,
  getTransactionSummary
} from './transactionService.js';
import {
  fetchTypeTotals,
  getCategorySpending,
  getSavingsRate
} from './analyticsService.js';
import { getBudgetOverview } from './budgetService.js';

/**
 * REPORT SERVICE (Phase 8)
 * ========================
 * Every report is assembled from EXISTING services — there is no second
 * reporting database and no duplicated business logic:
 *
 *   - date ranges  -> utils/dateRange.resolveRange (the same [start, end)
 *                     strategy the dashboard and analytics use)
 *   - row filters  -> transactionService.buildTransactionWhere (the same
 *                     where-clause the transaction list/search uses)
 *   - income/expense totals -> transactionService.getTransactionSummary
 *   - savings rate -> analyticsService.getSavingsRate
 *   - category breakdown -> analyticsService.getCategorySpending
 *   - budgets -> budgetService.getBudgetOverview (Phase 4, untouched)
 *   - monthly buckets -> analyticsService.fetchTypeTotals (now exported)
 *
 * Ownership is always `req.user.id`: every query is scoped by userId first, so
 * a filter can only narrow a result set, never widen it into another user's
 * data (§20).
 */

export const REPORT_TYPES = Object.freeze([
  'monthly',
  'yearly',
  'transactions',
  'categories',
  'budgets',
  'accounts'
]);

/** Canonical empty-report message (§24). */
export const NO_DATA_MESSAGE = 'No financial data is available for the selected period.';

/** Preview cap for the transactions report (CSV export streams everything). */
const TRANSACTIONS_PREVIEW_LIMIT = 50;

/**
 * Turn the shared query params into a resolved range + filter set.
 * `resolveRange` validates the period/dates and `buildTransactionWhere`
 * validates the rest, so every report inherits identical validation.
 */
const resolveContext = (query) => {
  const {
    period,
    startDate,
    endDate,
    accountId,
    categoryId,
    type,
    minAmount,
    maxAmount,
    search
  } = query;

  // resolveRange defaults period to 'this_month', which would ignore custom
  // startDate/endDate. Use 'custom' when dates are given without a period.
  const effectivePeriod = period || (startDate || endDate ? 'custom' : 'this_month');
  const range = resolveRange({ period: effectivePeriod, startDate, endDate });
  const filters = { accountId, categoryId, type, minAmount, maxAmount, search };

  return { range, filters };
};

/** The shared where-clause for a report: user + range + optional filters. */
const reportWhere = (userId, range, filters) =>
  buildTransactionWhere(userId, {
    ...filters,
    startDate: range.startISO,
    endDate: range.endInclusiveISO
  });

const periodShape = (range) => ({
  startISO: range.startISO,
  endInclusiveISO: range.endInclusiveISO,
  label: range.label
});

const emptyState = (report) => ({
  ...report,
  hasData: false,
  message: NO_DATA_MESSAGE
});

/* ------------------------------------------------------------------ */
/* Monthly financial report (§4)                                       */
/* ------------------------------------------------------------------ */
const getMonthlyReport = async (userId, query) => {
  const { range, filters } = resolveContext(query);

  const [summary, budget, categorySpending, largest] = await Promise.all([
    getTransactionSummary(userId, {
      ...filters,
      startDate: range.startISO,
      endDate: range.endInclusiveISO
    }),
    // Budgets are month-scoped in Phase 4, so the budget section always
    // reflects the month the report period ends in.
    getBudgetOverview(userId, monthAtEnd(range)),
    getCategorySpending(userId, range, filters),
    getTransactions(userId, {
      ...filters,
      startDate: range.startISO,
      endDate: range.endInclusiveISO,
      sortBy: 'amount',
      sortOrder: 'desc',
      page: 1,
      limit: 5
    })
  ]);

  // getTransactionSummary always computes both types; when the user filters
  // by type, zero out the other side so the report respects the filter.
  if (filters.type === 'INCOME') {
    summary.totalExpenses = 0;
    summary.netSavings = summary.totalIncome;
  } else if (filters.type === 'EXPENSE') {
    summary.totalIncome = 0;
    summary.netSavings = -summary.totalExpenses;
  }

  const { savingsRate } = getSavingsRate(summary.totalIncome, summary.totalExpenses);

  const report = {
    type: 'monthly',
    period: periodShape(range),
    summary: {
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netSavings: summary.netSavings,
      savingsRate
    },
    budget: {
      month: budget.month,
      year: budget.year,
      monthLabel: budget.monthLabel,
      budgetCount: budget.budgetCount,
      totalBudget: budget.totals.totalBudget,
      totalSpent: budget.totals.totalSpent,
      usagePercent: budget.totals.usagePercent,
      status: budget.totals.status
    },
    topCategories: categorySpending.topCategories,
    largestTransactions: largest.transactions
  };

  const hasData =
    summary.totalIncome > 0 ||
    summary.totalExpenses > 0 ||
    budget.budgetCount > 0;

  return hasData ? { ...report, hasData: true, message: null } : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Yearly financial report (§5)                                        */
/* ------------------------------------------------------------------ */
const getYearlyReport = async (userId, query) => {
  const { range, filters } = resolveContext(query);

  // enumerateBuckets always covers the range exactly, so months without
  // transactions appear as zero rows instead of being omitted or mislabelled.
  const buckets = enumerateBuckets(range, 'month');
  const values = await Promise.all(
    buckets.map((bucket) => fetchTypeTotals(userId, bucket.start, bucket.end, filters))
  );

  const months = buckets.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    income: values[index].income,
    expenses: values[index].expense,
    savings: round2(values[index].income - values[index].expense)
  }));

  const totalIncome = round2(months.reduce((sum, m) => sum + m.income, 0));
  const totalExpenses = round2(months.reduce((sum, m) => sum + m.expenses, 0));
  const totalSavings = round2(totalIncome - totalExpenses);
  const monthCount = months.length;
  const { savingsRate } = getSavingsRate(totalIncome, totalExpenses);

  const report = {
    type: 'yearly',
    period: periodShape(range),
    summary: {
      totalIncome,
      totalExpenses,
      totalSavings,
      averageMonthlyIncome: round2(totalIncome / monthCount),
      averageMonthlyExpenses: round2(totalExpenses / monthCount),
      averageMonthlySavings: round2(totalSavings / monthCount),
      savingsRate
    },
    months
  };

  const hasData = totalIncome > 0 || totalExpenses > 0;
  return hasData ? { ...report, hasData: true, message: null } : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Transaction report (§6) — reuses the transaction query layer         */
/* ------------------------------------------------------------------ */
export const TRANSACTION_REPORT_COLUMNS = Object.freeze([
  'Date',
  'Description',
  'Category',
  'Account',
  'Type',
  'Amount',
  'Notes'
]);

const getTransactionsReport = async (userId, query) => {
  const { range, filters } = resolveContext(query);

  const result = await getTransactions(userId, {
    ...filters,
    startDate: range.startISO,
    endDate: range.endInclusiveISO,
    sortBy: 'date',
    sortOrder: 'desc',
    page: 1,
    limit: TRANSACTIONS_PREVIEW_LIMIT
  });

  const report = {
    type: 'transactions',
    period: periodShape(range),
    columns: TRANSACTION_REPORT_COLUMNS,
    items: result.transactions,
    total: result.pagination.total
  };

  return result.pagination.total > 0
    ? { ...report, hasData: true, message: null }
    : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Category spending report (§7)                                      */
/* ------------------------------------------------------------------ */
const getCategoriesReport = async (userId, query) => {
  const { range, filters } = resolveContext(query);
  const spending = await getCategorySpending(userId, range, filters);

  const report = {
    type: 'categories',
    period: periodShape(range),
    categories: spending.categories,
    totalExpenses: spending.totalExpenses
  };

  return spending.hasExpenses
    ? { ...report, hasData: true, message: null }
    : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Budget report (§8) — Phase 4 budget service, untouched              */
/* ------------------------------------------------------------------ */
const getBudgetsReport = async (userId, query) => {
  const { range } = resolveContext(query);
  const overview = await getBudgetOverview(userId, monthAtEnd(range));

  const report = {
    type: 'budgets',
    period: periodShape(range),
    month: overview.month,
    year: overview.year,
    monthLabel: overview.monthLabel,
    budgets: overview.budgets,
    totals: overview.totals
  };

  return overview.budgetCount > 0
    ? { ...report, hasData: true, message: null }
    : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Account report (§9)                                                 */
/* ------------------------------------------------------------------ */
const getAccountsReport = async (userId, query) => {
  const { range, filters } = resolveContext(query);
  const where = reportWhere(userId, range, filters);

  const [accounts, grouped, transferOut, transferIn] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' }
    }),
    prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where,
      _sum: { amount: true },
      _count: { _all: true }
    }),
    // Transfers live in their own table, so they can never leak into the
    // income/expense columns — they are reported separately (§9).
    prisma.transfer.groupBy({
      by: ['fromAccountId'],
      where: { userId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true }
    }),
    prisma.transfer.groupBy({
      by: ['toAccountId'],
      where: { userId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true }
    })
  ]);

  const incomeByAccount = new Map();
  const expenseByAccount = new Map();
  const countByAccount = new Map();
  for (const row of grouped) {
    if (row.type === 'INCOME') incomeByAccount.set(row.accountId, round2(row._sum.amount ?? 0));
    if (row.type === 'EXPENSE') expenseByAccount.set(row.accountId, round2(row._sum.amount ?? 0));
    countByAccount.set(row.accountId, (countByAccount.get(row.accountId) ?? 0) + row._count._all);
  }
  const transferOutMap = new Map(transferOut.map((r) => [r.fromAccountId, round2(r._sum.amount ?? 0)]));
  const transferInMap = new Map(transferIn.map((r) => [r.toAccountId, round2(r._sum.amount ?? 0)]));

  const rows = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance,
    income: incomeByAccount.get(account.id) ?? 0,
    expenses: expenseByAccount.get(account.id) ?? 0,
    transactionCount: countByAccount.get(account.id) ?? 0,
    transfersIn: transferInMap.get(account.id) ?? 0,
    transfersOut: transferOutMap.get(account.id) ?? 0
  }));

  const report = {
    type: 'accounts',
    period: periodShape(range),
    accounts: rows
  };

  const hasData = rows.some(
    (row) => row.income > 0 || row.expenses > 0 || row.transactionCount > 0
  );
  return hasData ? { ...report, hasData: true, message: null } : emptyState(report);
};

/* ------------------------------------------------------------------ */
/* Dispatcher + history (§18)                                          */
/* ------------------------------------------------------------------ */
const REPORT_BUILDERS = {
  monthly: getMonthlyReport,
  yearly: getYearlyReport,
  transactions: getTransactionsReport,
  categories: getCategoriesReport,
  budgets: getBudgetsReport,
  accounts: getAccountsReport
};

export const getReport = async (userId, type, query) => {
  const builder = REPORT_BUILDERS[type];
  if (!builder) {
    throw new AppError(`Report type must be one of: ${REPORT_TYPES.join(', ')}`, 400);
  }
  return builder(userId, query);
};

/**
 * Record that a report was generated. Stores ONLY the parameters — never the
 * generated content (§18). A history write must never fail the report itself,
 * so errors are logged and swallowed.
 */
export const recordReportHistory = async (userId, { type, format, startDate, endDate }) => {
  try {
    await prisma.reportHistory.create({
      data: { userId, type, format, startDate, endDate }
    });
  } catch (error) {
    console.error('Failed to record report history:', error.message);
  }
};

export const getReportHistory = async (userId, { page= 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [history, total] = await Promise.all([
    prisma.reportHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum
    }),
    prisma.reportHistory.count({ where: { userId } })
  ]);

  return {
    history,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  };
};
