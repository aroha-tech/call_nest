import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/opportunities';

export const opportunitiesAPI = {
  /** @param {{ contact_id: string|number }} params */
  list: (params) => axiosInstance.get(BASE, { params }),

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  create: (data) => axiosInstance.post(BASE, data),

  update: (id, data) => axiosInstance.patch(`${BASE}/${id}`, data),

  remove: (id) => axiosInstance.delete(`${BASE}/${id}`),
};
