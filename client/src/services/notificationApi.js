import api, { buildQuery } from './api';
import { isNativeBuild } from './platform';
import { localNotificationApi } from './localApi';

/**
 * Notification API.
 *
 * All endpoints are scoped to the authenticated user by the server — the
 * client never sends a userId. On the device there is a single local user.
 *
 * WEB: talks to the Express API.
 * ANDROID: reads and writes the on-device SQLite database.
 */
const httpNotificationApi = {
  /** Paginated list, newest first. */
  async list(params = {}) {
    const response = await api.get(`/notifications${buildQuery(params)}`);
    return response.data;
  },

  /** Unread count for the bell badge. */
  async unreadCount() {
    const response = await api.get('/notifications/unread-count');
    return response.data;
  },

  /** Mark one notification read. */
  async markRead(id) {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },

  /** Mark all notifications read. */
  async markAllRead() {
    const response = await api.patch('/notifications/read-all');
    return response.data;
  },

  /** Delete one notification. */
  async remove(id) {
    const response = await api.delete(`/notifications/${id}`);
    return response.data;
  },

  /** Manually trigger the scheduled checks for the current user. */
  async process() {
    const response = await api.post('/notifications/process');
    return response.data;
  },

  /** Current preference toggles. */
  async getPreferences() {
    const response = await api.get('/notification-preferences');
    return response.data;
  },

  /** Persist preference toggles. */
  async updatePreferences(preferences) {
    const response = await api.put('/notification-preferences', preferences);
    return response.data;
  }
};

export const notificationApi = isNativeBuild() ? localNotificationApi : httpNotificationApi;

export default notificationApi;
