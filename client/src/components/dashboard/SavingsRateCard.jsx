import { formatCurrency } from '../../utils/format';

/**
 * Savings Rate (§9): `Savings = Income − Expenses`, `Rate = Savings / Income × 100`.
 * The number is computed by `getSavingsRate` on the server; a null rate means
 * income was zero for the period (never NaN or Infinity).
 */
export default function SavingsRateCard({ summary, label }) {
  const income = summary?.totalIncome ?? 0;
  const expenses = summary?.totalExpenses ?? 0;
  const savings = summary?.netSavings ?? 0;
  const rate = summary?.savingsRate;
  const hasIncome = summary?.hasIncome ?? false;

  return (
    <div className="space-y-5">
      <div className="text-center py-2">
        <p className="text-sm text-gray-500">Savings rate</p>
        <p className="text-4xl font-bold text-gray-900 mt-1">
          {hasIncome && rate !== null && rate !== undefined ? `${rate}%` : '—'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {hasIncome
            ? `for ${label}`
            : 'No income recorded for this period'}
        </p>
      </div>

      <div>
        <div
          className="w-full h-3 bg-gray-200 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(Math.min(rate ?? 0, 100), 0)}
          aria-valuetext={
            hasIncome && rate !== null && rate !== undefined
              ? `${rate}% of income saved`
              : 'Savings rate unavailable — no income for this period'
          }
          aria-label="Savings rate"
        >
          <div
            className="h-full rounded-full bg-primary-500"
            style={{ width: `${Math.max(Math.min(rate ?? 0, 100), 0)}%` }}
          />
        </div>
      </div>

      <dl className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-gray-500">Income</dt>
          <dd className="text-sm font-semibold text-green-600">{formatCurrency(income)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-gray-500">Expenses</dt>
          <dd className="text-sm font-semibold text-danger-600">{formatCurrency(expenses)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <dt className="text-sm font-medium text-gray-700">Savings</dt>
          <dd className={`text-sm font-bold ${savings < 0 ? 'text-danger-600' : 'text-primary-700'}`}>
            {formatCurrency(savings)}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-gray-400">
        Savings = Income − Expenses for {label}.
      </p>
    </div>
  );
}
