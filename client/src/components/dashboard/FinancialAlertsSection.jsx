import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notificationApi } from '../../services/notificationApi';
import { formatDate } from '../../utils/format';
import Section from './Section';
import { ListSkeleton } from './Skeleton';

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

/**
 * Financial Alerts section for the dashboard (Phase 9 §30).
 *
 * Small by design: the 5 most recent alert-type notifications (budget,
 * payment, goal and low balance — never SYSTEM), with a "View all" link.
 * Fetched once on mount; no polling, no period dependency.
 */
export default function FinancialAlertsSection() {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await notificationApi.list({
          limit: 5,
          types: 'BUDGET_WARNING,BUDGET_EXCEEDED,UPCOMING_PAYMENT,PAYMENT_FAILED,GOAL_COMPLETED,GOAL_DEADLINE,LOW_BALANCE'
        });
        if (!cancelled) setAlerts(result.notifications);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err?.message || 'Failed to load alerts');
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      title="Financial Alerts"
      subtitle="Recent alerts and reminders"
      action={(
        <Link
          to="/notifications"
          className="text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          View all
        </Link>
      )}
      loading={!alerts && !error}
      error={error}
      empty={Boolean(alerts) && alerts.length === 0}
      emptyTitle="No financial alerts."
      emptyDescription="Budget warnings, payment reminders and goal alerts will appear here."
      skeleton={<ListSkeleton rows={3} label="Loading financial alerts…" />}
    >
      {alerts && alerts.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-base flex-shrink-0" aria-hidden="true">
                {TYPE_ICONS[alert.type] || 'ℹ️'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm text-gray-900 truncate ${alert.isRead ? 'font-normal' : 'font-semibold'}`}>
                  {alert.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(alert.createdAt)}</p>
              </div>
              {!alert.isRead && (
                <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" aria-label="Unread" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
