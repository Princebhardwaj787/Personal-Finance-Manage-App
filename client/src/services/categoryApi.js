import api from './api';
import { isNativeBuild } from './platform';
import { localCategoryApi } from './localApi';

/**
 * Category API.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 */
const httpCategoryApi = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const response = await api.get(`/categories?${query}`);
    return response.data;
  },

  async getByType(type) {
    const response = await api.get(`/categories/type/${type}`);
    return response.data;
  },

  async get(id) {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/categories', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  }
};

export const categoryApi = isNativeBuild() ? localCategoryApi : httpCategoryApi;

export default categoryApi;
