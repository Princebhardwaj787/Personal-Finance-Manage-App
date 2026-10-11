import { useState, useEffect, useCallback } from 'react';
import { accountApi } from '../services/accountApi';

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountApi.list();
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = async (data) => {
    const result = await accountApi.create(data);
    await fetchAccounts();
    return result;
  };

  const updateAccount = async (id, data) => {
    const result = await accountApi.update(id, data);
    await fetchAccounts();
    return result;
  };

  const deleteAccount = async (id) => {
    await accountApi.delete(id);
    await fetchAccounts();
  };

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount
  };
}