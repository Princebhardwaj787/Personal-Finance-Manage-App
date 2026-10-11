import { useState, useEffect, useCallback } from 'react';
import { budgetApi } from '../services/budgetApi';

export function useBudgets(initialMonth, initialYear) {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [month, setMonth] = useState(initialMonth || new Date().getMonth() + 1);
  const [year, setYear] = useState(initialYear || new Date().getFullYear());

  const fetchBudgets = useCallback(async (targetMonth, targetYear) => {
    setLoading(true);
    setError(null);
    try {
      const data = await budgetApi.getCurrentMonth(targetMonth, targetYear);
      setBudgets(data.budgets || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch budgets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets(month, year);
  }, [fetchBudgets, month, year]);

  const refresh = useCallback(async (targetMonth, targetYear) => {
    await fetchBudgets(targetMonth ?? month, targetYear ?? year);
  }, [fetchBudgets, month, year]);

  const createBudget = useCallback(async (data) => {
    const result = await budgetApi.create(data);
    await fetchBudgets(month, year);
    return result;
  }, [fetchBudgets, month, year]);

  const updateBudget = useCallback(async (id, data) => {
    const result = await budgetApi.update(id, data);
    await fetchBudgets(month, year);
    return result;
  }, [fetchBudgets, month, year]);

  const deleteBudget = useCallback(async (id) => {
    await budgetApi.delete(id);
    await fetchBudgets(month, year);
  }, [fetchBudgets, month, year]);

  return {
    budgets,
    loading,
    error,
    month,
    year,
    setMonth,
    setYear,
    fetchBudgets,
    refresh,
    createBudget,
    updateBudget,
    deleteBudget
  };
}

export default useBudgets;
