import Card from '../ui/Card';
import Button from '../forms/Button';
import { formatCurrency } from '../../utils/format';

const STATUS_STYLES = {
  ACTIVE: { label: 'Active', chip: 'bg-blue-100 text-blue-700', bar: 'bg-primary-500' },
  COMPLETED: { label: 'Completed', chip: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  ARCHIVED: { label: 'Archived', chip: 'bg-gray-100 text-gray-600', bar: 'bg-gray-400' }
};

const progressColor = (pct) => {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 70) return 'bg-primary-500';
  if (pct >= 40) return 'bg-yellow-500';
  return 'bg-primary-500';
};

export default function GoalCard({ goal, onAdd, onEdit, onDelete, onHistory }) {
  const pct = goal.percentageComplete ?? 0;
  const status = STATUS_STYLES[goal.status] || STATUS_STYLES.ACTIVE;

  const targetLabel = new Date(goal.targetDate).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate" title={goal.name}>
            {goal.name}
          </h3>
          {goal.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{goal.description}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${status.chip}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(goal.currentAmount)}
          <span className="text-sm font-normal text-gray-500"> / {formatCurrency(goal.targetAmount)}</span>
        </p>

        <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5" role="progressbar"
             aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
             aria-label={`${goal.name} progress`}>
          <div
            className={`h-full rounded-full transition-all ${goal.status === 'ARCHIVED' ? status.bar : progressColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-1.5 flex justify-between text-sm">
          <span className="text-gray-600">{pct}% complete</span>
          <span className="text-gray-500">
            {goal.status === 'COMPLETED' ? 'Goal reached' : `Remaining: ${formatCurrency(goal.remainingAmount)}`}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-500">Target: {targetLabel}</p>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <Button variant="primary" size="sm" onClick={() => onAdd(goal)} disabled={goal.status === 'ARCHIVED'}>
          + Add money
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onHistory(goal)}>History</Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(goal)}>Delete</Button>
        </div>
      </div>
    </Card>
  );
}
