import { useState, useEffect, useCallback } from 'react';
import { recurringExpenseApi } from '../services/recurringExpenseApi';

/**
 * Recurring expenses state: list + summary + upcoming payments.
 * `refresh` reloads all three in parallel with a single round trip each.
 */
export function useRecurringExpenses(initialStatus = 'active') {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(initialStatus);

  const fetchAll = useCallback(
    async (nextStatus = status) => {
      setLoading(true);
      setError(null);
      try {
        const [listRes, summaryRes, upcomingRes] = await Promise.all([
          recurringExpenseApi.list({ status: nextStatus }),
          recurringExpenseApi.summary({ days: 30 }),
          recurringExpenseApi.upcoming({ days: 30, limit: 10 })
        ]);
        setItems(listRes.recurringExpenses || []);
        setSummary(summaryRes);
        setUpcoming(upcomingRes.upcoming || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch recurring expenses');
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    fetchAll(status);
  }, [fetchAll, status]);

  const createItem = useCallback(async (payload) => {
    const data = await recurringExpenseApi.create(payload);
    await fetchAll();
    return data.recurringExpense;
  }, [fetchAll]);

  const updateItem = useCallback(async (id, payload) => {
    const data = await recurringExpenseApi.update(id, payload);
    await fetchAll();
    return data.recurringExpense;
  }, [fetchAll]);

  const deleteItem = useCallback(async (id) => {
    await recurringExpenseApi.remove(id);
    await fetchAll();
  }, [fetchAll]);

  /** Pause / resume — the row stays in the database, just inactive. */
  const toggleActive = useCallback(
    async (item) => {
      const data = await recurringExpenseApi.update(item.id, { isActive: !item.isActive });
      // List, summary and upcoming list all change, so refresh them together.
      await fetchAll();
      return data.recurringExpense;
    },
    [fetchAll]
  );

  return {
    items,
    summary,
    upcoming,
    loading,
    error,
    status,
    setStatus,
    refresh: fetchAll,
    createItem,
    updateItem,
    deleteItem,
    toggleActive
  };
}

export default useRecurringExpenses;
