import api, { buildQuery } from './api';
import { isNativeBuild } from './platform';
import { localTransactionApi } from './localApi';

/**
 * Transaction API.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 *
 * Filtering, searching, sorting and paging are done in SQL on both paths.
 */
const httpTransactionApi = {
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

export const transactionApi = isNativeBuild() ? localTransactionApi : httpTransactionApi;

export default transactionApi;
