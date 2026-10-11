import { useState, useEffect, useCallback } from 'react';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useReports } from '../hooks/useReports';
import ReportFilters from '../components/reports/ReportFilters';
import ReportPreview from '../components/reports/ReportPreview';
import ReportHistory from '../components/reports/ReportHistory';
import Button from '../components/forms/Button';

/**
 * Reports page (Phase 8 §11–12, §19, §23–24).
 *
 * Users pick a report type, configure filters (with quick presets), generate
 * a preview, and download CSV/PDF. All data comes from the backend report
 * service — no financial maths happens in the browser.
 */
const DEFAULT_FILTERS = {
  period: 'this_month',
  startDate: '',
  endDate: '',
  type: '',
  accountId: '',
  categoryId: '',
  minAmount: '',
  maxAmount: ''
};

const CSV_TYPES = ['transactions', 'categories', 'budgets', 'accounts'];
const PDF_TYPES = ['monthly', 'yearly'];

export default function Reports() {
  const { accounts } = useAccounts();
  const expenseCategories = useCategories('EXPENSE');
  const incomeCategories = useCategories('INCOME');
  const {
    report,
    loading,
    error,
    exporting,
    history,
    historyLoading,
    generate,
    exportFile,
    fetchHistory,
    clearError
  } = useReports();

  const [reportType, setReportType] = useState('monthly');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const allCategories = [...expenseCategories.categories, ...incomeCategories.categories];

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleTypeChange = useCallback((type) => {
    setReportType(type);
  }, []);

  const handleGenerate = useCallback(() => {
    const params = { ...filters };
    // Drop empty filters so the server doesn't receive blank strings
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    generate(reportType, params);
  }, [filters, reportType, generate]);

  const handleClear = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    clearError();
  }, [clearError]);

  const handleExport = useCallback((format) => {
    const params = { ...filters };
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    exportFile(reportType, format, params);
  }, [filters, reportType, exportFile]);

  const handleRerun = useCallback((entry) => {
    setReportType(entry.type);
    setFilters({
      period: 'custom',
      startDate: entry.startDate,
      endDate: entry.endDate,
      type: '',
      accountId: '',
      categoryId: '',
      minAmount: '',
      maxAmount: ''
    });
    generate(entry.type, { startDate: entry.startDate, endDate: entry.endDate });
  }, [generate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate financial reports, preview them, and export as CSV or PDF.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 ml-4" aria-label="Dismiss error">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <ReportFilters
          reportType={reportType}
          onTypeChange={handleTypeChange}
          filters={filters}
          onFilterChange={handleFilterChange}
          accounts={accounts}
          categories={allCategories}
          onGenerate={handleGenerate}
          onClear={handleClear}
          loading={loading}
        />
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-3">
        {CSV_TYPES.includes(reportType) && (
          <Button
            variant="secondary"
            onClick={() => handleExport('csv')}
            loading={exporting === 'csv'}
            disabled={exporting !== null || !report}
          >
            {exporting === 'csv' ? 'Preparing CSV…' : 'Download CSV'}
          </Button>
        )}
        {PDF_TYPES.includes(reportType) && (
          <Button
            variant="secondary"
            onClick={() => handleExport('pdf')}
            loading={exporting === 'pdf'}
            disabled={exporting !== null || !report}
          >
            {exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
        )}
      </div>

      {/* Preview */}
      {report && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <ReportPreview report={report} />
        </div>
      )}

      {/* Empty state */}
      {!report && !loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            No financial data is available for the selected period.
          </p>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Report History</h2>
        <ReportHistory history={history} loading={historyLoading} onRerun={handleRerun} />
      </div>
    </div>
  );
}
