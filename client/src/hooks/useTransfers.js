import { useState, useEffect, useCallback } from 'react';
import { transferApi } from '../services/transferApi';

/**
 * Transfers list state (Phase 7 §B).
 *
 * Like `useTransactions`, all filtering/sorting/paging is delegated to the
 * server — this hook only forwards parameters and stores the returned page.
 */
export function useTransfers(filters = {}) {
  const [transfers, setTransfers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTransfers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await transferApi.list({ ...filters, page, limit: pagination.limit });
      setTransfers(data.transfers || []);
      setPagination(prev => ({
        ...prev,
        page: data.pagination.page,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch transfers');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchTransfers(1);
  }, [fetchTransfers]);

  const pageAfterRemoval = (removed) => {
    const remaining = Math.max(pagination.total - removed, 0);
    const lastPage = Math.max(Math.ceil(remaining / pagination.limit), 1);
    return Math.min(pagination.page, lastPage);
  };

  const createTransfer = async (data) => {
    const result = await transferApi.create(data);
    await fetchTransfers(1);
    return result;
  };

  const updateTransfer = async (id, data) => {
    const result = await transferApi.update(id, data);
    await fetchTransfers(pagination.page);
    return result;
  };

  const deleteTransfer = async (id) => {
    await transferApi.remove(id);
    await fetchTransfers(pageAfterRemoval(1));
  };

  const setPage = (page) => fetchTransfers(page);

  return {
    transfers,
    pagination,
    loading,
    error,
    fetchTransfers,
    createTransfer,
    updateTransfer,
    deleteTransfer,
    setPage
  };
}

/** Server-side "how much did we move" for the active date range. */
export function useTransferSummary(filters = {}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await transferApi.summary({
        startDate: filters.startDate,
        endDate: filters.endDate
      });
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, fetchSummary };
}
