import { prisma } from '../config/database.js';
import { resolveRange, monthAtEnd, monthLabel } from '../utils/dateRange.js';
import { fromMinorUnits } from '../utils/money.js';
import { getBudgetOverview } from '../services/budgetService.js';
import {
  getDashboardSummary,
  getWidgetData
} from '../services/analyticsService.js';

/** `{ period, startDate, endDate }` -> an explicit `[start, end)` range. */
const rangeFromQuery = (query = {}) =>
  resolveRange({
    period: query.period,
    startDate: query.startDate,
    endDate: query.endDate
  });

/**
 * GET /api/dashboard/summary
 *
 * Period-scoped cards: income, expenses, net savings and savings rate.
 * Point-in-time figures (total balance, savings goals, recurring totals) are
 * deliberately not period-scoped. Every value comes from a database aggregate
 * over an indexed column — historical transactions are never loaded.
 */
export const getSummary = async (req, res, next) => {
  try {
    const range = rangeFromQuery(req.query);
    res.json(await getDashboardSummary(req.user.id, range));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dashboard/widgets
 *
 * Recent transactions, active savings goals and upcoming payments in one
 * call. None of these depend on the selected period, so the frontend fetches
 * them once and never refetches them when the period changes.
 */
export const getWidgets = async (req, res, next) => {
  try {
    const data = await getWidgetData(req.user.id, {
      transactionLimit: req.query.transactionLimit,
      goalLimit: req.query.goalLimit,
      upcomingLimit: req.query.upcomingLimit
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dashboard/budget-overview
 *
 * Budgets are stored per calendar month, so an explicit `month`/`year` wins;
 * otherwise the month containing the period's END date is used (§10).
 * All the maths lives in budgetService — no second copy of budget logic.
 */
export const getBudgetOverviewController = async (req, res, next) => {
  try {
    let year;
    let month;
    let label;

    if (req.query.month && req.query.year) {
      month = parseInt(req.query.month, 10);
      year = parseInt(req.query.year, 10);
      label = monthLabel(year, month);
    } else {
      const range = rangeFromQuery(req.query);
      const target = monthAtEnd(range);
      month = target.month;
      year = target.year;
      label = monthLabel(year, month);
    }

    const overview = await getBudgetOverview(req.user.id, { month, year });
    res.json({ ...overview, monthLabel: overview.monthLabel || label });
  } catch (error) {
    next(error);
  }
};

/** GET /api/dashboard/recent-transactions?limit=10 */
export const getRecentTransactions = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        date: true,
        category: { select: { id: true, name: true, icon: true, color: true } }
      },
      orderBy: { date: 'desc' },
      take: limit
    });

    res.json({
      // Amounts are stored in minor units; convert to decimal for the client.
      transactions: transactions.map((txn) => ({
        ...txn,
        amount: fromMinorUnits(txn.amount)
      }))
    });
  } catch (error) {
    next(error);
  }
};
