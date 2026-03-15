import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/whatsapp';

export const whatsappAccountsAPI = {
  getAll: (includeInactive = false) =>
    axiosInstance.get(`${BASE}/accounts`, { params: { include_inactive: includeInactive } }),
  getById: (id) => axiosInstance.get(`${BASE}/accounts/${id}`),
  create: (data) => axiosInstance.post(`${BASE}/accounts`, data),
  update: (id, data) => axiosInstance.put(`${BASE}/accounts/${id}`, data),
  delete: (id) => axiosInstance.delete(`${BASE}/accounts/${id}`),
  activate: (id) => axiosInstance.post(`${BASE}/accounts/${id}/activate`),
  deactivate: (id) => axiosInstance.post(`${BASE}/accounts/${id}/deactivate`),
  testConnection: (payload) =>
    axiosInstance.post(`${BASE}/accounts/test-connection`, payload),
  getTemplatesFromProvider: (accountId, params = {}) =>
    axiosInstance.get(`${BASE}/accounts/${accountId}/templates`, { params: { waba_id: params.waba_id || undefined } }),
};

export const whatsappTemplatesAPI = {
  getAll: (includeInactive = false, whatsappAccountId = null) =>
    axiosInstance.get(`${BASE}/templates`, {
      params: { include_inactive: includeInactive, whatsapp_account_id: whatsappAccountId || undefined },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/templates/${id}`),
  create: (data) => axiosInstance.post(`${BASE}/templates`, data),
  update: (id, data) => axiosInstance.put(`${BASE}/templates/${id}`, data),
  delete: (id) => axiosInstance.delete(`${BASE}/templates/${id}`),
  activate: (id) => axiosInstance.post(`${BASE}/templates/${id}/activate`),
  deactivate: (id) => axiosInstance.post(`${BASE}/templates/${id}/deactivate`),
};

export const whatsappMessagesAPI = {
  getAll: (params = {}) =>
    axiosInstance.get(`${BASE}/messages`, {
      params: {
        contact_id: params.contact_id,
        status: params.status,
        whatsapp_account_id: params.whatsapp_account_id || undefined,
        template_id: params.template_id || undefined,
        search: params.search || undefined,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/messages/${id}`),
};

export const whatsappSendAPI = {
  sendTemplate: (data) => axiosInstance.post(`${BASE}/send`, data),
  sendText: (data) => axiosInstance.post(`${BASE}/send-text`, data),
};

export const whatsappLogsAPI = {
  getAll: (params = {}) =>
    axiosInstance.get(`${BASE}/logs`, {
      params: {
        whatsapp_account_id: params.whatsapp_account_id || undefined,
        search: params.search || undefined,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/logs/${id}`),
};

export const whatsappSettingsAPI = {
  getSettings: () => axiosInstance.get(`${BASE}/settings`),
  updateSettings: (mode) => axiosInstance.put(`${BASE}/settings`, { mode }),
};

