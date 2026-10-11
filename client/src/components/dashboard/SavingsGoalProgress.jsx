import { formatCurrency } from '../../utils/format';

/**
 * Savings Goals summary (§13) — Phase 5 data rendered as compact progress rows.
 * Derived progress comes from `goalCalculator`, never recomputed here.
 */
export default function SavingsGoalProgress({ goals }) {
  return (
    <ul className="space-y-4">
      {goals.map((goal) => (
        <li key={goal.id}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-gray-900 truncate">{goal.name}</p>
            <p className="text-sm font-semibold text-primary-700 shrink-0">{goal.percentageComplete}%</p>
          </div>
          <div
            className="mt-1.5 w-full h-2 bg-gray-200 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.percentageComplete}
            aria-valuetext={`${goal.percentageComplete}% funded, ${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}`}
            aria-label={`${goal.name} progress`}
          >
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${Math.min(goal.percentageComplete, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
          </p>
        </li>
      ))}
    </ul>
  );
}
