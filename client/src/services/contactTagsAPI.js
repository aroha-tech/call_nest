import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contact-tags';

export const contactTagsAPI = {
  list: ({ includeArchived = false } = {}) =>
    axiosInstance.get(BASE, { params: includeArchived ? { includeArchived: 1 } : undefined }),
  create: (body) => axiosInstance.post(BASE, body),
  update: (id, body) => axiosInstance.put(`${BASE}/${id}`, body),
  softDelete: (id) => axiosInstance.delete(`${BASE}/${id}`),
  unarchive: (id) => axiosInstance.patch(`${BASE}/${id}/unarchive`),
  hardDeleteArchived: (id) => axiosInstance.delete(`${BASE}/${id}/permanent`),
};
