import api from './api';
import { isNativeBuild } from './platform';
import { localRecurringExpenseApi } from './localApi';

/**
 * Recurring expense API.
 *
 * The idempotency guarantee lives in the service, not in this caller: running
 * the processor twice for the same date creates nothing the second time.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 */
const httpRecurringExpenseApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/recurring-expenses?${query}`);
    return response.data;
  },

  /**
   * Generate every occurrence that is due as of `asOfDate`
   * (body: { asOfDate?, maxCatchUp?, dryRun? }).
   */
  async process(body = {}) {
    const response = await api.post('/recurring-expenses/process', body);
    return response.data;
  },

  /** Occurrence log for one item: CREATED / FAILED rows with reasons. */
  async occurrences(id) {
    const response = await api.get(`/recurring-expenses/${id}/occurrences`);
    return response.data;
  },

  async summary(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/recurring-expenses/summary?${query}`);
    return response.data;
  },

  async upcoming(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/recurring-expenses/upcoming?${query}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/recurring-expenses/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/recurring-expenses', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/recurring-expenses/${id}`, data);
    return response.data;
  },

  async remove(id) {
    const response = await api.delete(`/recurring-expenses/${id}`);
    return response.data;
  }
};

export const recurringExpenseApi = isNativeBuild()
  ? localRecurringExpenseApi
  : httpRecurringExpenseApi;

export default recurringExpenseApi;
