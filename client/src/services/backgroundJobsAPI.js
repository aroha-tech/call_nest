import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/background-jobs';

/** `'contacts'` (default) or `'leads'` — same job types, leads routes default record type to lead when omitted. */
function entityPrefix(entity) {
  return entity === 'leads' ? 'leads' : 'contacts';
}

export const backgroundJobsAPI = {
  list: (params = {}) => axiosInstance.get(BASE, { params }),

  get: (id) => axiosInstance.get(`${BASE}/${id}`),

  cancel: (id) => axiosInstance.post(`${BASE}/${id}/cancel`),

  /** Soft-delete all completed / failed / cancelled jobs for the tenant (Background tasks UI). */
  dismissFinished: () => axiosInstance.post(`${BASE}/dismiss-finished`),

  downloadUrl: (id) => `${axiosInstance.defaults.baseURL || ''}${BASE}/${id}/download`,

  enqueueImportCsv: (formData, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/import-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  enqueueExportCsv: (body, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/export-csv`, body),

  enqueueBulkAddTags: (body, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/bulk-add-tags`, body),

  enqueueBulkRemoveTags: (body, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/bulk-remove-tags`, body),

  enqueueBulkDelete: (body, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/bulk-delete`, body),

  enqueueBulkAssign: (body, { entity = 'contacts' } = {}) =>
    axiosInstance.post(`${BASE}/${entityPrefix(entity)}/bulk-assign`, body),
};
