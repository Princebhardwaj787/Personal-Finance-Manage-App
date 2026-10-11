import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { notificationApi } from '../../services/notificationApi';
import Button from '../../components/forms/Button';

const TOGGLES = [
  {
    key: 'budgetAlerts',
    label: 'Budget alerts',
    description: 'Warn when a category budget reaches 85% and alert when it exceeds 100%.'
  },
  {
    key: 'upcomingPayments',
    label: 'Upcoming payments',
    description: 'Remind you 7, 3 and 1 days before a recurring payment is due.'
  },
  {
    key: 'paymentProcessing',
    label: 'Payment processing',
    description: 'Notify you when a recurring payment is processed or fails.'
  },
  {
    key: 'savingsGoals',
    label: 'Savings goals',
    description: 'Celebrate completed goals and remind you of approaching deadlines.'
  },
  {
    key: 'lowBalance',
    label: 'Low balance',
    description: 'Alert when an account balance drops to or below its threshold.'
  }
];

/**
 * Notification settings page (Phase 9 §30).
 *
 * Five toggles that gate notification creation on the server — a disabled
 * category blocks creation entirely. Preferences persist in a single
 * NotificationPreference row per user.
 */
export default function NotificationSettings() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await notificationApi.getPreferences();
      setPreferences(result);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = useCallback((key) => {
    setPreferences((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
    setSuccess(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await notificationApi.updatePreferences(preferences);
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, [preferences]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose which notifications you want to receive. Changes are saved to your account.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">Preferences saved.</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {TOGGLES.map((toggle) => (
          <div key={toggle.key} className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-medium text-gray-900">{toggle.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{toggle.description}</p>
            </div>
            <button
              role="switch"
              aria-checked={preferences?.[toggle.key]}
              aria-label={toggle.label}
              onClick={() => handleToggle(toggle.key)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                preferences?.[toggle.key] ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  preferences?.[toggle.key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
        <Link to="/notifications" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          View notifications
        </Link>
      </div>
    </div>
  );
}
