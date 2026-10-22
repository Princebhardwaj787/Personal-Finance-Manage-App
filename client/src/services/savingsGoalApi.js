import api from './api';
import { isNativeBuild } from './platform';
import { localSavingsGoalApi } from './localApi';

/**
 * Savings goal API.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 */
const httpSavingsGoalApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/savings-goals?${query}`);
    return response.data;
  },

  async summary() {
    const response = await api.get('/savings-goals/summary');
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/savings-goals/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/savings-goals', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/savings-goals/${id}`, data);
    return response.data;
  },

  async remove(id) {
    const response = await api.delete(`/savings-goals/${id}`);
    return response.data;
  },

  async addContribution(id, data) {
    const response = await api.post(`/savings-goals/${id}/contributions`, data);
    return response.data;
  },

  async listContributions(id, params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/savings-goals/${id}/contributions?${query}`);
    return response.data;
  }
};

export const savingsGoalApi = isNativeBuild() ? localSavingsGoalApi : httpSavingsGoalApi;

export default savingsGoalApi;
