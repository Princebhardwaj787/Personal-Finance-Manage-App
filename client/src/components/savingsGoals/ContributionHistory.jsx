import Modal from '../ui/Modal';
import Button from '../forms/Button';
import Loading from '../ui/Loading';
import { useContributions } from '../../hooks/useSavingsGoals';
import { formatCurrency } from '../../utils/format';

/** Paginated contribution history for one goal. */
export default function ContributionHistory({ open, onClose, goal }) {
  const goalId = goal?.id || null;
  const { contributions, pagination, loading, error, fetchContributions } =
    useContributions(goalId, 10);

  if (!goal) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={`${goal.name} — History`} size="lg">
      {loading ? (
        <div className="flex justify-center py-8"><Loading /></div>
      ) : error ? (
        <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
      ) : contributions.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No contributions yet. Use “Add money” to start funding this goal.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {contributions.map((c) => (
              <li key={c.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(c.amount)}
                  </p>
                  {c.note && <p className="text-sm text-gray-500 truncate">{c.note}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.date).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchContributions(pagination.page - 1)}
              >
                ← Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchContributions(pagination.page + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
