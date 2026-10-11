import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationApi } from '../services/notificationApi';

const messageFrom = (error) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  'Request failed';

/**
 * Notification state for one page or the bell preview.
 *
 * Fetches on mount and after every mutation so the unread count stays
 * accurate without any polling (§30: fetch on load, refresh after actions).
 */
export default function useNotifications({ page = 1, limit = 20 } = {}) {
  const [data, setData] = useState({ notifications: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await notificationApi.list({ page, limit });
      if (requestId !== requestIdRef.current) return; // superseded
      setData(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(messageFrom(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    load();
    return () => {
      // Invalidate in-flight requests on unmount or dep change.
      requestIdRef.current += 1;
    };
  }, [load]);

  const markRead = useCallback(async (id) => {
    await notificationApi.markRead(id);
    await load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    await notificationApi.markAllRead();
    await load();
  }, [load]);

  const remove = useCallback(async (id) => {
    await notificationApi.remove(id);
    await load();
  }, [load]);

  return {
    notifications: data.notifications,
    pagination: data.pagination,
    loading,
    error,
    retry: load,
    markRead,
    markAllRead,
    remove
  };
}

/**
 * Just the unread count — used by the bell badge in the header.
 */
export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await notificationApi.unreadCount();
      setUnreadCount(result.unreadCount);
    } catch {
      // A failed count fetch must never break the header.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { unreadCount, refresh };
}
