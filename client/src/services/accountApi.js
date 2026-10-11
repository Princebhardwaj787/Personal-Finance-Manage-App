import api from './api';

export const accountApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/accounts?${query}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/accounts/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/accounts', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/accounts/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/accounts/${id}`);
    return response.data;
  }
};