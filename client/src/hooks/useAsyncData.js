import { useState, useCallback, useEffect } from 'react';

/**
 * Generic async data hook for CRUD operations
 * Provides loading states, error handling, and data management
 * @param {Function} fetchFn - Function that returns a promise
 * @param {Array} dependencies - Dependencies array for useEffect
 * @param {Object} options - Optional config { transform: (response) => transformedData }
 */
export function useAsyncData(fetchFn, dependencies = [], options = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchFn();
      const result = options.transform ? options.transform(response) : (response.data?.data || []);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetch();
  }, [...dependencies, fetch]);

  return { data, loading, error, refetch: fetch, setData };
}

/**
 * Hook for managing CRUD mutations
 */
export function useMutation(mutationFn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(async (...args) => {
    try {
      setLoading(true);
      setError(null);
      const response = await mutationFn(...args);
      return { success: true, data: response.data };
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Operation failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [mutationFn]);

  return { mutate, loading, error, clearError: () => setError(null) };
}
