import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { notificationApi } from '../../services/notificationApi';
import { useUnreadCount } from '../../hooks/useNotifications';
import { formatDate } from '../../utils/format';

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

const PRIORITY_STYLES = {
  INFO: 'border-l-gray-300',
  WARNING: 'border-l-amber-400',
  IMPORTANT: 'border-l-red-500'
};

/**
 * Notification bell (Phase 9) — lives in the header.
 *
 * Shows the unread count badge, a compact preview of the latest
 * notifications, and a "View all notifications" link. Unread items are
 * distinguishable by more than color: bold text, a dot marker, and a
 * left border per priority. Clicking an unread item marks it read.
 *
 * The count is fetched on mount and refreshed after every action — no
 * polling (§30).
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState([]);
  const { unreadCount, refresh } = useUnreadCount();
  const location = useLocation();
  const dropdownRef = useRef(null);

  // Close the dropdown on navigation.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const loadPreview = async () => {
    try {
      const result = await notificationApi.list({ limit: 5 });
      setPreview(result.notifications);
    } catch {
      // Preview is best-effort; the badge count is the source of truth.
    }
  };

  useEffect(() => {
    loadPreview();
  }, [unreadCount]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
    if (!open) loadPreview();
  };

  const handleItemClick = async (notification) => {
    if (notification.isRead) return;
    try {
      await notificationApi.markRead(notification.id);
      await refresh();
      await loadPreview();
    } catch {
      // Ignore — the item stays unread and the count refreshes next load.
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-xs font-semibold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            {unreadCount > 0 && (
              <button
                onClick={async () => {
                  await notificationApi.markAllRead();
                  await refresh();
                  await loadPreview();
                }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {preview.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">No notifications yet.</p>
            ) : (
              preview.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleItemClick(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-4 ${PRIORITY_STYLES[notification.priority] || PRIORITY_STYLES.INFO} ${
                    notification.isRead ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0" aria-hidden="true">
                      {TYPE_ICONS[notification.type] || 'ℹ️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!notification.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" aria-label="Unread" />
                        )}
                        <p className={`text-sm text-gray-900 truncate ${notification.isRead ? 'font-normal' : 'font-semibold'}`}>
                          {notification.title}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(notification.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100">
            <Link
              to="/notifications"
              className="block text-center text-sm font-medium text-primary-600 hover:text-primary-700"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
