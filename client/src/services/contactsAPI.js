import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contacts';

function contactFilterParam(v) {
  if (v === undefined || v === null || v === '' || v === '__all__') return undefined;
  if (v === 'unassigned') return 'unassigned';
  return v;
}

function campaignFilterParam(v) {
  if (v === undefined || v === null || v === '' || v === '__all__') return undefined;
  if (v === 'none') return 'none';
  return v;
}

function jsonArrayParam(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length === 0) return undefined;
  return JSON.stringify(v);
}

/** Same query params as list / GET export — used by POST export with JSON body for scope + columns. */
function buildExportCsvQueryParams({
  search,
  type,
  status_id,
  status_ids,
  touch_status,
  min_call_count,
  max_call_count,
  last_called_after,
  last_called_before,
  filter_manager_id,
  filter_assigned_user_id,
  filter_manager_ids,
  filter_unassigned_managers,
  campaign_id,
  campaign_ids,
  filter_tag_ids,
  column_filters,
} = {}) {
  return {
    search: search || undefined,
    type: type || undefined,
    status_id: status_ids ? undefined : status_id || undefined,
    status_ids: jsonArrayParam(status_ids),
    touch_status: touch_status || undefined,
    min_call_count: min_call_count ?? undefined,
    max_call_count: max_call_count ?? undefined,
    last_called_after: last_called_after || undefined,
    last_called_before: last_called_before || undefined,
    filter_manager_id: contactFilterParam(filter_manager_id),
    filter_assigned_user_id: contactFilterParam(filter_assigned_user_id),
    filter_manager_ids:
      filter_manager_ids && (Array.isArray(filter_manager_ids) ? filter_manager_ids.length : String(filter_manager_ids).length)
        ? typeof filter_manager_ids === 'string'
          ? filter_manager_ids
          : JSON.stringify(filter_manager_ids)
        : undefined,
    filter_unassigned_managers: filter_unassigned_managers ? '1' : undefined,
    campaign_id: campaign_ids ? undefined : campaignFilterParam(campaign_id),
    campaign_ids: jsonArrayParam(campaign_ids),
    filter_tag_ids: jsonArrayParam(filter_tag_ids),
    column_filters:
      column_filters && (Array.isArray(column_filters) ? column_filters.length : String(column_filters).length)
        ? typeof column_filters === 'string'
          ? column_filters
          : JSON.stringify(column_filters)
        : undefined,
  };
}

export const contactsAPI = {
  getAll: ({
    search,
    page = 1,
    limit = 20,
    type,
    status_id,
    status_ids,
    touch_status,
    min_call_count,
    max_call_count,
    last_called_after,
    last_called_before,
    filter_manager_id,
    filter_assigned_user_id,
    filter_manager_ids,
    filter_unassigned_managers,
    campaign_id,
    campaign_ids,
    filter_tag_ids,
    sort_by,
    sort_dir,
    column_filters,
  } = {}) =>
    axiosInstance.get(`${BASE}`, {
      params: {
        search: search || undefined,
        page,
        limit,
        type: type || undefined,
        status_id: status_ids ? undefined : status_id || undefined,
        status_ids: jsonArrayParam(status_ids),
        touch_status: touch_status || undefined,
        min_call_count: min_call_count ?? undefined,
        max_call_count: max_call_count ?? undefined,
        last_called_after: last_called_after || undefined,
        last_called_before: last_called_before || undefined,
        filter_manager_id: contactFilterParam(filter_manager_id),
        filter_assigned_user_id: contactFilterParam(filter_assigned_user_id),
        filter_manager_ids:
          filter_manager_ids && (Array.isArray(filter_manager_ids) ? filter_manager_ids.length : String(filter_manager_ids).length)
            ? typeof filter_manager_ids === 'string'
              ? filter_manager_ids
              : JSON.stringify(filter_manager_ids)
            : undefined,
        filter_unassigned_managers: filter_unassigned_managers ? '1' : undefined,
        campaign_id: campaign_ids ? undefined : campaignFilterParam(campaign_id),
        campaign_ids: jsonArrayParam(campaign_ids),
        filter_tag_ids: jsonArrayParam(filter_tag_ids),
        sort_by: sort_by || undefined,
        sort_dir: sort_dir || undefined,
        column_filters:
          column_filters && (Array.isArray(column_filters) ? column_filters.length : String(column_filters).length)
            ? typeof column_filters === 'string'
              ? column_filters
              : JSON.stringify(column_filters)
            : undefined,
      },
    }),

  listIds: (params = {}) => {
    const {
      search,
      type,
      status_id,
      status_ids,
      touch_status,
      min_call_count,
      max_call_count,
      last_called_after,
      last_called_before,
      filter_manager_id,
      filter_assigned_user_id,
      filter_manager_ids,
      filter_unassigned_managers,
      campaign_id,
      campaign_ids,
      filter_tag_ids,
      column_filters,
    } = params;
    return axiosInstance.get(`${BASE}/list-ids`, {
      params: {
        search: search || undefined,
        type: type || undefined,
        status_id: status_ids ? undefined : status_id || undefined,
        status_ids: jsonArrayParam(status_ids),
        touch_status: touch_status || undefined,
        min_call_count: min_call_count ?? undefined,
        max_call_count: max_call_count ?? undefined,
        last_called_after: last_called_after || undefined,
        last_called_before: last_called_before || undefined,
        filter_manager_id: contactFilterParam(filter_manager_id),
        filter_assigned_user_id: contactFilterParam(filter_assigned_user_id),
        filter_manager_ids:
          filter_manager_ids && (Array.isArray(filter_manager_ids) ? filter_manager_ids.length : String(filter_manager_ids).length)
            ? typeof filter_manager_ids === 'string'
              ? filter_manager_ids
              : JSON.stringify(filter_manager_ids)
            : undefined,
        filter_unassigned_managers: filter_unassigned_managers ? '1' : undefined,
        campaign_id: campaign_ids ? undefined : campaignFilterParam(campaign_id),
        campaign_ids: jsonArrayParam(campaign_ids),
        filter_tag_ids: jsonArrayParam(filter_tag_ids),
        column_filters:
          column_filters && (Array.isArray(column_filters) ? column_filters.length : String(column_filters).length)
            ? typeof column_filters === 'string'
              ? column_filters
              : JSON.stringify(column_filters)
            : undefined,
      },
    });
  },

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  /**
   * Activity for one lead/contact.
   * @param {string|number} id
   * @param {{ mode?: 'full'|'summary'|'timeline', timeline_limit?: number, timeline_cursor?: string|null }} [params]
   */
  getActivity: (id, params = {}) =>
    axiosInstance.get(`${BASE}/${id}/activity`, {
      params: {
        mode: params.mode,
        timeline_limit: params.timeline_limit,
        timeline_cursor: params.timeline_cursor || undefined,
      },
    }),

  appendPhone: (contactId, payload) => axiosInstance.post(`${BASE}/${contactId}/phones`, payload),

  create: (data) => axiosInstance.post(`${BASE}`, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  remove: (id, payload = null) =>
    axiosInstance.delete(`${BASE}/${id}`, payload ? { data: payload } : undefined),

  removeBulk: (ids, payload = {}) =>
    axiosInstance.post(`${BASE}/bulk-delete`, { ids, ...payload }),

  bulkAddTags: (body) => axiosInstance.post(`${BASE}/bulk-add-tags`, body),

  bulkRemoveTags: (body) => axiosInstance.post(`${BASE}/bulk-remove-tags`, body),

  assign: (payload) => axiosInstance.post(`${BASE}/assign`, payload),

  getCustomFields: () => axiosInstance.get(`${BASE}/custom-fields`),

  /** Lead pipeline counts (total + new / contacted / qualified / lost by status master code). */
  getLeadPipelineSummary: () => axiosInstance.get(`${BASE}/lead-pipeline-summary`),

  /** Contact list dashboard: totals and status buckets (same visibility as list). */
  getContactDashboardSummary: () => axiosInstance.get(`${BASE}/contact-dashboard-summary`),

  getContactCustomFields: (contactId) =>
    axiosInstance.get(`${BASE}/${contactId}/custom-fields`),

  exportCsv: ({
    search,
    type,
    status_id,
    status_ids,
    include_custom_fields = true,
    filter_manager_id,
    filter_assigned_user_id,
    filter_manager_ids,
    filter_unassigned_managers,
    campaign_id,
    campaign_ids,
    filter_tag_ids,
    touch_status,
    min_call_count,
    max_call_count,
    last_called_after,
    last_called_before,
    column_filters,
  } = {}) =>
    axiosInstance.get(`${BASE}/export/csv`, {
      params: {
        ...buildExportCsvQueryParams({
          search,
          type,
          status_id,
          status_ids,
          touch_status,
          min_call_count,
          max_call_count,
          last_called_after,
          last_called_before,
          filter_manager_id,
          filter_assigned_user_id,
          filter_manager_ids,
          filter_unassigned_managers,
          campaign_id,
          campaign_ids,
          filter_tag_ids,
          column_filters,
        }),
        include_custom_fields: include_custom_fields ? '1' : '0',
      },
      responseType: 'blob',
    }),

  /** Dynamic export: filters as query params; body has export_scope, selected_ids, columns. */
  exportCsvPost: (queryParams, body) =>
    axiosInstance.post(`${BASE}/export/csv`, body, {
      params: buildExportCsvQueryParams(queryParams),
      responseType: 'blob',
    }),

  previewImport: (file) => {
    const form = new FormData();
    form.append('file', file);
    return axiosInstance.post(`${BASE}/import/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  importCsv: ({
    file,
    type = 'lead',
    mode = 'skip',
    default_country_code = '+91',
    mapping,
    tag_ids,
    import_manager_id,
    import_assigned_user_id,
  } = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('mode', mode);
    form.append('created_source', 'import');
    form.append('default_country_code', default_country_code);
    if (mapping) {
      form.append('mapping', JSON.stringify(mapping));
    }
    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      form.append('tag_ids', JSON.stringify(tag_ids));
    }
    if (import_manager_id !== undefined && import_manager_id !== null && import_manager_id !== '') {
      form.append('import_manager_id', String(import_manager_id));
    }
    if (import_assigned_user_id !== undefined && import_assigned_user_id !== null && import_assigned_user_id !== '') {
      form.append('import_assigned_user_id', String(import_assigned_user_id));
    }
    return axiosInstance.post(`${BASE}/import/csv`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Server-resolved sample rows (same rules as import) for review step */
  resolveImportPreview: ({
    file,
    type = 'lead',
    mode = 'skip',
    default_country_code = '+91',
    mapping,
    limit = 12,
  } = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('mode', mode);
    form.append('default_country_code', default_country_code);
    form.append('limit', String(limit));
    if (mapping) {
      form.append('mapping', JSON.stringify(mapping));
    }
    return axiosInstance.post(`${BASE}/import/resolve-preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  listImportHistory: ({ page = 1, limit = 20, type } = {}) =>
    axiosInstance.get(`${BASE}/import/history`, {
      params: { page, limit, type: type || undefined },
    }),
};

