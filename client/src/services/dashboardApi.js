import api from './api';
import { isNativeBuild } from './platform';
import { localDashboardApi } from './localApi';

/**
 * Dashboard endpoints. Every call accepts the same `{ period, startDate,
 * endDate }` shape so one selected period drives the whole dashboard.
 *
 * These are thin wrappers — all maths happens in the service layer.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads the on-device SQLite database.
 */
const httpDashboardApi = {
  summary(params = {}) {
    return api.get('/dashboard/summary', { params }).then((response) => response.data);
  },

  /** Recent transactions + savings goals + upcoming payments in one call. */
  widgets(params = {}) {
    return api.get('/dashboard/widgets', { params }).then((response) => response.data);
  },

  /** Budget totals, per-category budgets and descriptive alerts. */
  budgetOverview(params = {}) {
    return api.get('/dashboard/budget-overview', { params }).then((response) => response.data);
  },

  recentTransactions(limit = 10) {
    return api.get(`/dashboard/recent-transactions?limit=${limit}`).then((response) => response.data);
  }
};

export const dashboardApi = isNativeBuild() ? localDashboardApi : httpDashboardApi;

export default dashboardApi;
