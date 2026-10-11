import { useState } from 'react';
import Card, { CardHeader, CardContent } from '../components/ui/Card';
import Button from '../components/forms/Button';
import Loading from '../components/ui/Loading';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Modal from '../components/ui/Modal';
import RecurringFormModal from '../components/recurring/RecurringFormModal';
import { useRecurringExpenses } from '../hooks/useRecurringExpenses';
import { recurringExpenseApi } from '../services/recurringExpenseApi';
import { formatCurrency, formatDate } from '../utils/format';

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Paused' },
  { value: 'all', label: 'All' }
];

const dueChip = (item) => {
  if (item.daysUntilDue < 0) return 'text-red-600';
  if (item.daysUntilDue <= 3) return 'text-yellow-700';
  return 'text-gray-500';
};

function SummaryCard({ label, value, sub }) {
  return (
    <Card padding="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
  );
}

export default function RecurringExpenses() {
  const {
    items, summary, upcoming, loading, error, status, setStatus,
    refresh, createItem, updateItem, deleteItem, toggleActive
  } = useRecurringExpenses();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [banner, setBanner] = useState(null);
  const [processing, setProcessing] = useState(false);

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (item) => { setEditing(item); setShowForm(true); };

  /**
   * Phase 7: trigger the backend processor. It creates a real transaction for
   * every due occurrence (skipping dates already processed), advances each
   * schedule, and reports anything it could not afford to pay. This button is
   * the only trigger — there is no scheduler in the browser.
   */
  const handleGenerate = async () => {
    setProcessing(true);
    try {
      const result = await recurringExpenseApi.process({});
      const failed = result.failed ?? 0;
      if (result.itemsDue === 0) {
        setBanner({ type: 'success', text: 'Nothing due — every schedule is already up to date' });
      } else if (failed > 0) {
        setBanner({
          type: 'error',
          text: `Created ${result.created} transaction(s), ${failed} failed and stayed on their due date — open the item to see the reason`
        });
      } else {
        setBanner({
          type: 'success',
          text: `Created ${result.created} transaction(s) from ${result.itemsDue} due schedule(s)`
        });
      }
      await refresh(status);
    } catch (err) {
      setBanner({ type: 'error', text: err.response?.data?.error || 'Failed to generate transactions' });
    } finally {
      setProcessing(false);
    }
  };

  const handleToggle = async (item) => {
    try {
      await toggleActive(item);
      setBanner({
        type: 'success',
        text: item.isActive
          ? `Paused ${item.name} — it stays saved and is excluded from totals`
          : `Resumed ${item.name}`
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.response?.data?.error || 'Failed to update' });
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteItem(deleting.id);
      setBanner({ type: 'success', text: `Deleted ${deleting.name}` });
      setDeleting(null);
    } catch (err) {
      setBanner({ type: 'error', text: err.response?.data?.error || 'Failed to delete' });
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Expenses</h1>
          <p className="text-gray-500 mt-1">
            Subscriptions and repeating payments. Generate them to turn every due
            date into a real transaction — running it twice never charges twice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerate}
            loading={processing}
            disabled={processing}
          >
            Generate due transactions
          </Button>
          <Button variant="primary" size="sm" onClick={openCreate}>+ Add Recurring Expense</Button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg text-sm flex justify-between ${
            banner.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          <span>{banner.text}</span>
          <button className="font-medium" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loading /></div>
      ) : error ? (
        <ErrorState title="Unable to load recurring expenses" description={error} onRetry={() => refresh(status)} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label="Active subscriptions" value={summary?.activeCount ?? 0} sub={`${summary?.pausedCount ?? 0} paused`} />
            <SummaryCard label="Monthly recurring cost" value={formatCurrency(summary?.monthlyCost ?? 0)} sub="Normalised across frequencies" />
            <SummaryCard label="Estimated yearly cost" value={formatCurrency(summary?.yearlyCost ?? 0)} sub="Based on active items" />
            <SummaryCard
              label="Upcoming payment"
              value={summary?.nextPayment ? formatCurrency(summary.nextPayment.amount) : '—'}
              sub={summary?.nextPayment
                ? `${summary.nextPayment.name} · ${formatDate(summary.nextPayment.nextDueDate)}`
                : 'No active payments'}
            />
          </div>

          <Card>
            <CardHeader
              title="Upcoming"
              subtitle={`Next ${summary?.windowDays ?? 30} days · sorted by due date`}
            />
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Nothing due in the next {summary?.windowDays ?? 30} days.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {upcoming.map((item) => (
                    <li key={item.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatDate(item.nextDueDate)} · {item.account?.name || 'Account'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount)}</p>
                        <p className={`text-xs ${dueChip(item)}`}>{item.dueLabel}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  status === f.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-sm text-gray-400 ml-auto">{items.length} shown</span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title={status === 'active' ? 'No active recurring expenses' : 'Nothing here'}
              description="Add Netflix, Spotify, gym, rent, internet or any other repeating payment to see your monthly commitments."
              showForm={() => { setStatus('active'); openCreate(); }}
              formTitle="Add Recurring Expense"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) => (
                <Card key={item.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatCurrency(item.amount)} / {item.frequencyLabel}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                        item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {item.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Next payment</span>
                      <span className={`font-medium ${dueChip(item)}`}>
                        {formatDate(item.nextDueDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account</span>
                      <span className="text-gray-900">{item.account?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Category</span>
                      <span className="text-gray-900">{item.category?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Yearly</span>
                      <span className="text-gray-900">{formatCurrency(item.yearlyAmount)}</span>
                    </div>
                  </div>

                  {item.description && (
                    <p className="mt-2 text-xs text-gray-400 line-clamp-2">{item.description}</p>
                  )}

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <Button
                      variant={item.isActive ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleToggle(item)}
                    >
                      {item.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleting(item)}>Delete</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <RecurringFormModal
        key={editing ? editing.id : 'new-recurring'}
        open={showForm}
        onClose={() => setShowForm(false)}
        item={editing}
        onSubmit={async (payload) => {
          if (editing) await updateItem(editing.id, payload);
          else await createItem(payload);
        }}
      />

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete Recurring Expense" size="sm">
        <p className="text-sm text-gray-600">
          Delete <strong>{deleting?.name}</strong>? Use Pause instead if you just want to stop counting it —
          paused items stay saved and can be resumed later.
        </p>
        <div className="flex justify-end space-x-3 mt-5">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
