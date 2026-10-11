import Input from '../forms/Input';
import Button from '../forms/Button';

/**
 * Filter bar for the transactions list.
 *
 * Every control writes straight into the shared `filters` object — the page
 * passes it to `getTransactions(filters)`, so what you see here is exactly
 * what the server queried (no client-side filtering, no client-side totals).
 */
export default function TransactionFilters({ filters, accounts, categories, onChange, onClear, pagination, count }) {
  const hasFilters =
    filters.search ||
    filters.type ||
    filters.accountId ||
    filters.categoryId ||
    filters.startDate ||
    filters.endDate ||
    filters.minAmount ||
    filters.maxAmount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Input
            label="Search"
            value={filters.search}
            onChange={(e) => onChange('search', e.target.value)}
            placeholder="Description, notes, ref, category, account…"
            icon={<svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          />
        </div>
        <select
          value={filters.type}
          onChange={(e) => onChange('type', e.target.value)}
          className="input"
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>
        <select
          value={filters.accountId}
          onChange={(e) => onChange('accountId', e.target.value)}
          className="input"
          aria-label="Filter by account"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={filters.categoryId}
          onChange={(e) => onChange('categoryId', e.target.value)}
          className="input"
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.type === 'INCOME' ? '↑' : '↓'} {c.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Input
          label="From"
          type="date"
          value={filters.startDate}
          onChange={(e) => onChange('startDate', e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={filters.endDate}
          onChange={(e) => onChange('endDate', e.target.value)}
        />
        <Input
          label="Min amount"
          type="number"
          min="0"
          value={filters.minAmount}
          onChange={(e) => onChange('minAmount', e.target.value)}
          placeholder="0"
        />
        <Input
          label="Max amount"
          type="number"
          min="0"
          value={filters.maxAmount}
          onChange={(e) => onChange('maxAmount', e.target.value)}
          placeholder="Any"
        />
        <div>
          <label className="label" htmlFor="txn-sort-by">Sort by</label>
          <select
            id="txn-sort-by"
            value={filters.sortBy}
            onChange={(e) => onChange('sortBy', e.target.value)}
            className="input"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="createdAt">Created</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="txn-sort-order">Order</label>
          <select
            id="txn-sort-order"
            value={filters.sortOrder}
            onChange={(e) => onChange('sortOrder', e.target.value)}
            className="input"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Showing {count} of {pagination.total} transactions
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
