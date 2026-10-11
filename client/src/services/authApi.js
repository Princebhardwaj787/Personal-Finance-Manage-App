import api from './api';

export const authApi = {
  async register(email, password, name) {
    const response = await api.post('/auth/register', { email, password, name });
    return response.data;
  },

  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  async getMe(token) {
    const response = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.user;
  },

  async updateProfile(data, token) {
    const response = await api.put('/auth/profile', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.user;
  },

  async updatePassword(currentPassword, newPassword, token) {
    const response = await api.put('/auth/password', { currentPassword, newPassword }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};