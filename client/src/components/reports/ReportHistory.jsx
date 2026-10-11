import { formatDate } from '../../utils/format';

/**
 * Report history list (Phase 8 §18).
 *
 * Shows previously generated reports with their parameters. Each entry has a
 * "Re-run" button that restores the filters and regenerates the report.
 */
const TYPE_LABELS = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  transactions: 'Transactions',
  categories: 'Categories',
  budgets: 'Budgets',
  accounts: 'Accounts'
};

const FORMAT_LABELS = {
  json: 'Preview',
  csv: 'CSV',
  pdf: 'PDF'
};

export default function ReportHistory({ history, loading, onRerun }) {
  if (loading) {
    return <p className="text-sm text-gray-500">Loading history…</p>;
  }

  if (!history || history.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">No reports generated yet. Generate a report to see it here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
      {history.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {TYPE_LABELS[entry.type] || entry.type} Report
              </span>
              <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                {FORMAT_LABELS[entry.format] || entry.format}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {entry.startDate} → {entry.endDate} · Generated {formatDate(entry.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRerun(entry)}
            className="ml-4 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded transition-colors"
          >
            Re-run
          </button>
        </div>
      ))}
    </div>
  );
}
