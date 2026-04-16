import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/dialer-sessions';

export const dialerSessionsAPI = {
  list: ({
    page = 1,
    limit = 20,
    q,
    status,
    provider,
    created_after,
    created_before,
  } = {}) =>
    axiosInstance.get(`${BASE}`, {
      params: {
        page,
        limit,
        q: q || undefined,
        status: status || undefined,
        provider: provider || undefined,
        created_after: created_after || undefined,
        created_before: created_before || undefined,
      },
    }),

  create: ({ contact_ids = [], provider = 'dummy', dialing_set_id = null, call_script_id = null } = {}) =>
    axiosInstance.post(`${BASE}`, { contact_ids, provider, dialing_set_id, call_script_id }),

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  updateItem: (sessionId, itemId, body) =>
    axiosInstance.patch(`${BASE}/${sessionId}/items/${itemId}`, body),

  next: (id) => axiosInstance.post(`${BASE}/${id}/next`),

  pause: (id) => axiosInstance.post(`${BASE}/${id}/pause`),

  resume: (id) => axiosInstance.post(`${BASE}/${id}/resume`),

  cancel: (id) => axiosInstance.post(`${BASE}/${id}/cancel`),
};

