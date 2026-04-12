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

  list: ({
    page = 1,
    limit = 20,
    contact_id,
    disposition_id,
    agent_user_id,
    started_after,
    started_before,
  } = {}) =>
    axiosInstance.get(`${BASE}`, {
      params: {
        page,
        limit,
        contact_id: contact_id || undefined,
        disposition_id: disposition_id || undefined,
        agent_user_id: agent_user_id || undefined,
        started_after: started_after || undefined,
        started_before: started_before || undefined,
      },
    }),

  setDisposition: (attemptId, { disposition_id, notes, deal_id, stage_id } = {}) =>
    axiosInstance.put(`${BASE}/${attemptId}/disposition`, {
      disposition_id: disposition_id ?? null,
      notes: notes ?? null,
      ...(deal_id != null && deal_id !== '' ? { deal_id } : {}),
      ...(stage_id != null && stage_id !== '' ? { stage_id } : {}),
    }),
};

