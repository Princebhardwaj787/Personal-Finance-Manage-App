import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';
import { formatDate } from '../utils/format';
import Button from '../components/forms/Button';

const TYPE_ICONS = {
  BUDGET_WARNING: '⚠️',
  BUDGET_EXCEEDED: '🚨',
  UPCOMING_PAYMENT: '📅',
  PAYMENT_PROCESSED: '✅',
  PAYMENT_FAILED: '❌',
  GOAL_COMPLETED: '🎉',
  GOAL_DEADLINE: '🎯',
  LOW_BALANCE: '💰',
  SYSTEM: 'ℹ️'
};

const PRIORITY_BADGES = {
  INFO: 'bg-gray-100 text-gray-600',
  WARNING: 'bg-amber-100 text-amber-700',
  IMPORTANT: 'bg-red-100 text-red-700'
};

const PRIORITY_STYLES = {
  INFO: 'border-l-gray-300',
  WARNING: 'border-l-amber-400',
  IMPORTANT: 'border-l-red-500'
};

/**
 * Notifications page (Phase 9 §30).
 *
 * Full list with pagination, newest first. Unread items are distinguishable
 * by more than color: bold text, a dot marker, and a priority left border.
 * Actions: mark read, mark all read, delete. A "Refresh" button triggers
 * the scheduled checks on demand (idempotent).
 */
export default function Notifications() {
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const {
    notifications,
    pagination,
    loading,
    error,
    retry,
    markRead,
    markAllRead,
    remove
  } = useNotifications({ page, limit: 10 });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await retry();
    } finally {
      setRefreshing(false);
    }
  }, [retry]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your alerts, reminders and updates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleRefresh} loading={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            variant="secondary"
            onClick={markAllRead}
            disabled={!pagination || pagination.total === 0}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={retry} className="text-red-400 hover:text-red-600 ml-4" aria-label="Dismiss error">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No notifications yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Budget warnings, payment reminders and goal alerts will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`flex items-start gap-3 px-4 py-4 border-l-4 ${PRIORITY_STYLES[notification.priority] || PRIORITY_STYLES.INFO} ${
                  notification.isRead ? 'opacity-70' : ''
                }`}
              >
                <span className="text-lg flex-shrink-0 mt-0.5" aria-hidden="true">
                  {TYPE_ICONS[notification.type] || 'ℹ️'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!notification.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" aria-label="Unread" />
                    )}
                    <p className={`text-sm text-gray-900 ${notification.isRead ? 'font-normal' : 'font-semibold'}`}>
                      {notification.title}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGES[notification.priority] || PRIORITY_BADGES.INFO}`}>
                      {notification.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(notification.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!notification.isRead && (
                    <button
                      onClick={() => markRead(notification.id)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => remove(notification.id)}
                    className="text-xs font-medium text-red-500 hover:text-red-600"
                    aria-label={`Delete notification: ${notification.title}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pagination.totalPages}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="text-center">
        <Link to="/settings/notifications" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Notification settings
        </Link>
      </div>
    </div>
  );
}
