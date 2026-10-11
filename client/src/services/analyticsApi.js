import api from './api';

/**
 * Analytics endpoints (§15). Each response is already aggregated by the
 * database, so these payloads stay small no matter how much history exists.
 */
export const analyticsApi = {
  incomeExpenses(params = {}) {
    return api.get('/analytics/income-expenses', { params }).then((response) => response.data);
  },

  /** Serves both the category chart (§7) and the top-categories list (§8). */
  categorySpending(params = {}) {
    return api.get('/analytics/category-spending', { params }).then((response) => response.data);
  },

  monthlyTrends(months = 12) {
    return api.get('/analytics/monthly-trends', { params: { months } }).then((response) => response.data);
  }
};

export default analyticsApi;
