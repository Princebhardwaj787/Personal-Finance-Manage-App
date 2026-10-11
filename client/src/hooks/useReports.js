import { useState, useCallback, useRef } from 'react';
import { reportApi } from '../services/reportApi';

/**
 * Report generation state (Phase 8).
 *
 * `generate` fetches a JSON preview; `exportFile` downloads CSV/PDF. Both
 * disable their buttons while in flight so a user cannot fire duplicate
 * generation requests (§23). The history list refreshes after every
 * successful generate/export.
 */
export function useReports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const abortRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await reportApi.getHistory({ limit: 20 });
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const generate = useCallback(async (type, params) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const data = await reportApi.getReport(type, params);
      setReport(data);
      fetchHistory();
      return data;
    } catch (err) {
      const message = err.response?.data?.error || err.response?.data?.message || 'Failed to generate report';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchHistory]);

  const exportFile = useCallback(async (type, format, params) => {
    setExporting(format);
    setError(null);
    try {
      const filename = await reportApi.download(type, format, params, `${type}-report`);
      fetchHistory();
      return filename;
    } catch (err) {
      const message = err.response?.data?.error || `Failed to prepare ${format.toUpperCase()}`;
      setError(message);
      return null;
    } finally {
      setExporting(null);
    }
  }, [fetchHistory]);

  const clearError = useCallback(() => setError(null), []);

  return {
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
  };
}
