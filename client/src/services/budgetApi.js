import api from './api';
import { isNativeBuild } from './platform';
import { localBudgetApi } from './localApi';

/**
 * Budget API.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 *
 * The budget status rules come from `shared/budgetCalculator.js`, so the two
 * platforms always agree.
 */
const httpBudgetApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/budgets?${query}`);
    return response.data;
  },

  async getCurrentMonth(month, year) {
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/budgets/current-month?${query}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/budgets/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/budgets', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/budgets/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/budgets/${id}`);
    return response.data;
  }
};

export const budgetApi = isNativeBuild() ? localBudgetApi : httpBudgetApi;

export default budgetApi;
