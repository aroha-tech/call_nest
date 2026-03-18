import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contact-custom-fields';

export const contactCustomFieldsAPI = {
  getAll: ({ includeInactive = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get(BASE, {
      params: {
        include_inactive: includeInactive,
        page,
        limit,
      },
    }),

  create: (data) => axiosInstance.post(BASE, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  activate: (id) => axiosInstance.post(`${BASE}/${id}/activate`),

  deactivate: (id) => axiosInstance.post(`${BASE}/${id}/deactivate`),

  remove: (id) => axiosInstance.delete(`${BASE}/${id}`),
};

