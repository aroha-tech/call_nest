import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/integrations';

export const integrationsAPI = {
  getAll: () => axiosInstance.get(`${BASE}`),
  getById: (id) => axiosInstance.get(`${BASE}/${id}`),
  upsert: (data) => axiosInstance.post(`${BASE}`, data),
  listApps: () => axiosInstance.get(`${BASE}/apps`),
  createApp: (data) => axiosInstance.post(`${BASE}/apps`, data),
  rotateAppKey: (appId) => axiosInstance.post(`${BASE}/apps/${appId}/rotate-key`),
};

