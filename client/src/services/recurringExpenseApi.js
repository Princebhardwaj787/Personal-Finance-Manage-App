import api from './api';

export const recurringExpenseApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/recurring-expenses?${query}`);
    return response.data;
  },

  /**
   * Phase 7: ask the backend to generate every occurrence that is due as of
   * `asOfDate` (body: { asOfDate?, maxCatchUp?, dryRun? }). Running this twice
   * for the same date creates nothing the second time — idempotency lives in
   * the service, not in this caller.
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

export default recurringExpenseApi;
