import api from './api';

export const budgetApi = {
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

export default budgetApi;
