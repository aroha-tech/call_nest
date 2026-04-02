import { useCallback, useState, useEffect } from 'react';
import { useAsyncData, useMutation } from '../../../hooks/useAsyncData';
import {
  dialingSetsAPI,
  dispositionsAPI,
  dialingSetDispositionsAPI,
  dispositionActionsAPI,
  emailTemplatesAPI,
  whatsappTemplatesAPI,
} from '../../../services/dispositionAPI';
import { whatsappTemplatesAPI as whatsappModuleTemplatesAPI } from '../../../services/whatsappAPI';

/**
 * Hook for Tenant Dialing Sets CRUD
 */
export function useDialingSets(includeInactive = false) {
  const fetchFn = useCallback(() => dialingSetsAPI.getAll(includeInactive), [includeInactive]);
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [includeInactive]);
  
  const createMutation = useMutation(dialingSetsAPI.create);
  const updateMutation = useMutation((id, data) => dialingSetsAPI.update(id, data));
  const deleteMutation = useMutation(dialingSetsAPI.delete);
  const cloneMutation = useMutation(dialingSetsAPI.clone);

  return {
    dialingSets: data,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
    clone: cloneMutation,
  };
}

const defaultPagination = { page: 1, limit: 10, total: 0, totalPages: 1 };

/**
 * Hook for Tenant Dispositions CRUD with pagination, search, and includeInactive
 */
export function useDispositions(options = {}) {
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
      const response = await dispositionsAPI.getAll({
        search,
        includeInactive,
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
  }, [search, includeInactive, page, limit]);

  useEffect(() => {
    fetchFn();
  }, [fetchFn]);

  const createMutation = useMutation(dispositionsAPI.create);
  const updateMutation = useMutation((id, data) => dispositionsAPI.update(id, data));
  const deleteMutation = useMutation(dispositionsAPI.delete);
  const cloneFromIndustryMutation = useMutation((industryId, includeDialingSets) =>
    dispositionsAPI.cloneFromIndustry(industryId, includeDialingSets)
  );
  const cloneSingleMutation = useMutation(dispositionsAPI.cloneSingle);

  return {
    dispositions: data,
    pagination,
    loading,
    error,
    refetch: fetchFn,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
    cloneFromIndustry: cloneFromIndustryMutation,
    cloneSingle: cloneSingleMutation,
  };
}

/**
 * Hook for Tenant Dialing Set Dispositions
 */
export function useDialingSetDispositions(dialingSetId) {
  const fetchFn = useCallback(
    () => dialingSetId ? dialingSetDispositionsAPI.getAll(dialingSetId) : Promise.resolve({ data: { data: [] } }),
    [dialingSetId]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [dialingSetId]);
  
  const createMutation = useMutation(dialingSetDispositionsAPI.create);
  const deleteMutation = useMutation(dialingSetDispositionsAPI.delete);
  const moveMutation = useMutation((id, direction, position) =>
    dialingSetDispositionsAPI.move(id, direction, position)
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
 * Hook for Tenant Disposition Actions
 */
export function useDispositionActions(dispositionId) {
  const fetchFn = useCallback(
    () => dispositionId ? dispositionActionsAPI.getAll(dispositionId) : Promise.resolve({ data: { data: [] } }),
    [dispositionId]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [dispositionId]);
  
  const createMutation = useMutation(dispositionActionsAPI.create);
  const updateTemplatesMutation = useMutation((id, data) => dispositionActionsAPI.updateTemplates(id, data));
  const deleteMutation = useMutation(dispositionActionsAPI.delete);
  const moveMutation = useMutation((id, direction, position) =>
    dispositionActionsAPI.move(id, direction, position)
  );

  return {
    actions: data,
    loading,
    error,
    refetch,
    create: createMutation,
    updateTemplates: updateTemplatesMutation,
    delete: deleteMutation,
    move: moveMutation,
  };
}

/**
 * Hook for Tenant Email Templates
 */
export function useEmailTemplates(includeInactive = false) {
  const fetchFn = useCallback(() => emailTemplatesAPI.getAll(includeInactive), [includeInactive]);
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [includeInactive]);
  
  const createMutation = useMutation(emailTemplatesAPI.create);
  const updateMutation = useMutation((id, data) => emailTemplatesAPI.update(id, data));
  const deleteMutation = useMutation(emailTemplatesAPI.delete);

  return {
    emailTemplates: data,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for Tenant Email Templates Options (for dropdown)
 */
export function useEmailTemplatesOptions() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    async function fetchData() {
      try {
        setLoading(true);
        const response = await emailTemplatesAPI.getOptions();
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
 * Hook for Tenant WhatsApp Templates
 */
export function useWhatsappTemplates(includeInactive = false) {
  const fetchFn = useCallback(() => whatsappTemplatesAPI.getAll(includeInactive), [includeInactive]);
  const { data, loading, error, refetch } = useAsyncData(fetchFn, [includeInactive]);
  
  const createMutation = useMutation(whatsappTemplatesAPI.create);
  const updateMutation = useMutation((id, data) => whatsappTemplatesAPI.update(id, data));
  const deleteMutation = useMutation(whatsappTemplatesAPI.delete);

  return {
    whatsappTemplates: data,
    loading,
    error,
    refetch,
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
  };
}

/**
 * Hook for WhatsApp templates options (for dropdown in Dispositions).
 * Uses WhatsApp module templates (HEADER/BODY/FOOTER) from /api/tenant/whatsapp/templates.
 */
export function useWhatsappTemplatesOptions() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    async function fetchData() {
      try {
        setLoading(true);
        // Fetch from WhatsApp module templates (whatsapp_business_templates),
        // including inactive so existing selections don't disappear when a template is deactivated.
        const response = await whatsappModuleTemplatesAPI.getAll(true, null);
        const rows = response.data?.data || [];
        // Normalize to { id, name } so existing dropdown mapping keeps working.
        // Mark inactive templates in the label so users can see they are inactive.
        const normalized = rows.map((t) => {
          const baseName = t.template_name
            ? `${t.template_name}${t.language ? ` (${t.language})` : ''}`
            : t.name || '';
          const label =
            t.status === 'inactive' ? `${baseName} (inactive)` : baseName;
          return {
            id: String(t.id),
            name: label,
          };
        });
        if (mounted) {
          setData(normalized);
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
