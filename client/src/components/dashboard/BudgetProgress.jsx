import { formatCurrency } from '../../utils/format';

const STATUS_META = {
  ON_TRACK: { label: 'On track', glyph: '✓', badge: 'text-primary-700 bg-primary-50 border-primary-200', bar: '#16a34a' },
  WARNING: { label: 'Near limit', glyph: '!', badge: 'text-warning-700 bg-warning-50 border-warning-200', bar: '#f59e0b' },
  EXCEEDED: { label: 'Exceeded', glyph: '✕', badge: 'text-danger-700 bg-danger-50 border-danger-200', bar: '#ef4444' },
  NO_BUDGET: { label: 'No budget', glyph: '–', badge: 'text-gray-600 bg-gray-50 border-gray-200', bar: '#9ca3af' }
};

const metaFor = (status) => STATUS_META[status] || STATUS_META.NO_BUDGET;

/** Status is always spelled out in text — colour is never the only signal (§26). */
const statusText = (budget) => {
  if (budget.status === 'EXCEEDED') {
    return `Exceeded by ${formatCurrency(Math.abs(budget.remainingAmount))}`;
  }
  if (budget.status === 'WARNING') {
    return `${budget.percentageUsed}% used`;
  }
  return `${formatCurrency(budget.remainingAmount)} remaining`;
};

const alertText = (alert) => {
  if (alert.status === 'EXCEEDED') {
    return `${alert.category.name} budget has been exceeded by ${formatCurrency(Math.abs(alert.remainingAmount))}.`;
  }
  return `${alert.category.name} budget is at ${alert.percentageUsed}%.`;
};

/**
 * Budget Overview (§10) and Budget Alerts (§11).
 * Reads `budgetService` output as-is — no budget maths is repeated here.
 */
export default function BudgetProgress({ overview }) {
  const { totals, budgets, alerts, monthLabel } = overview;
  const meta = metaFor(totals.status);
  const remaining = totals.remainingAmount;
  const shownBudgets = budgets.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-gray-500">Total budget</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(totals.totalBudget)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total spent</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(totals.totalSpent)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Remaining</p>
          <p className={`text-lg font-semibold ${remaining < 0 ? 'text-danger-600' : 'text-gray-900'}`}>
            {formatCurrency(Math.abs(remaining))}
            {remaining < 0 && <span className="text-xs font-medium"> over</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Usage</p>
          <p className="text-lg font-semibold text-gray-900">{totals.usagePercent}%</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm text-gray-600">
            {formatCurrency(totals.totalBudget)} budgeted · {formatCurrency(totals.totalSpent)} spent
          </p>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${meta.badge}`}>
            <span aria-hidden="true">{meta.glyph}</span>
            {meta.label}
          </span>
        </div>
        <div
          className="w-full h-3 bg-gray-200 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={totals.usagePercent}
          aria-valuetext={`${totals.usagePercent}% used, ${meta.label}, ${formatCurrency(totals.totalSpent)} of ${formatCurrency(totals.totalBudget)} for ${monthLabel}`}
          aria-label={`Budget usage for ${monthLabel}`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${Math.min(totals.usagePercent, 100)}%`, backgroundColor: meta.bar }}
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          {remaining < 0
            ? `Overspent by ${formatCurrency(Math.abs(remaining))} this month`
            : `${formatCurrency(remaining)} remaining`}
          {' · '}{totals.usagePercent}% used
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-3">
          <p className="text-xs font-semibold text-warning-800 uppercase tracking-wide">Budget alerts</p>
          <ul className="mt-2 space-y-1.5">
            {alerts.map((alert) => (
              <li key={alert.budgetId} className="flex items-start gap-2 text-sm text-warning-900">
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                  {alert.status === 'EXCEEDED' ? '✕' : '!'}
                </span>
                <span>
                  {alertText(alert)}
                  <span className="sr-only"> ({alert.status === 'EXCEEDED' ? 'Exceeded' : 'Near limit'})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Category budgets</h3>
        <ul className="space-y-4">
          {shownBudgets.map((budget) => {
            const budgetMeta = metaFor(budget.status);
            const text = statusText(budget);
            return (
              <li key={budget.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700 truncate">
                    {budget.category.icon && <span aria-hidden="true" className="mr-1">{budget.category.icon}</span>}
                    {budget.category.name}
                  </span>
                  <span className="text-sm font-medium text-gray-900 shrink-0">
                    {formatCurrency(budget.spentAmount)} / {formatCurrency(budget.budgetAmount)}
                  </span>
                </div>
                <div
                  className="mt-1.5 w-full h-2 bg-gray-200 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={budget.percentageUsed}
                  aria-valuetext={`${budget.percentageUsed}% used, ${text}`}
                  aria-label={`${budget.category.name} budget`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(budget.percentageUsed, 100)}%`,
                      backgroundColor: budgetMeta.bar
                    }}
                  />
                </div>
                <p className={`mt-1 text-xs ${budget.status === 'EXCEEDED' ? 'text-danger-600 font-medium' : 'text-gray-500'}`}>
                  {text}
                  <span className="sr-only"> — {budgetMeta.label}</span>
                </p>
              </li>
            );
          })}
        </ul>
        {budgets.length > shownBudgets.length && (
          <p className="mt-3 text-xs text-gray-500">
            Showing {shownBudgets.length} of {budgets.length} budgets.
          </p>
        )}
      </div>
    </div>
  );
}
