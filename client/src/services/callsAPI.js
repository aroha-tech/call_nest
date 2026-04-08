import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/calls';

export const callsAPI = {
  start: ({ contact_id, contact_phone_id, provider = 'dummy', notes } = {}) =>
    axiosInstance.post(`${BASE}/start`, {
      contact_id,
      contact_phone_id: contact_phone_id ?? null,
      provider,
      notes: notes ?? null,
    }),

  startBulk: ({ contact_ids = [], provider = 'dummy' } = {}) =>
    axiosInstance.post(`${BASE}/start/bulk`, { contact_ids, provider }),

  list: ({ page = 1, limit = 20, contact_id } = {}) =>
    axiosInstance.get(`${BASE}`, { params: { page, limit, contact_id: contact_id || undefined } }),

  setDisposition: (attemptId, { disposition_id, notes } = {}) =>
    axiosInstance.put(`${BASE}/${attemptId}/disposition`, { disposition_id: disposition_id ?? null, notes: notes ?? null }),
};

