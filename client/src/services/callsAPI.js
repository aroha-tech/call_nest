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
    q,
    contact_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only,
    /** Only attempts with a disposition and/or agent-visible notes (excludes “dial started” stubs). */
    meaningful_only,
    sort_by,
    sort_dir,
  } = {}) =>
    axiosInstance.get(`${BASE}`, {
      params: {
        page,
        limit,
        q: q || undefined,
        contact_id: contact_id || undefined,
        disposition_id: disposition_id || undefined,
        agent_user_id: agent_user_id || undefined,
        direction: direction || undefined,
        status: status || undefined,
        is_connected: is_connected === undefined ? undefined : is_connected,
        started_after: started_after || undefined,
        started_before: started_before || undefined,
        today_only: today_only ? '1' : undefined,
        meaningful_only: meaningful_only ? '1' : undefined,
        sort_by: sort_by || undefined,
        sort_dir: sort_dir || undefined,
      },
    }),

  listIds: ({
    q,
    contact_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only,
    meaningful_only,
  } = {}) =>
    axiosInstance.get(`${BASE}/ids`, {
      params: {
        q: q || undefined,
        contact_id: contact_id || undefined,
        disposition_id: disposition_id || undefined,
        agent_user_id: agent_user_id || undefined,
        direction: direction || undefined,
        status: status || undefined,
        is_connected: is_connected === undefined ? undefined : is_connected,
        started_after: started_after || undefined,
        started_before: started_before || undefined,
        today_only: today_only ? '1' : undefined,
        meaningful_only: meaningful_only ? '1' : undefined,
      },
    }),

  metrics: ({
    q,
    contact_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only,
    meaningful_only,
  } = {}) =>
    axiosInstance.get(`${BASE}/metrics`, {
      params: {
        q: q || undefined,
        contact_id: contact_id || undefined,
        disposition_id: disposition_id || undefined,
        agent_user_id: agent_user_id || undefined,
        direction: direction || undefined,
        status: status || undefined,
        is_connected: is_connected === undefined ? undefined : is_connected,
        started_after: started_after || undefined,
        started_before: started_before || undefined,
        today_only: today_only ? '1' : undefined,
        meaningful_only: meaningful_only ? '1' : undefined,
      },
    }),

  patchNotes: (attemptId, { notes } = {}) =>
    axiosInstance.patch(`${BASE}/${attemptId}/notes`, { notes: notes ?? null }),

  setDisposition: (attemptId, { disposition_id, notes, deal_id, stage_id } = {}) =>
    axiosInstance.put(`${BASE}/${attemptId}/disposition`, {
      disposition_id: disposition_id ?? null,
      notes: notes ?? null,
      ...(deal_id != null && deal_id !== '' ? { deal_id } : {}),
      ...(stage_id != null && stage_id !== '' ? { stage_id } : {}),
    }),
};

