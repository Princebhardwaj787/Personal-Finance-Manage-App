import {
  getIncomeExpenseTrend,
  getCategorySpending,
  getMonthlyTrend
} from '../services/analyticsService.js';
import { resolveRange } from '../utils/dateRange.js';

/** Shared `{ period, startDate, endDate }` -> explicit `[start, end)` range. */
export const rangeFromQuery = (query = {}) =>
  resolveRange({
    period: query.period,
    startDate: query.startDate,
    endDate: query.endDate
  });

/** GET /api/analytics/income-expenses */
export const incomeExpenses = async (req, res, next) => {
  try {
    const range = rangeFromQuery(req.query);
    const data = await getIncomeExpenseTrend(req.user.id, range, req.query.granularity);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

/** GET /api/analytics/category-spending */
export const categorySpending = async (req, res, next) => {
  try {
    const range = rangeFromQuery(req.query);
    const data = await getCategorySpending(req.user.id, range);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

/** GET /api/analytics/monthly-trends?months=12 */
export const monthlyTrends = async (req, res, next) => {
  try {
    const data = await getMonthlyTrend(req.user.id, req.query.months);
    res.json(data);
  } catch (error) {
    next(error);
  }
};
