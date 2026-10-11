import Input from '../forms/Input';
import Button from '../forms/Button';
import { resolvePeriod, toIsoDay } from '../../utils/period';

/**
 * Report filter bar (Phase 8 §3, §11, §19).
 *
 * Quick presets (This Month / Last Month / This Year / Last Year / Custom)
 * resolve to the exact query the server expects via the shared `resolvePeriod`
 * utility — the same one the dashboard uses. "Last Year" is computed as a
 * custom range because it is not a backend period value.
 */
const PRESETS = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'last_year', label: 'Last Year' },
  { key: 'custom', label: 'Custom Range' }
];

const lastYearRange = () => {
  const now = new Date();
  const year = now.getUTCFullYear() - 1;
  return {
    startDate: toIsoDay(new Date(Date.UTC(year, 0, 1))),
    endDate: toIsoDay(new Date(Date.UTC(year, 11, 31)))
  };
};

export default function ReportFilters({
  reportType,
  onTypeChange,
  filters,
  onFilterChange,
  accounts,
  categories,
  onGenerate,
  onClear,
  loading
}) {
  const handlePreset = (key) => {
    if (key === 'last_year') {
      const { startDate, endDate } = lastYearRange();
      onFilterChange('period', 'custom');
      onFilterChange('startDate', startDate);
      onFilterChange('endDate', endDate);
      return;
    }
    onFilterChange('period', key);
    if (key === 'custom') {
      // Keep existing dates when switching to custom; clear them otherwise
      return;
    }
    onFilterChange('startDate', '');
    onFilterChange('endDate', '');
  };

  const resolved = resolvePeriod({
    period: filters.period,
    startDate: filters.startDate,
    endDate: filters.endDate
  });

  return (
    <div className="space-y-4">
      {/* Report type selector */}
      <div>
        <label className="label" htmlFor="report-type">Report Type</label>
        <select
          id="report-type"
          value={reportType}
          onChange={(e) => onTypeChange(e.target.value)}
          className="input"
        >
          <option value="monthly">Monthly Financial Report</option>
          <option value="yearly">Yearly Financial Report</option>
          <option value="transactions">Transaction Report</option>
          <option value="categories">Category Spending Report</option>
          <option value="budgets">Budget Report</option>
          <option value="accounts">Account Report</option>
        </select>
      </div>

      {/* Quick presets */}
      <div>
        <span className="label">Quick Range</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePreset(preset.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filters.period === preset.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date range + filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          label="From"
          type="date"
          value={filters.startDate}
          onChange={(e) => onFilterChange('startDate', e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={filters.endDate}
          onChange={(e) => onFilterChange('endDate', e.target.value)}
        />
        <select
          value={filters.type}
          onChange={(e) => onFilterChange('type', e.target.value)}
          className="input"
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>
        <select
          value={filters.accountId}
          onChange={(e) => onFilterChange('accountId', e.target.value)}
          className="input"
          aria-label="Filter by account"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <select
          value={filters.categoryId}
          onChange={(e) => onFilterChange('categoryId', e.target.value)}
          className="input"
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.type === 'INCOME' ? '↑' : '↓'} {c.name}</option>
          ))}
        </select>
        <Input
          label="Min amount"
          type="number"
          min="0"
          value={filters.minAmount}
          onChange={(e) => onFilterChange('minAmount', e.target.value)}
          placeholder="0"
        />
        <Input
          label="Max amount"
          type="number"
          min="0"
          value={filters.maxAmount}
          onChange={(e) => onFilterChange('maxAmount', e.target.value)}
          placeholder="Any"
        />
        <div className="flex items-end">
          <Button
            onClick={onGenerate}
            loading={loading}
            disabled={loading || !resolved.valid}
            className="w-full"
          >
            {loading ? 'Generating report…' : 'Generate Report'}
          </Button>
        </div>
      </div>

      {filters.period && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {resolved.label || 'Custom range'}
            {filters.startDate && filters.endDate && ` · ${filters.startDate} → ${filters.endDate}`}
          </p>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
