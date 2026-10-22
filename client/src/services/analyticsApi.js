import api from './api';
import { isNativeBuild } from './platform';
import { localAnalyticsApi } from './localApi';

/**
 * Analytics endpoints. Each response is already aggregated by the
 * database, so these payloads stay small no matter how much history exists.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads the on-device SQLite database.
 */
const httpAnalyticsApi = {
  incomeExpenses(params = {}) {
    return api.get('/analytics/income-expenses', { params }).then((response) => response.data);
  },

  /** Serves both the category chart and the top-categories list. */
  categorySpending(params = {}) {
    return api.get('/analytics/category-spending', { params }).then((response) => response.data);
  },

  monthlyTrends(months = 12) {
    return api.get('/analytics/monthly-trends', { params: { months } }).then((response) => response.data);
  }
};

export const analyticsApi = isNativeBuild() ? localAnalyticsApi : httpAnalyticsApi;

export default analyticsApi;
