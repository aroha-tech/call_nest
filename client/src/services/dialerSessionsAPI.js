import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/dialer-sessions';

function dialSessionsFilterQueryParams({
  q,
  status,
  provider,
  created_after,
  created_before,
  column_filters,
  created_by_user_id,
  script_q,
  items_min,
  items_max,
  called_min,
  called_max,
  connected_min,
  connected_max,
  failed_min,
  failed_max,
  queued_min,
  queued_max,
  duration_min,
  duration_max,
} = {}) {
  const t = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : undefined);
  const raw = {
    q: t(q),
    status: t(status),
    provider: t(provider),
    created_after: t(created_after),
    created_before: t(created_before),
    column_filters: t(column_filters),
    created_by_user_id: t(created_by_user_id),
    script_q: t(script_q),
    items_min: t(items_min),
    items_max: t(items_max),
    called_min: t(called_min),
    called_max: t(called_max),
    connected_min: t(connected_min),
    connected_max: t(connected_max),
    failed_min: t(failed_min),
    failed_max: t(failed_max),
    queued_min: t(queued_min),
    queued_max: t(queued_max),
    duration_min: t(duration_min),
    duration_max: t(duration_max),
  };
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
}

export const dialerSessionsAPI = {
  list: ({
    page = 1,
    limit = 20,
    sort_by,
    sort_dir,
    ...filters
  } = {}) =>
    axiosInstance.get(`${BASE}`, {
      params: {
        page,
        limit,
        sort_by: sort_by || undefined,
        sort_dir: sort_dir || undefined,
        ...dialSessionsFilterQueryParams(filters),
      },
    }),

  listIds: (filters = {}) =>
    axiosInstance.get(`${BASE}/ids`, {
      params: dialSessionsFilterQueryParams(filters),
    }),

  exportCsvPost: (queryParams, body) =>
    axiosInstance.post(`${BASE}/export/csv`, body, {
      params: queryParams || {},
      responseType: 'blob',
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

