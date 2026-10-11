import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransactions, useTransactionSummary } from '../hooks/useTransactions';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import Button from '../components/forms/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import ErrorState from '../ui/ErrorState';
import TransactionFilters from '../components/transactions/TransactionFilters';
import TransactionTable from '../components/transactions/TransactionTable';
import TransactionFormModal from '../components/transactions/TransactionFormModal';
import TransactionDetailModal from '../components/transactions/TransactionDetailModal';
import { formatMoney } from '../utils/format';

/**
 * Transactions list (Phase 7 §D).
 *
 * Everything that could get expensive — search, filtering, sorting, totals and
 * paging — is requested from the server and executed in SQL. The page keeps no
 * copy of the full history: it renders the current page plus the server's
 * aggregate summary, so the numbers stay correct while paginating.
 */
const DEFAULT_FILTERS = {
  type: '',
  accountId: '',
  categoryId: '',
  startDate: '',
  endDate: '',
  minAmount: '',
  maxAmount: '',
  search: '',
  sortBy: 'date',
  sortOrder: 'desc'
};

/**
 * `/income` and `/expenses` redirect here as `/transactions?type=…`, so the
 * requested type is picked up on first render. Guarded for non-browser
 * rendering (SSR smoke tests) and for any junk value in the URL.
 */
const typeFromLocation = () => {
  if (typeof window === 'undefined' || !window.location) return '';
  const type = new URLSearchParams(window.location.search || '').get('type');
  return type === 'INCOME' || type === 'EXPENSE' ? type : '';
};

const LinkButton = ({ to, children, variant = 'secondary' }) => (
  <Link
    to={to}
    className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
  >
    {children}
  </Link>
);

export default function Transactions() {
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    type: typeFromLocation()
  }));
  const [selected, setSelected] = useState([]);
  const [banner, setBanner] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { accounts } = useAccounts();
  const expenseCategories = useCategories('EXPENSE');
  const incomeCategories = useCategories('INCOME');
  const {
    transactions, pagination, loading, error,
    createTransaction, updateTransaction, deleteTransaction,
    duplicateTransaction, bulkDeleteTransactions, setPage, fetchTransactions
  } = useTransactions(filters);
  const { summary } = useTransactionSummary(filters);

  const allCategories = useMemo(
    () => [...expenseCategories.categories, ...incomeCategories.categories],
    [expenseCategories.categories, incomeCategories.categories]
  );

  const flash = (type, text) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 6000);
  };

  /**
   * Changing filters only updates state: the `useTransactions` effect reacts
   * to the new object and refetches page 1 with the new filters. Calling
   * setPage() here too would fire a second, stale-filter request.
   */
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setSelected([]);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSelected([]);
  };

  const handleSort = (field) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    const pageIds = transactions.map((t) => t.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
    setSelected(allSelected ? [] : pageIds);
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (txn) => { setEditing(txn); setDetailId(null); setShowForm(true); };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, payload);
        flash('success', 'Transaction updated');
      } else {
        await createTransaction(payload);
        flash('success', 'Transaction created');
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (txn) => {
    try {
      const result = await duplicateTransaction(txn.id);
      flash('success', `Duplicated “${txn.description || txn.type}” into a new transaction of ${formatMoney(result.transaction.amount, result.transaction.account?.currency)}`);
      setDetailId(null);
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to duplicate transaction');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTransaction(deleting.id);
      flash('success', 'Transaction deleted and the account balance was corrected');
      setDeleting(null);
      setDetailId(null);
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to delete transaction');
      setDeleting(null);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      const result = await bulkDeleteTransactions(selected);
      flash('success', `Deleted ${result.deleted} transactions and corrected the affected balances`);
      setSelected([]);
      setBulkDeleting(false);
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to delete selected transactions');
      setBulkDeleting(false);
    }
  };

  const totalIncome = summary?.totalIncome ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const net = summary?.netSavings ?? totalIncome - totalExpenses;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="section-title">Transactions</h1>
          <p className="section-subtitle">Search, filter and manage your income and expenses</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/transfers">Transfers</LinkButton>
          <Button onClick={openCreate} variant="primary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Transaction
          </Button>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="p-4" className="bg-green-50 border-green-100">
          <p className="text-sm text-green-700">Income (filtered)</p>
          <p className="text-2xl font-bold text-green-800">{formatMoney(totalIncome)}</p>
        </Card>
        <Card padding="p-4" className="bg-danger-50 border-danger-100">
          <p className="text-sm text-danger-700">Expenses (filtered)</p>
          <p className="text-2xl font-bold text-danger-800">{formatMoney(totalExpenses)}</p>
        </Card>
        <Card padding="p-4" className="bg-blue-50 border-blue-100">
          <p className="text-sm text-blue-700">Net (filtered)</p>
          <p className={`text-2xl font-bold ${net >= 0 ? 'text-blue-800' : 'text-danger-800'}`}>
            {formatMoney(net)}
          </p>
        </Card>
      </div>

      <Card padding="p-4">
        <TransactionFilters
          filters={filters}
          accounts={accounts}
          categories={allCategories}
          onChange={handleFilterChange}
          onClear={clearFilters}
          pagination={pagination}
          count={transactions.length}
        />
      </Card>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-primary-50 border border-primary-100">
          <p className="text-sm text-primary-800">
            {selected.length} selected on this page
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
            <Button variant="danger" size="sm" onClick={() => setBulkDeleting(true)}>
              Delete selected ({selected.length})
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-4 bg-gray-200 rounded w-24 text-right" />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load transactions"
          description={error}
          onRetry={() => fetchTransactions(pagination.page)}
        />
      ) : transactions.length === 0 ? (
        <Card className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
          <p className="text-gray-500 mb-4">
            {filters.search || filters.type || filters.accountId || filters.startDate || filters.minAmount
              ? 'No records match the current filters — try widening them.'
              : 'Add your first transaction to start tracking your money.'}
          </p>
          <div className="flex justify-center gap-2">
            {filters.search || filters.type || filters.accountId || filters.startDate || filters.minAmount ? (
              <Button onClick={clearFilters} variant="secondary">Clear filters</Button>
            ) : null}
            <Button onClick={openCreate} variant="primary">Add Transaction</Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <TransactionTable
              transactions={transactions}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onView={(txn) => setDetailId(txn.id)}
              onEdit={openEdit}
              onDuplicate={handleDuplicate}
              onDelete={(txn) => setDeleting(txn)}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onSort={handleSort}
            />
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
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
              const pageNumber = start + i;
              if (pageNumber > pagination.totalPages) return null;
              return (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    pageNumber === pagination.page
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {pageNumber}
                </button>
              );
            })}
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

      <TransactionFormModal
        key={editing ? editing.id : 'new-transaction'}
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        transaction={editing}
        accounts={accounts}
        expenseCategories={expenseCategories.categories}
        incomeCategories={incomeCategories.categories}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <TransactionDetailModal
        transactionId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDuplicate={handleDuplicate}
        onDelete={(txn) => setDeleting(txn)}
      />

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete Transaction" size="sm">
        <p className="text-gray-600 mb-4">
          Delete this <strong>{deleting?.type?.toLowerCase()}</strong> transaction?
        </p>
        <p className="text-sm text-gray-500 mb-4">
          {deleting?.description || 'No description'} · {formatMoney(deleting?.amount, deleting?.account?.currency)}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          The account balance is corrected in the same operation as the delete.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={bulkDeleting} onClose={() => setBulkDeleting(false)} title="Delete selected transactions" size="sm">
        <p className="text-gray-600 mb-4">
          Delete <strong>{selected.length}</strong> selected transaction{selected.length === 1 ? '' : 's'}?
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Every id is re-checked against your account before anything is removed, and all balance
          corrections happen in one atomic operation. If any id fails the check, nothing is deleted.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setBulkDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmBulkDelete}>Delete {selected.length}</Button>
        </div>
      </Modal>
    </div>
  );
}
