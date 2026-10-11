import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransfers, useTransferSummary } from '../hooks/useTransfers';
import { useAccounts } from '../hooks/useAccounts';
import Button from '../components/forms/Button';
import Input from '../components/forms/Input';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import ErrorState from '../ui/ErrorState';
import { formatMoney, formatDate } from '../utils/format';

/**
 * Transfers screen (Phase 7 §B).
 *
 * A transfer moves money between two of your own accounts. It is never income
 * and never an expense — total balance only changes when money enters or
 * leaves your wallet. Both accounts must belong to the signed-in user and the
 * source must have enough money; the server enforces both inside one atomic
 * transaction (both debits/credits or nothing).
 */
const DEFAULT_FILTERS = {
  search: '',
  accountId: '',
  startDate: '',
  endDate: '',
  sortBy: 'date',
  sortOrder: 'desc'
};

const LinkButton = ({ to, children }) => (
  <Link to={to} className="btn btn-secondary px-3 py-1.5 text-xs">{children}</Link>
);

/** Exported for tests; the page uses it through its default export. */
export function TransferFormModal({ open, onClose, transfer, accounts, onSubmit, submitting }) {
  const [formData, setFormData] = useState(() => ({
    fromAccountId: transfer?.fromAccountId || '',
    toAccountId: transfer?.toAccountId || '',
    amount: transfer?.amount ?? '',
    date: transfer ? transfer.date.split('T')[0] : new Date().toISOString().split('T')[0],
    description: transfer?.description || ''
  }));
  const [errors, setErrors] = useState({});

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));
  const accountById = (id) => accounts.find(a => a.id === id);
  const sourceBalance = accountById(formData.fromAccountId)?.balance ?? null;

  const validate = () => {
    const next = {};
    if (formData.amount === '' || Number(formData.amount) <= 0) {
      next.amount = 'Amount must be greater than 0';
    }
    if (!formData.fromAccountId) next.fromAccountId = 'Source account is required';
    if (!formData.toAccountId) next.toAccountId = 'Destination account is required';
    if (formData.fromAccountId && formData.fromAccountId === formData.toAccountId) {
      next.toAccountId = 'Source and destination must be different accounts';
    }
    if (sourceBalance !== null && Number(formData.amount) > sourceBalance) {
      next.amount = `Insufficient balance — ${accountById(formData.fromAccountId)?.name} holds ${formatMoney(sourceBalance)}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({
      fromAccountId: formData.fromAccountId,
      toAccountId: formData.toAccountId,
      amount: Number(formData.amount),
      date: formData.date,
      description: formData.description
    });
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={transfer ? 'Edit Transfer' : 'New Transfer'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          Transfers move money between your own accounts, so your total balance
          never changes — they are recorded separately from income and expenses.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="transfer-from">From account</label>
            <select
              id="transfer-from"
              value={formData.fromAccountId}
              onChange={(e) => set('fromAccountId', e.target.value)}
              className={`input ${errors.fromAccountId ? 'input-error' : ''}`}
              required
            >
              <option value="">Select source</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {sourceBalance !== null && (
              <p className="mt-1 text-xs text-gray-500">Available: {formatMoney(sourceBalance)}</p>
            )}
            {errors.fromAccountId && (
              <p className="mt-1 text-sm text-danger-600" role="alert">{errors.fromAccountId}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="transfer-to">To account</label>
            <select
              id="transfer-to"
              value={formData.toAccountId}
              onChange={(e) => set('toAccountId', e.target.value)}
              className={`input ${errors.toAccountId ? 'input-error' : ''}`}
              required
            >
              <option value="">Select destination</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.toAccountId && (
              <p className="mt-1 text-sm text-danger-600" role="alert">{errors.toAccountId}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={(e) => set('amount', e.target.value)}
            error={errors.amount}
            placeholder="0.00"
            required
          />
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </div>

        <Input
          label="Description"
          value={formData.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="e.g. Move to savings"
          maxLength={500}
        />

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {transfer ? 'Update Transfer' : 'Create Transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Transfers() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [banner, setBanner] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { accounts, fetchAccounts } = useAccounts();
  const { transfers, pagination, loading, error, createTransfer, updateTransfer, deleteTransfer, setPage, fetchTransfers } = useTransfers(filters);
  const { summary } = useTransferSummary(filters);

  const flash = (type, text) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 6000);
  };

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const handleSort = (field) => {
    setFilters(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await updateTransfer(editing.id, payload);
        flash('success', 'Transfer updated');
      } else {
        await createTransfer(payload);
        flash('success', 'Transfer created — balances updated, totals unchanged');
      }
      setShowForm(false);
      setEditing(null);
      await fetchAccounts();
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to save transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTransfer(deleting.id);
      flash('success', 'Transfer deleted and the balances were restored');
      setDeleting(null);
      await fetchAccounts();
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to delete transfer');
      setDeleting(null);
    }
  };

  const nameOf = (id, fallback) => accounts.find(a => a.id === id)?.name || fallback || '—';
  const hasFilters = Boolean(
    filters.search || filters.accountId || filters.startDate || filters.endDate
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="section-title">Transfers</h1>
          <p className="section-subtitle">
            Move money between your own accounts — total balance stays the same
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/transactions">Transactions</LinkButton>
          <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            New Transfer
          </Button>
        </div>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg text-sm flex justify-between ${
          banner.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          <span>{banner.text}</span>
          <button className="font-medium" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="p-4" className="bg-blue-50 border-blue-100">
          <p className="text-sm text-blue-700">Moved in range</p>
          <p className="text-2xl font-bold text-blue-800">{formatMoney(summary?.totalAmount ?? 0)}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm text-gray-500">Transfers in range</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.count ?? 0}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm text-gray-500">Effect on total balance</p>
          <p className="text-2xl font-bold text-gray-900">₹0</p>
          <p className="text-xs text-gray-400 mt-1">Money only moves between your accounts</p>
        </Card>
      </div>

      <Card padding="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Input
            label="Search"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            placeholder="Description or account name…"
          />
          <div>
            <label className="label" htmlFor="transfer-filter-account">Account</label>
            <select
              id="transfer-filter-account"
              value={filters.accountId}
              onChange={(e) => handleFilterChange('accountId', e.target.value)}
              className="input"
            >
              <option value="">Either side</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <Input
            label="From"
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="transfer-sort-by">Sort by</label>
              <select
                id="transfer-sort-by"
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="input"
              >
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="createdAt">Created</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="transfer-sort-order">Order</label>
              <select
                id="transfer-sort-order"
                value={filters.sortOrder}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                className="input"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-sm text-gray-500">
            Showing {transfers.length} of {pagination.total} transfers
          </p>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-40" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load transfers"
          description={error}
          onRetry={() => fetchTransfers(pagination.page)}
        />
      ) : transfers.length === 0 ? (
        <Card className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No transfers yet</h3>
          <p className="text-gray-500 mb-4">
            Move money between your accounts to keep balances accurate without
            touching income or expenses.
          </p>
          <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            New Transfer
          </Button>
        </Card>
      ) : (
        <>
          {/* Desktop / tablet */}
          <Card>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                    <th className="pb-3 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('date')}
                        className="inline-flex items-center gap-1 font-medium hover:text-gray-900"
                      >
                        Date {filters.sortBy === 'date' && (filters.sortOrder === 'asc' ? '▲' : '▼')}
                      </button>
                    </th>
                    <th className="pb-3 font-medium">From</th>
                    <th className="pb-3 font-medium">To</th>
                    <th className="pb-3 font-medium">Description</th>
                    <th className="pb-3 font-medium text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('amount')}
                        className="inline-flex items-center gap-1 font-medium hover:text-gray-900"
                      >
                        Amount {filters.sortBy === 'amount' && (filters.sortOrder === 'asc' ? '▲' : '▼')}
                      </button>
                    </th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transfers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="py-3 text-sm text-gray-900 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="py-3 text-sm text-gray-600">{t.fromAccount?.name || nameOf(t.fromAccountId)}</td>
                      <td className="py-3 text-sm text-gray-600">{t.toAccount?.name || nameOf(t.toAccountId)}</td>
                      <td className="py-3 text-sm text-gray-900">{t.description || '—'}</td>
                      <td className="py-3 text-sm font-semibold text-blue-700 text-right whitespace-nowrap">
                        {formatMoney(t.amount, t.fromAccount?.currency)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setShowForm(true); }}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting(t)}
                            className="text-danger-600 hover:bg-danger-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="sm:hidden divide-y divide-gray-100">
              {transfers.map(t => (
                <li key={t.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.description || 'Transfer'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(t.date)}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {t.fromAccount?.name || nameOf(t.fromAccountId)} → {t.toAccount?.name || nameOf(t.toAccountId)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-blue-700 shrink-0">
                      {formatMoney(t.amount, t.fromAccount?.currency)}
                    </p>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setShowForm(true); }}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(t)}
                      className="text-danger-600 hover:bg-danger-50"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage(pagination.page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      <TransferFormModal
        key={editing ? editing.id : 'new-transfer'}
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        transfer={editing}
        accounts={accounts}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete Transfer" size="sm">
        <p className="text-gray-600 mb-4">
          Delete this transfer? The money moves are reversed on both accounts.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          {deleting?.description || 'Transfer'} · {formatMoney(deleting?.amount, deleting?.fromAccount?.currency)}
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
