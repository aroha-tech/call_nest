import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/integrations';

export const integrationsAPI = {
  getAll: () => axiosInstance.get(`${BASE}`),
  getById: (id) => axiosInstance.get(`${BASE}/${id}`),
  upsert: (data) => axiosInstance.post(`${BASE}`, data),
};

