/**
 * LOCAL REPORT SERVICE (Android conversion â€” Phase C)
 * ===================================================
 * The on-device counterpart of `server/src/services/reportService.js` and
 * `reportExport.js`.
 *
 * Reports are assembled from the SAME local services the dashboard uses, so a
 * report can never disagree with the dashboard.
 *
 * Exports are produced on the device:
 *   - CSV: RFC-4180 text, BOM-prefixed for Excel.
 *   - PDF: a valid PDF written by the dependency-free `pdfWriter`.
 */

import { AppError } from '@shared/AppError.js';
import { round2 } from '@shared/goalCalculator.js';
import { fromMinorUnits } from '@shared/money.js';
import { enumerateBuckets, monthAtEnd, resolveRange } from '@shared/dateRange.js';
import { buildReportPdf } from './pdfWriter.js';

export const REPORT_TYPES = Object.freeze([
  'monthly',
  'yearly',
  'transactions',
  'categories',
  'budgets',
  'accounts'
]);

export const NO_DATA_MESSAGE = 'No financial data is available for the selected period.';

/** UTF-8 byte order mark — makes Excel read the CSV as UTF-8. */
const BOM = '\uFEFF';

const TRANSACTIONS_PREVIEW_LIMIT = 50;

/** RFC-4180 escaping. */
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (cells) => cells.map(csvCell).join(',');

/** Share the context builder with the server: same period + filter rules. */
const resolveContext = (query = {}) => {
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

  const effectivePeriod = period || (startDate || endDate ? 'custom' : 'this_month');
  const range = resolveRange({ period: effectivePeriod, startDate, endDate });
  const filters = { accountId, categoryId, type, minAmount, maxAmount, search };

  return { range, filters };
};

const periodShape = (range) => ({
  startISO: range.startISO,
  endInclusiveISO: range.endInclusiveISO,
  label: range.label
});

const emptyState = (report) => ({ ...report, hasData: false, message: NO_DATA_MESSAGE });

/** Build the shared WHERE clause for a report. */
const reportWhere = (db, userId, range, filters) => {
  const transactionService = db.__transactionService;
  const { where, params } = transactionService.buildTransactionWhere(userId, {
    ...filters,
    startDate: range.startISO,
    endDate: range.endInclusiveISO
  });
  return { where, params };
};

export const createReportService = (db, deps = {}) => {
  const { transactionService, budgetService, analyticsService } = deps;
  // The WHERE builder lives in the transaction service; keep a reference so
  // the report layer does not re-implement it.
  db.__transactionService = transactionService;

  const getMonthlyReport = async (userId, query) => {
    const { range, filters } = resolveContext(query);

    const [summary, budget, categorySpending, largest] = await Promise.all([
      transactionService.getTransactionSummary(userId, {
        ...filters,
        startDate: range.startISO,
        endDate: range.endInclusiveISO
      }),
      budgetService.getBudgetOverview(userId, monthAtEnd(range)),
      analyticsService.getCategorySpending(userId, range, filters),
      transactionService.getTransactions(userId, {
        ...filters,
        startDate: range.startISO,
        endDate: range.endInclusiveISO,
        sortBy: 'amount',
        sortOrder: 'desc',
        page: 1,
        limit: 5
      })
    ]);

    if (filters.type === 'INCOME') {
      summary.totalExpenses = 0;
      summary.netSavings = summary.totalIncome;
    } else if (filters.type === 'EXPENSE') {
      summary.totalIncome = 0;
      summary.netSavings = -summary.totalExpenses;
    }

    const report = {
      type: 'monthly',
      period: periodShape(range),
      summary: {
        totalIncome: summary.totalIncome,
        totalExpenses: summary.totalExpenses,
        netSavings: summary.netSavings,
        savingsRate:
          summary.totalIncome > 0
            ? round2((summary.netSavings / summary.totalIncome) * 100)
            : null
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
      summary.totalIncome > 0 || summary.totalExpenses > 0 || budget.budgetCount > 0;

    return hasData ? { ...report, hasData: true, message: null } : emptyState(report);
  };

  const getYearlyReport = async (userId, query) => {
    const { range, filters } = resolveContext(query);

    const buckets = enumerateBuckets(range, 'month');
    const values = await Promise.all(
      buckets.map(async (bucket) => {
        const clauses = [
          'userId = ?',
          'date >= ?',
          'date < ?',
          "type IN ('INCOME','EXPENSE')"
        ];
        const params = [
          userId,
          bucket.start.toISOString(),
          bucket.end.toISOString()
        ];

        // The same filters the transaction list understands.
        if (filters.accountId) {
          clauses.push('accountId = ?');
          params.push(filters.accountId);
        }
        if (filters.categoryId) {
          clauses.push('categoryId = ?');
          params.push(filters.categoryId);
        }
        if (filters.type) {
          clauses.push('type = ?');
          params.push(filters.type);
        }

        const rows = await db.select(
          `SELECT type, SUM(amount) AS total FROM "Transaction"
           WHERE ${clauses.join(' AND ')} GROUP BY type`,
          params
        );
        const byType = Object.fromEntries(
          rows.map((row) => [row.type, fromMinorUnits(Number(row.total ?? 0))])
        );
        return { income: byType.INCOME ?? 0, expense: byType.EXPENSE ?? 0 };
      })
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
    const monthCount = months.length || 1;

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
        savingsRate: totalIncome > 0 ? round2((totalSavings / totalIncome) * 100) : null
      },
      months
    };

    const hasData = totalIncome > 0 || totalExpenses > 0;
    return hasData ? { ...report, hasData: true, message: null } : emptyState(report);
  };

  const getTransactionsReport = async (userId, query) => {
    const { range, filters } = resolveContext(query);

    const result = await transactionService.getTransactions(userId, {
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
      columns: ['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Notes'],
      items: result.transactions,
      total: result.pagination.total
    };

    return result.pagination.total > 0
      ? { ...report, hasData: true, message: null }
      : emptyState(report);
  };

  const getCategoriesReport = async (userId, query) => {
    const { range, filters } = resolveContext(query);
    const spending = await analyticsService.getCategorySpending(userId, range, filters);

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

  const getBudgetsReport = async (userId, query) => {
    const { range } = resolveContext(query);
    const overview = await budgetService.getBudgetOverview(userId, monthAtEnd(range));

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

  const getAccountsReport = async (userId, query) => {
    const { range, filters } = resolveContext(query);
    const { where, params } = reportWhere(db, userId, range, filters);

    const [accounts, grouped, transferOut, transferIn] = await Promise.all([
      db.select('SELECT id, name, type, balance FROM "Account" WHERE userId = ? ORDER BY name ASC', [userId]),
      db.select(
        `SELECT accountId, type, SUM(amount) AS total, COUNT(*) AS c
         FROM "Transaction" t
         LEFT JOIN "Account" a ON a.id = t.accountId
         LEFT JOIN "Category" c ON c.id = t.categoryId
         WHERE ${where}
         GROUP BY accountId, type`,
        params
      ),
      db.select(
        'SELECT "fromAccountId" AS accountId, SUM(amount) AS total FROM "Transfer" WHERE userId = ? AND date >= ? AND date < ? GROUP BY "fromAccountId"',
        [userId, range.start.toISOString(), range.end.toISOString()]
      ),
      db.select(
        'SELECT "toAccountId" AS accountId, SUM(amount) AS total FROM "Transfer" WHERE userId = ? AND date >= ? AND date < ? GROUP BY "toAccountId"',
        [userId, range.start.toISOString(), range.end.toISOString()]
      )
    ]);

    const incomeByAccount = new Map();
    const expenseByAccount = new Map();
    const countByAccount = new Map();
    for (const row of grouped) {
      const total = fromMinorUnits(Number(row.total ?? 0));
      if (row.type === 'INCOME') incomeByAccount.set(row.accountId, total);
      if (row.type === 'EXPENSE') expenseByAccount.set(row.accountId, total);
      countByAccount.set(row.accountId, (countByAccount.get(row.accountId) ?? 0) + Number(row.c ?? 0));
    }
    const transferOutMap = new Map(
      transferOut.map((r) => [r.accountId, fromMinorUnits(Number(r.total ?? 0))])
    );
    const transferInMap = new Map(
      transferIn.map((r) => [r.accountId, fromMinorUnits(Number(r.total ?? 0))])
    );

    const rows = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: fromMinorUnits(account.balance),
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

  const BUILDERS = {
    monthly: getMonthlyReport,
    yearly: getYearlyReport,
    transactions: getTransactionsReport,
    categories: getCategoriesReport,
    budgets: getBudgetsReport,
    accounts: getAccountsReport
  };

  const getReport = async (userId, type, query) => {
    const builder = BUILDERS[type];
    if (!builder) {
      throw new AppError(`Report type must be one of: ${REPORT_TYPES.join(', ')}`, 400);
    }
    return builder(userId, query);
  };

  return {
    REPORT_TYPES,

    getReport,

    /** Record that a report was generated (parameters only, never content). */
    async recordReportHistory(userId, { type, format, startDate, endDate }) {
      try {
        await db.execute(
          `INSERT INTO "ReportHistory" (id, userId, type, format, "startDate", "endDate", "createdAt")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `r${Date.now()}${Math.floor(Math.random() * 1e6)}`,
            userId,
            type,
            format,
            startDate,
            endDate,
            new Date().toISOString()
          ]
        );
      } catch {
        // A history write must never fail the report itself.
      }
    },

    async getReportHistory(userId, { page = 1, limit = 20 } = {}) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

      const [history, totalRows] = await Promise.all([
        db.select(
          'SELECT * FROM "ReportHistory" WHERE userId = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?',
          [userId, limitNum, (pageNum - 1) * limitNum]
        ),
        db.select('SELECT COUNT(*) AS c FROM "ReportHistory" WHERE userId = ?', [userId])
      ]);
      const total = Number(totalRows[0]?.c ?? 0);

      return {
        history,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1
        }
      };
    },

    /* ------------------------------------------------------------------ */
    /* Exports                                                            */
    /* ------------------------------------------------------------------ */

    /** CSV text for a report (BOM-prefixed so Excel reads UTF-8). */
    async exportCsv(userId, type, query) {
      const { range, filters } = resolveContext(query);
      const { where, params } = reportWhere(db, userId, range, filters);

      if (type === 'transactions') {
        const rows = await db.select(
          `SELECT t.date, t.description, c.name AS categoryName, a.name AS accountName,
                  t.type, t.amount, t.notes
           FROM "Transaction" t
           LEFT JOIN "Account" a ON a.id = t.accountId
           LEFT JOIN "Category" c ON c.id = t.categoryId
           WHERE ${where}
           ORDER BY t.date ASC`,
          params
        );

        const lines = [
          csvRow(['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Notes'])
        ];
        for (const row of rows) {
          lines.push(
            csvRow([
              String(row.date).slice(0, 10),
              row.description ?? '',
              row.categoryName ?? 'Uncategorized',
              row.accountName ?? '',
              row.type,
              fromMinorUnits(row.amount).toFixed(2),
              row.notes ?? ''
            ])
          );
        }
        return { text: `${BOM}${lines.join('\r\n')}\r\n`, filename: `transactions-${range.startISO}.csv` };
      }

      if (type === 'categories') {
        const report = await getReport(userId, 'categories', query);
        const lines = [
          csvRow(['Category', 'Total Amount', 'Percentage of Expenses', 'Number of Transactions'])
        ];
        for (const cat of report.categories ?? []) {
          lines.push(
            csvRow([
              cat.name,
              cat.amount.toFixed(2),
              cat.sharePercent,
              cat.count
            ])
          );
        }
        return { text: `${BOM}${lines.join('\r\n')}\r\n`, filename: `categories-${range.startISO}.csv` };
      }

      if (type === 'budgets') {
        const report = await getReport(userId, 'budgets', query);
        const lines = [csvRow(['Category', 'Budget', 'Spent', 'Remaining', 'Usage %', 'Status'])];
        for (const budget of report.budgets ?? []) {
          lines.push(
            csvRow([
              budget.category?.name ?? 'Uncategorized',
              budget.budgetAmount.toFixed(2),
              budget.spentAmount.toFixed(2),
              budget.remainingAmount.toFixed(2),
              budget.percentageUsed,
              budget.status
            ])
          );
        }
        return { text: `${BOM}${lines.join('\r\n')}\r\n`, filename: `budgets-${range.startISO}.csv` };
      }

      if (type === 'accounts') {
        const report = await getReport(userId, 'accounts', query);
        const lines = [
          csvRow([
            'Account', 'Current Balance', 'Total Income', 'Total Expenses',
            'Number of Transactions', 'Transfers In', 'Transfers Out'
          ])
        ];
        for (const account of report.accounts ?? []) {
          lines.push(
            csvRow([
              account.name,
              account.balance.toFixed(2),
              account.income.toFixed(2),
              account.expenses.toFixed(2),
              account.transactionCount,
              account.transfersIn.toFixed(2),
              account.transfersOut.toFixed(2)
            ])
          );
        }
        return { text: `${BOM}${lines.join('\r\n')}\r\n`, filename: `accounts-${range.startISO}.csv` };
      }

      throw new AppError('CSV export is available for: transactions, categories, budgets, accounts', 400);
    },

    /** PDF bytes for the monthly / yearly reports. */
    async exportPdf(userId, type, query) {
      if (type !== 'monthly' && type !== 'yearly') {
        throw new AppError('PDF export is available for: monthly, yearly', 400);
      }

      const report = await getReport(userId, type, query);
      if (!report.hasData) {
        throw new AppError(NO_DATA_MESSAGE, 400);
      }

      const tables = [];
      if (type === 'monthly') {
        tables.push({
          title: 'Top spending categories',
          columns: ['Category', 'Amount'],
          rows: (report.topCategories ?? []).map((cat) => [
            cat.name,
            `Rs. ${cat.amount.toFixed(2)} (${cat.sharePercent}%)`
          ])
        });
        tables.push({
          title: 'Largest transactions',
          columns: ['Description', 'Amount'],
          rows: (report.largestTransactions ?? []).map((txn) => [
            txn.description || txn.type,
            `Rs. ${txn.amount.toFixed(2)}`
          ])
        });
      } else {
        tables.push({
          title: 'Monthly breakdown',
          columns: ['Month', 'Income / Expenses'],
          rows: (report.months ?? []).map((month) => [
            month.label,
            `Rs. ${month.income.toFixed(2)} / Rs. ${month.expenses.toFixed(2)}`
          ])
        });
      }

      const summary = Object.entries(report.summary).map(([label, value]) => ({
        label,
        value: typeof value === 'number' ? value.toFixed(2) : String(value)
      }));

      const bytes = buildReportPdf({
        title: `${report.period.label} Financial Report`,
        subtitle: 'All amounts in Indian Rupees (INR)',
        summary,
        tables
      });

      return { bytes, filename: `${type}-report-${rangeFilename(report.period)}.pdf` };
    }
  };
};

const rangeFilename = (period) => {
  const start = period.startISO.slice(0, 7);
  const end = period.endInclusiveISO.slice(0, 7);
  return start === end ? start : `${period.startISO}_${period.endInclusiveISO}`;
};

export default createReportService;

