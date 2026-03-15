import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/email';

export const emailSettingsAPI = {
  getSettings: () => axiosInstance.get(`${BASE}/settings`),
};

export const emailAccountsAPI = {
  getAll: (includeInactive = false) =>
    axiosInstance.get(`${BASE}/accounts`, { params: { include_inactive: includeInactive } }),
  getById: (id) => axiosInstance.get(`${BASE}/accounts/${id}`),
  create: (data) => axiosInstance.post(`${BASE}/accounts`, data),
  update: (id, data) => axiosInstance.put(`${BASE}/accounts/${id}`, data),
  delete: (id) => axiosInstance.delete(`${BASE}/accounts/${id}`),
  activate: (id) => axiosInstance.post(`${BASE}/accounts/${id}/activate`),
  deactivate: (id) => axiosInstance.post(`${BASE}/accounts/${id}/deactivate`),
  /** Returns { url } for redirect to Google OAuth. */
  getOAuthGoogleUrl: () => axiosInstance.get(`${BASE}/oauth/google/url`),
  /** Returns { url } for redirect to Microsoft OAuth. */
  getOAuthOutlookUrl: () => axiosInstance.get(`${BASE}/oauth/outlook/url`),
};

export const emailTemplatesAPI = {
  getAll: (includeInactive = false, email_account_id) =>
    axiosInstance.get(`${BASE}/templates`, {
      params: {
        include_inactive: includeInactive,
        email_account_id: email_account_id || undefined,
      },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/templates/${id}`),
  create: (data) => axiosInstance.post(`${BASE}/templates`, data),
  update: (id, data) => axiosInstance.put(`${BASE}/templates/${id}`, data),
  delete: (id) => axiosInstance.delete(`${BASE}/templates/${id}`),
  activate: (id) => axiosInstance.post(`${BASE}/templates/${id}/activate`),
  deactivate: (id) => axiosInstance.post(`${BASE}/templates/${id}/deactivate`),
};

export const emailMessagesAPI = {
  getAll: (params = {}) =>
    axiosInstance.get(`${BASE}/messages`, {
      params: {
        folder: params.folder ?? 'inbox',
        contact_id: params.contact_id,
        email_account_id: params.email_account_id || undefined,
        direction: params.direction,
        status: params.status,
        search: params.search || undefined,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/messages/${id}`),
  getThread: (threadId) => axiosInstance.get(`${BASE}/messages/thread/${threadId}`),
};

export const emailSendAPI = {
  send: (data) => axiosInstance.post(`${BASE}/send`, data),
};
