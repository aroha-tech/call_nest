import { useCallback, useState, useEffect } from 'react';
import { useAsyncData, useMutation } from '../../../hooks/useAsyncData';
import {
  defaultDispositionsAPI,
  defaultDialingSetsAPI,
  defaultDialingSetDispositionsAPI,
  defaultDispositionActionsAPI,
} from '../../../services/dispositionAPI';

const defaultPagination = { page: 1, limit: 10, total: 0, totalPages: 1 };

/**
 * Hook for Default Dispositions CRUD with pagination, search, includeInactive
 * @param {string|null|undefined} industryId - industry id, null for "All Industries", undefined for no filter
 * @param {object} options - { search, includeInactive, page, limit }
 */
export function useDefaultDispositions(industryId = undefined, options = {}) {
  const {
    search = '',
    includeInactive = false,
    page = 1,
    limit = 10,
  } = typeof options === 'boolean' ? { includeInactive: options } : options;

  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFn = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await defaultDispositionsAPI.getAll({
        industryId,
        includeInactive,
        search,
        page,
        limit,
      });
      setData(response.data?.data ?? []);
      setPagination(response.data?.pagination ?? defaultPagination);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [industryId, search, includeInactive, page, limit]);

  useEffect(() => {
    fetchFn();
  }, [fetchFn]);

  const createMutation = useMutation(defaultDispositionsAPI.create);
  const updateMutation = useMutation((id, data) => defaultDispositionsAPI.update(id, data));
  const deleteMutation = useMutation(defaultDispositionsAPI.delete);

  return {
    defaultDispositions: data,
    pagination,
    loading,
    error,
    refetch: fetchFn,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Default Dialing Sets CRUD
 */
export function useDefaultDialingSets(industryId = null, includeInactive = false) {
  const fetchFn = useCallback(
    () => defaultDialingSetsAPI.getAll(industryId, includeInactive),
    [industryId, includeInactive]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [industryId, includeInactive]);
  
  const createMutation = useMutation(defaultDialingSetsAPI.create);
  const updateMutation = useMutation((id, data) => defaultDialingSetsAPI.update(id, data));
  const deleteMutation = useMutation(defaultDialingSetsAPI.delete);

  return {
    defaultDialingSets: data,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Default Dialing Set Dispositions
 */
export function useDefaultDialingSetDispositions(dialingSetId) {
  const fetchFn = useCallback(
    () => dialingSetId ? defaultDialingSetDispositionsAPI.getAll(dialingSetId) : Promise.resolve({ data: { data: [] } }),
    [dialingSetId]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [dialingSetId]);
  
  const createMutation = useMutation(defaultDialingSetDispositionsAPI.create);
  const deleteMutation = useMutation(defaultDialingSetDispositionsAPI.delete);
  const moveMutation = useMutation((id, direction, position) =>
    defaultDialingSetDispositionsAPI.move(id, direction, position)
  );

  return {
    dispositions: data,
    loading,
    error,
    refetch,
    create: createMutation,
    delete: deleteMutation,
    move: moveMutation,
  };
}

/**
 * Hook for Default Disposition Actions
 */
export function useDefaultDispositionActions(dispositionId) {
  const fetchFn = useCallback(
    () => dispositionId ? defaultDispositionActionsAPI.getAll(dispositionId) : Promise.resolve({ data: { data: [] } }),
    [dispositionId]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [dispositionId]);
  
  const createMutation = useMutation(defaultDispositionActionsAPI.create);
  const deleteMutation = useMutation(defaultDispositionActionsAPI.delete);
  const moveMutation = useMutation((id, direction, position) =>
    defaultDispositionActionsAPI.move(id, direction, position)
  );

  return {
    actions: data,
    loading,
    error,
    refetch,
    create: createMutation,
    delete: deleteMutation,
    move: moveMutation,
  };
}
