import { axiosInstance } from './axiosInstance';

// ============================================
// Super Admin APIs (Platform Admin)
// ============================================

// Industries
export const industriesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/industries', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/industries/options'),
  getById: (id) => axiosInstance.get(`/api/admin/industries/${id}`),
  create: (data) => axiosInstance.post('/api/admin/industries', data),
  update: (id, data) => axiosInstance.put(`/api/admin/industries/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/industries/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/industries/${id}`),
};

export const industryFieldDefinitionsAPI = {
  list: (industryId) => axiosInstance.get(`/api/admin/industries/${industryId}/field-definitions`),
  create: (industryId, data) =>
    axiosInstance.post(`/api/admin/industries/${industryId}/field-definitions`, data),
  update: (industryId, fieldId, data) =>
    axiosInstance.put(`/api/admin/industries/${industryId}/field-definitions/${fieldId}`, data),
  remove: (industryId, fieldId) =>
    axiosInstance.delete(`/api/admin/industries/${industryId}/field-definitions/${fieldId}`),
};

// Disposition Types
export const dispoTypesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/dispo-types', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/dispo-types/options'),
  getById: (id) => axiosInstance.get(`/api/admin/dispo-types/${id}`),
  create: (data) => axiosInstance.post('/api/admin/dispo-types', data),
  update: (id, data) => axiosInstance.put(`/api/admin/dispo-types/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/dispo-types/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/dispo-types/${id}`),
};

export const campaignTypesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/campaign-types', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/campaign-types/options'),
  getById: (id) => axiosInstance.get(`/api/admin/campaign-types/${id}`),
  create: (data) => axiosInstance.post('/api/admin/campaign-types', data),
  update: (id, data) => axiosInstance.put(`/api/admin/campaign-types/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/campaign-types/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/campaign-types/${id}`),
};

export const campaignStatusesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/campaign-statuses', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/campaign-statuses/options'),
  getById: (id) => axiosInstance.get(`/api/admin/campaign-statuses/${id}`),
  create: (data) => axiosInstance.post('/api/admin/campaign-statuses', data),
  update: (id, data) => axiosInstance.put(`/api/admin/campaign-statuses/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/campaign-statuses/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/campaign-statuses/${id}`),
};

// Disposition Actions
export const dispoActionsAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/dispo-actions', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/dispo-actions/options'),
  getById: (id) => axiosInstance.get(`/api/admin/dispo-actions/${id}`),
  create: (data) => axiosInstance.post('/api/admin/dispo-actions', data),
  update: (id, data) => axiosInstance.put(`/api/admin/dispo-actions/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/dispo-actions/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/dispo-actions/${id}`),
};

// Contact Statuses
export const contactStatusesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/contact-statuses', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/contact-statuses/options'),
  getById: (id) => axiosInstance.get(`/api/admin/contact-statuses/${id}`),
  create: (data) => axiosInstance.post('/api/admin/contact-statuses', data),
  update: (id, data) => axiosInstance.put(`/api/admin/contact-statuses/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/contact-statuses/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/contact-statuses/${id}`),
};

// Template Variables (Super Admin - system-level master)
export const templateVariablesAdminAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/template-variables', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getModules: () => axiosInstance.get('/api/admin/template-variables/modules'),
  getById: (id) => axiosInstance.get(`/api/admin/template-variables/${id}`),
  create: (data) => axiosInstance.post('/api/admin/template-variables', data),
  update: (id, data) => axiosInstance.put(`/api/admin/template-variables/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/template-variables/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/template-variables/${id}`),
};

// Contact Temperatures
export const contactTemperaturesAPI = {
  getAll: ({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/contact-temperatures', {
      params: { search, include_inactive: includeInactive, page, limit },
    }),
  getOptions: () => axiosInstance.get('/api/admin/contact-temperatures/options'),
  getById: (id) => axiosInstance.get(`/api/admin/contact-temperatures/${id}`),
  create: (data) => axiosInstance.post('/api/admin/contact-temperatures', data),
  update: (id, data) => axiosInstance.put(`/api/admin/contact-temperatures/${id}`, data),
  toggleActive: (id) => axiosInstance.post(`/api/admin/contact-temperatures/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`/api/admin/contact-temperatures/${id}`),
  move: (id, direction, position) =>
    axiosInstance.post(`/api/admin/contact-temperatures/${id}/move`, { direction, position }),
};

// Default Dispositions
export const defaultDispositionsAPI = {
  getAll: ({ industryId, includeInactive = false, search = '', page = 1, limit = 10 } = {}) => {
    const params = { include_inactive: includeInactive, search, page, limit };
    if (industryId === null) {
      params.industry_id = 'null';
    } else if (industryId !== undefined) {
      params.industry_id = industryId;
    }
    return axiosInstance.get('/api/admin/default-dispositions', { params });
  },
  getById: (id) => axiosInstance.get(`/api/admin/default-dispositions/${id}`),
  create: (data) => axiosInstance.post('/api/admin/default-dispositions', data),
  update: (id, data) => axiosInstance.put(`/api/admin/default-dispositions/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/admin/default-dispositions/${id}`),
};

// Default Dialing Sets
export const defaultDialingSetsAPI = {
  getAll: (industryId = undefined, includeInactive = false) => {
    // Send "null" string for "All Industries", omit for no filter
    const params = { include_inactive: includeInactive };
    if (industryId === null) {
      params.industry_id = 'null';
    } else if (industryId !== undefined) {
      params.industry_id = industryId;
    }
    return axiosInstance.get('/api/admin/default-dialing-sets', { params });
  },
  getById: (id) => axiosInstance.get(`/api/admin/default-dialing-sets/${id}`),
  create: (data) => axiosInstance.post('/api/admin/default-dialing-sets', data),
  update: (id, data) => axiosInstance.put(`/api/admin/default-dialing-sets/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/admin/default-dialing-sets/${id}`),
};

// Default Dialing Set Dispositions
export const defaultDialingSetDispositionsAPI = {
  getAll: (dialingSetId) =>
    axiosInstance.get('/api/admin/default-dialing-set-dispositions', {
      params: { dialing_set_id: dialingSetId },
    }),
  create: (data) => axiosInstance.post('/api/admin/default-dialing-set-dispositions', data),
  delete: (id) => axiosInstance.delete(`/api/admin/default-dialing-set-dispositions/${id}`),
  move: (id, direction, position) =>
    axiosInstance.post(`/api/admin/default-dialing-set-dispositions/${id}/move`, { direction, position }),
};

// Default Disposition Actions
export const defaultDispositionActionsAPI = {
  getAll: (dispositionId) =>
    axiosInstance.get('/api/admin/default-disposition-actions', {
      params: { disposition_id: dispositionId },
    }),
  create: (data) => axiosInstance.post('/api/admin/default-disposition-actions', data),
  delete: (id) => axiosInstance.delete(`/api/admin/default-disposition-actions/${id}`),
  move: (id, direction, position) =>
    axiosInstance.post(`/api/admin/default-disposition-actions/${id}/move`, { direction, position }),
};

// ============================================
// Tenant APIs
// ============================================

// Tenant Dialing Sets
export const dialingSetsAPI = {
  getAll: (includeInactive = false) =>
    axiosInstance.get('/api/tenant/dialing-sets', { params: { include_inactive: includeInactive } }),
  getById: (id) => axiosInstance.get(`/api/tenant/dialing-sets/${id}`),
  create: (data) => axiosInstance.post('/api/tenant/dialing-sets', data),
  update: (id, data) => axiosInstance.put(`/api/tenant/dialing-sets/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/dialing-sets/${id}`),
  clone: (defaultDialingSetId) =>
    axiosInstance.post('/api/tenant/dialing-sets/clone', { default_dialing_set_id: defaultDialingSetId }),
};

// Tenant Dispositions
export const dispositionsAPI = {
  getAll: (params = {}) =>
    axiosInstance.get('/api/tenant/dispositions', {
      params: {
        include_inactive: params.includeInactive ?? false,
        search: params.search ?? '',
        page: params.page ?? 1,
        limit: params.limit ?? 10,
      },
    }),
  getById: (id) => axiosInstance.get(`/api/tenant/dispositions/${id}`),
  create: (data) => axiosInstance.post('/api/tenant/dispositions', data),
  update: (id, data) => axiosInstance.put(`/api/tenant/dispositions/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/dispositions/${id}`),
  cloneFromIndustry: (industryId, includeDialingSets = true) =>
    axiosInstance.post('/api/tenant/dispositions/clone', {
      industry_id: industryId,
      include_dialing_sets: includeDialingSets,
    }),
  cloneSingle: (defaultDispositionId) =>
    axiosInstance.post('/api/tenant/dispositions/clone-single', {
      default_disposition_id: defaultDispositionId,
    }),
};

// Tenant Dialing Set Dispositions
export const dialingSetDispositionsAPI = {
  getAll: (dialingSetId) =>
    axiosInstance.get('/api/tenant/dialing-set-dispositions', {
      params: { dialing_set_id: dialingSetId },
    }),
  create: (data) => axiosInstance.post('/api/tenant/dialing-set-dispositions', data),
  delete: (id) => axiosInstance.delete(`/api/tenant/dialing-set-dispositions/${id}`),
  move: (id, direction, position) =>
    axiosInstance.post(`/api/tenant/dialing-set-dispositions/${id}/move`, { direction, position }),
};

// Tenant Disposition Actions
export const dispositionActionsAPI = {
  getAll: (dispositionId) =>
    axiosInstance.get('/api/tenant/disposition-actions', {
      params: { disposition_id: dispositionId },
    }),
  create: (data) => axiosInstance.post('/api/tenant/disposition-actions', data),
  updateTemplates: (id, data) => axiosInstance.put(`/api/tenant/disposition-actions/${id}/templates`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/disposition-actions/${id}`),
  move: (id, direction, position) =>
    axiosInstance.post(`/api/tenant/disposition-actions/${id}/move`, { direction, position }),
};

// Email Templates
export const emailTemplatesAPI = {
  getAll: (includeInactive = false) =>
    axiosInstance.get('/api/tenant/email-templates', { params: { include_inactive: includeInactive } }),
  getOptions: () => axiosInstance.get('/api/tenant/email-templates/options'),
  getById: (id) => axiosInstance.get(`/api/tenant/email-templates/${id}`),
  create: (data) => axiosInstance.post('/api/tenant/email-templates', data),
  update: (id, data) => axiosInstance.put(`/api/tenant/email-templates/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/email-templates/${id}`),
};

// WhatsApp Templates
export const whatsappTemplatesAPI = {
  getAll: (includeInactive = false) =>
    axiosInstance.get('/api/tenant/whatsapp-templates', { params: { include_inactive: includeInactive } }),
  getOptions: () => axiosInstance.get('/api/tenant/whatsapp-templates/options'),
  getById: (id) => axiosInstance.get(`/api/tenant/whatsapp-templates/${id}`),
  create: (data) => axiosInstance.post('/api/tenant/whatsapp-templates', data),
  update: (id, data) => axiosInstance.put(`/api/tenant/whatsapp-templates/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/whatsapp-templates/${id}`),
};

// Call Scripts (tenant)
export const callScriptsAPI = {
  getAll: (params = {}) =>
    axiosInstance.get('/api/tenant/call-scripts', {
      params: {
        search: params.search ?? '',
        include_inactive: params.includeInactive ?? false,
        page: params.page ?? 1,
        limit: params.limit ?? 10,
      },
    }),
  getById: (id) => axiosInstance.get(`/api/tenant/call-scripts/${id}`),
  create: (data) => axiosInstance.post('/api/tenant/call-scripts', data),
  update: (id, data) => axiosInstance.put(`/api/tenant/call-scripts/${id}`, data),
  delete: (id) => axiosInstance.delete(`/api/tenant/call-scripts/${id}`),
};
