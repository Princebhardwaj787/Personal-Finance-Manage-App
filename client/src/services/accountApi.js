import api from './api';
import { isNativeBuild } from './platform';
import { localAccountApi } from './localApi';

/**
 * Account API.
 *
 * WEB: talks to the Express API.
 * ANDROID: talks to the on-device SQLite database through the local adapter.
 *
 * Both paths return the same shapes, so every page and hook above this layer
 * is identical in the web app and in the Android app.
 */
const httpAccountApi = {
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

export const accountApi = isNativeBuild() ? localAccountApi : httpAccountApi;

export default accountApi;
