import { useState, useEffect, useCallback } from 'react';
import { categoryApi } from '../services/categoryApi';

export function useCategories(type = null) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await categoryApi.list({ type });
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const createCategory = async (data) => {
    const result = await categoryApi.create(data);
    await fetchCategories();
    return result;
  };

  const updateCategory = async (id, data) => {
    const result = await categoryApi.update(id, data);
    await fetchCategories();
    return result;
  };

  const deleteCategory = async (id) => {
    await categoryApi.delete(id);
    await fetchCategories();
  };

  return {
    categories,
    loading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory
  };
}

export function useCategoriesByType(type) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setError(null);
    try {
      const data = await categoryApi.getByType(type);
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    fetchCategories
  };
}