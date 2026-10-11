import api, { buildQuery } from './api';

/**
 * Transaction query layer (Phase 7).
 *
 * `list(params)` is the single reusable entry point: filters, search, sort and
 * paging all travel to the server, where they are validated against a
 * whitelist and executed in SQL. A future CSV export reuses exactly the same
 * parameter shape — only the endpoint changes.
 */
export const transactionApi = {
  async list(params = {}) {
    const response = await api.get(`/transactions${buildQuery(params)}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/transactions/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/transactions', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/transactions/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/transactions/${id}`);
    return response.data;
  },

  /** Creates a brand new, independent transaction copied from `id`. */
  async duplicate(id, data = {}) {
    const response = await api.post(`/transactions/${id}/duplicate`, data);
    return response.data;
  },

  /** Deletes many at once; the server re-checks ownership of every id. */
  async bulkDelete(ids) {
    const response = await api.post('/transactions/bulk-delete', { ids });
    return response.data;
  },

  /** LEGACY: kept for older callers. Prefer transferApi.create — transfers
   *  now live in their own table and are never income/expense rows. */
  async createTransfer(data) {
    const response = await api.post('/transactions/transfer', data);
    return response.data;
  },

  async getSummary(params = {}) {
    const response = await api.get(`/transactions/summary${buildQuery(params)}`);
    return response.data;
  },

  async getCategoryBreakdown(params = {}) {
    const response = await api.get(`/transactions/category-breakdown${buildQuery(params)}`);
    return response.data;
  }
};
