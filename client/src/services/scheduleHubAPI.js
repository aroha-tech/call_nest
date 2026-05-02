import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/schedule-hub';

export const scheduleHubAPI = {
  meta: () => axiosInstance.get(`${BASE}/meta`),
  summary: (params) => axiosInstance.get(`${BASE}/summary`, { params }),
  meetings: (params) => axiosInstance.get(`${BASE}/meetings`, { params }),
  followUps: (params) => axiosInstance.get(`${BASE}/follow-ups`, { params }),
  followUpsCalendar: (params) => axiosInstance.get(`${BASE}/follow-ups/calendar`, { params }),
  followUpsMetrics: (params) => axiosInstance.get(`${BASE}/follow-ups/metrics`, { params }),
  createFollowUp: (payload) => axiosInstance.post(`${BASE}/follow-ups`, payload),
  updateFollowUp: (id, payload) => axiosInstance.put(`${BASE}/follow-ups/${id}`, payload),
  deleteFollowUp: (id) => axiosInstance.delete(`${BASE}/follow-ups/${id}`),
  getFollowUp: (id) => axiosInstance.get(`${BASE}/follow-ups/${id}`),
};
