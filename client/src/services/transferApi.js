import api, { buildQuery } from './api';

/**
 * Transfer API (Phase 7 §B).
 *
 * Transfers move money between two of the user's own accounts and are stored
 * in their own table — they never become income or expense rows, so net worth
 * cannot change when money moves between your own accounts.
 *
 * The parameter shape mirrors `transactionApi.list` so both list screens feel
 * identical (and a future export can reuse it).
 */
export const transferApi = {
  async list(params = {}) {
    const response = await api.get(`/transfers${buildQuery(params)}`);
    return response.data;
  },

  async summary(params = {}) {
    const response = await api.get(`/transfers/summary${buildQuery(params)}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/transfers/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/transfers', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/transfers/${id}`, data);
    return response.data;
  },

  async remove(id) {
    const response = await api.delete(`/transfers/${id}`);
    return response.data;
  }
};

export default transferApi;
