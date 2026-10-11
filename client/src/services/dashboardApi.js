import api from './api';

/**
 * Dashboard endpoints (§15). Every call accepts the same `{ period, startDate,
 * endDate }` shape so one selected period drives the whole dashboard.
 * These are thin wrappers — all maths happens on the server.
 */
export const dashboardApi = {
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

export default dashboardApi;
