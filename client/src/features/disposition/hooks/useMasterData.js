import { useCallback, useState, useEffect } from 'react';
import { useMutation } from '../../../hooks/useAsyncData';
import {
  industriesAPI,
  dispoTypesAPI,
  dispoActionsAPI,
  contactStatusesAPI,
  contactTemperaturesAPI,
  templateVariablesAdminAPI,
} from '../../../services/dispositionAPI';

/**
 * Simple hook for fetching options data (no pagination)
 */
function useOptionsData(apiFn) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    async function fetchData() {
      try {
        setLoading(true);
        const response = await apiFn();
        if (mounted) {
          setData(response.data?.data || []);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    return () => { mounted = false; };
  }, []);

  return { data, loading, error };
}

/**
 * Hook to get all active industries for dropdown (no pagination)
 */
export function useIndustriesOptions() {
  return useOptionsData(industriesAPI.getOptions);
}

/**
 * Hook to get all active dispo types for dropdown (no pagination)
 */
export function useDispoTypesOptions() {
  return useOptionsData(dispoTypesAPI.getOptions);
}

/**
 * Hook to get all active dispo actions for dropdown (no pagination)
 */
export function useDispoActionsOptions() {
  return useOptionsData(dispoActionsAPI.getOptions);
}

/**
 * Hook to get all active contact statuses for dropdown (no pagination)
 */
export function useContactStatusesOptions() {
  return useOptionsData(contactStatusesAPI.getOptions);
}

/**
 * Hook to get all active contact temperatures for dropdown (no pagination)
 */
export function useContactTemperaturesOptions() {
  return useOptionsData(contactTemperaturesAPI.getOptions);
}

/**
 * Generic hook for paginated master data with search
 */
function usePaginatedData(apiFn, deps = []) {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFn(params);
      setData(response.data.data || []);
      setPagination(response.data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, deps);

  return { data, pagination, loading, error, fetch };
}

/**
 * Hook for Industries CRUD with pagination/search
 */
export function useIndustries({ search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => industriesAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);
  
  const createMutation = useMutation(industriesAPI.create);
  const updateMutation = useMutation((id, data) => industriesAPI.update(id, data));
  const toggleActiveMutation = useMutation(industriesAPI.toggleActive);
  const deleteMutation = useMutation(industriesAPI.delete);

  return {
    industries: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Disposition Types CRUD with pagination/search
 */
export function useDispoTypes({ search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => dispoTypesAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);
  
  const createMutation = useMutation(dispoTypesAPI.create);
  const updateMutation = useMutation((id, data) => dispoTypesAPI.update(id, data));
  const toggleActiveMutation = useMutation(dispoTypesAPI.toggleActive);
  const deleteMutation = useMutation(dispoTypesAPI.delete);

  return {
    dispoTypes: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Disposition Actions CRUD with pagination/search
 */
export function useDispoActions({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => dispoActionsAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);
  
  const createMutation = useMutation(dispoActionsAPI.create);
  const updateMutation = useMutation((id, data) => dispoActionsAPI.update(id, data));
  const toggleActiveMutation = useMutation(dispoActionsAPI.toggleActive);
  const deleteMutation = useMutation(dispoActionsAPI.delete);

  return {
    dispoActions: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Contact Statuses CRUD with pagination/search
 */
export function useContactStatuses({ search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => contactStatusesAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);
  
  const createMutation = useMutation(contactStatusesAPI.create);
  const updateMutation = useMutation((id, data) => contactStatusesAPI.update(id, data));
  const toggleActiveMutation = useMutation(contactStatusesAPI.toggleActive);
  const deleteMutation = useMutation(contactStatusesAPI.delete);

  return {
    contactStatuses: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Contact Temperatures CRUD with pagination/search
 */
export function useContactTemperatures({ search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => contactTemperaturesAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);
  
  const createMutation = useMutation(contactTemperaturesAPI.create);
  const updateMutation = useMutation((id, data) => contactTemperaturesAPI.update(id, data));
  const toggleActiveMutation = useMutation(contactTemperaturesAPI.toggleActive);
  const deleteMutation = useMutation(contactTemperaturesAPI.delete);
  const moveMutation = useMutation((id, direction, position) => 
    contactTemperaturesAPI.move(id, direction, position)
  );

  return {
    contactTemperatures: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
    move: moveMutation,
  };
}

/**
 * Hook for Template Variables CRUD (Super Admin) with pagination/search
 */
export function useTemplateVariablesAdmin({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) {
  const { data, pagination, loading, error, fetch } = usePaginatedData(
    (params) => templateVariablesAdminAPI.getAll(params),
    []
  );

  useEffect(() => {
    fetch({ search, includeInactive, page, limit });
  }, [search, includeInactive, page, limit, fetch]);

  const refetch = useCallback(() => {
    fetch({ search, includeInactive, page, limit });
  }, [fetch, search, includeInactive, page, limit]);

  const createMutation = useMutation(templateVariablesAdminAPI.create);
  const updateMutation = useMutation((id, data) => templateVariablesAdminAPI.update(id, data));
  const toggleActiveMutation = useMutation(templateVariablesAdminAPI.toggleActive);
  const deleteMutation = useMutation(templateVariablesAdminAPI.delete);

  return {
    templateVariables: data,
    pagination,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    toggleActive: toggleActiveMutation,
    delete: deleteMutation,
  };
}
