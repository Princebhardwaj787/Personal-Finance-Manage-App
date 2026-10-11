import { useState, useEffect, useCallback } from 'react';
import { transactionApi } from '../services/transactionApi';

/**
 * Transactions list state.
 *
 * All filtering, searching, sorting and paging happen on the server — this hook
 * only forwards parameters and stores the returned page. `getTransactions`-style
 * queries (transactionApi.list) are therefore reusable as-is by a future
 * export feature.
 */
export function useTransactions(filters = {}) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTransactions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionApi.list({ ...filters, page, limit: pagination.limit });
      setTransactions(data.transactions || []);
      setPagination(prev => ({
        ...prev,
        page: data.pagination.page,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  /**
   * Deleting can shrink the page count (deleting the last row of the last
   * page). Clamp to the new last page so the user never lands on an empty page.
   */
  const pageAfterRemoval = (removed) => {
    const remaining = Math.max(pagination.total - removed, 0);
    const lastPage = Math.max(Math.ceil(remaining / pagination.limit), 1);
    return Math.min(pagination.page, lastPage);
  };

  const createTransaction = async (data) => {
    const result = await transactionApi.create(data);
    await fetchTransactions(1);
    return result;
  };

  const updateTransaction = async (id, data) => {
    const result = await transactionApi.update(id, data);
    await fetchTransactions(pagination.page);
    return result;
  };

  const deleteTransaction = async (id) => {
    await transactionApi.delete(id);
    await fetchTransactions(pageAfterRemoval(1));
  };

  const duplicateTransaction = async (id, data = {}) => {
    const result = await transactionApi.duplicate(id, data);
    await fetchTransactions(pagination.page);
    return result;
  };

  const bulkDeleteTransactions = async (ids) => {
    const result = await transactionApi.bulkDelete(ids);
    await fetchTransactions(pageAfterRemoval(result.deleted || ids.length));
    return result;
  };

  /** LEGACY — transfers have their own API now (see transferApi). */
  const createTransfer = async (data) => {
    const result = await transactionApi.createTransfer(data);
    await fetchTransactions(pagination.page);
    return result;
  };

  const setPage = (page) => {
    fetchTransactions(page);
  };

  return {
    transactions,
    pagination,
    loading,
    error,
    fetchTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    duplicateTransaction,
    bulkDeleteTransactions,
    createTransfer,
    setPage
  };
}

/**
 * Server-side totals for the current filter set (DB aggregation, never a sum of
 * the rows on screen — page-level maths was wrong once you paginated).
 */
export function useTransactionSummary(filters = {}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionApi.getSummary(filters);
      setSummary(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch summary');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, fetchSummary };
}

export function useCategoryBreakdown(filters = {}) {
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBreakdown = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionApi.getCategoryBreakdown(filters);
      setBreakdown(data.breakdown || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch breakdown');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  return { breakdown, loading, error, fetchBreakdown };
}
