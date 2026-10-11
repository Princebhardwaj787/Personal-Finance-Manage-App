import { useState, useEffect, useCallback, useMemo } from 'react';
import { savingsGoalApi } from '../services/savingsGoalApi';

/**
 * Savings goals state. Contributions return the updated goal from the API,
 * so a contribution patches exactly one row in place instead of refetching
 * the whole list (and never reloads the app).
 */
export function useSavingsGoals(initialStatus = '') {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(initialStatus);

  // Always load the full list so totals and counts stay correct no matter
  // which filter is selected; filtering happens client-side below.
  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await savingsGoalApi.list();
      setGoals(data.goals || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch savings goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = useCallback(async (payload) => {
    const data = await savingsGoalApi.create(payload);
    setGoals((prev) => [...prev, data.goal]);
    return data.goal;
  }, []);

  const updateGoal = useCallback(async (id, payload) => {
    const data = await savingsGoalApi.update(id, payload);
    setGoals((prev) => prev.map((g) => (g.id === id ? data.goal : g)));
    return data.goal;
  }, []);

  const deleteGoal = useCallback(async (id) => {
    await savingsGoalApi.remove(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  /** Optimistic-free: the server returns the recalculated goal. */
  const addContribution = useCallback(async (id, payload) => {
    const data = await savingsGoalApi.addContribution(id, payload);
    setGoals((prev) => prev.map((g) => (g.id === id ? data.goal : g)));
    return data;
  }, []);

  const getGoal = useCallback(
    (id) => goals.find((g) => g.id === id) || null,
    [goals]
  );

  const visibleGoals = useMemo(
    () => (status ? goals.filter((g) => g.status === status) : goals),
    [goals, status]
  );

  // Archived goals are hidden from totals (they are opted out deliberately).
  const totals = useMemo(() => {
    const live = goals.filter((g) => g.status !== 'ARCHIVED');
    return {
      activeCount: goals.filter((g) => g.status === 'ACTIVE').length,
      totalSaved: live.reduce((sum, g) => sum + (g.currentAmount || 0), 0),
      totalTargets: live.reduce((sum, g) => sum + (g.targetAmount || 0), 0)
    };
  }, [goals]);

  return {
    goals,
    visibleGoals,
    loading,
    error,
    status,
    setStatus,
    totals,
    fetchGoals,
    refresh: fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    addContribution,
    getGoal
  };
}

/** Paginated contribution history for a single goal. */
export function useContributions(goalId, limit = 10) {
  const [contributions, setContributions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchContributions = useCallback(
    async (page = 1) => {
      if (!goalId) {
        setContributions([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await savingsGoalApi.listContributions(goalId, { page, limit });
        setContributions(data.contributions || []);
        setPagination(data.pagination || { page: 1, limit, total: 0, totalPages: 1 });
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch contributions');
      } finally {
        setLoading(false);
      }
    },
    [goalId, limit]
  );

  useEffect(() => {
    fetchContributions(1);
  }, [fetchContributions]);

  return {
    contributions,
    pagination,
    loading,
    error,
    fetchContributions,
    refresh: fetchContributions
  };
}

export default useSavingsGoals;
