import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contact-tags';

export const contactTagsAPI = {
  list: () => axiosInstance.get(BASE),
  create: (body) => axiosInstance.post(BASE, body),
  update: (id, body) => axiosInstance.put(`${BASE}/${id}`, body),
  softDelete: (id) => axiosInstance.delete(`${BASE}/${id}`),
};
