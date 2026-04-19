import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/schedule-hub';

export const scheduleHubAPI = {
  meta: () => axiosInstance.get(`${BASE}/meta`),
  summary: (params) => axiosInstance.get(`${BASE}/summary`, { params }),
  meetings: (params) => axiosInstance.get(`${BASE}/meetings`, { params }),
  callbacks: (params) => axiosInstance.get(`${BASE}/callbacks`, { params }),
  callbacksCalendar: (params) => axiosInstance.get(`${BASE}/callbacks/calendar`, { params }),
  callbacksMetrics: (params) => axiosInstance.get(`${BASE}/callbacks/metrics`, { params }),
  createCallback: (payload) => axiosInstance.post(`${BASE}/callbacks`, payload),
  updateCallback: (id, payload) => axiosInstance.put(`${BASE}/callbacks/${id}`, payload),
  deleteCallback: (id) => axiosInstance.delete(`${BASE}/callbacks/${id}`),
  getCallback: (id) => axiosInstance.get(`${BASE}/callbacks/${id}`),
};

