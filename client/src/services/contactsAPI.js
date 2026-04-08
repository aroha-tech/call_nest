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

export const contactsAPI = {
  getAll: ({
    search,
    page = 1,
    limit = 20,
    type,
    status_id,
    filter_manager_id,
    filter_assigned_user_id,
    campaign_id,
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
        status_id: status_id || undefined,
        filter_manager_id: contactFilterParam(filter_manager_id),
        filter_assigned_user_id: contactFilterParam(filter_assigned_user_id),
        campaign_id: campaignFilterParam(campaign_id),
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

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  create: (data) => axiosInstance.post(`${BASE}`, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  remove: (id, payload = null) =>
    axiosInstance.delete(`${BASE}/${id}`, payload ? { data: payload } : undefined),

  removeBulk: (ids, payload = {}) =>
    axiosInstance.post(`${BASE}/bulk-delete`, { ids, ...payload }),

  assign: (payload) => axiosInstance.post(`${BASE}/assign`, payload),

  getCustomFields: () => axiosInstance.get(`${BASE}/custom-fields`),

  getContactCustomFields: (contactId) =>
    axiosInstance.get(`${BASE}/${contactId}/custom-fields`),

  exportCsv: ({
    search,
    type,
    status_id,
    include_custom_fields = true,
    filter_manager_id,
    filter_assigned_user_id,
    campaign_id,
  } = {}) =>
    axiosInstance.get(`${BASE}/export/csv`, {
      params: {
        search: search || undefined,
        type: type || undefined,
        status_id: status_id || undefined,
        include_custom_fields: include_custom_fields ? '1' : '0',
        filter_manager_id: contactFilterParam(filter_manager_id),
        filter_assigned_user_id: contactFilterParam(filter_assigned_user_id),
        campaign_id: campaignFilterParam(campaign_id),
      },
      responseType: 'blob',
    }),

  previewImport: (file) => {
    const form = new FormData();
    form.append('file', file);
    return axiosInstance.post(`${BASE}/import/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  importCsv: ({ file, type = 'lead', mode = 'skip', default_country_code = '+91', mapping } = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('mode', mode);
    form.append('created_source', 'import');
    form.append('default_country_code', default_country_code);
    if (mapping) {
      form.append('mapping', JSON.stringify(mapping));
    }
    return axiosInstance.post(`${BASE}/import/csv`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Server-resolved sample rows (same rules as import) for review step */
  resolveImportPreview: ({
    file,
    mode = 'skip',
    default_country_code = '+91',
    mapping,
    limit = 12,
  } = {}) => {
    const form = new FormData();
    form.append('file', file);
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

