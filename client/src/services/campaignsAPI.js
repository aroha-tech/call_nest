import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/campaigns';

export const campaignsAPI = {
  /** @param {Record<string, unknown>} [params] — page, limit, search, type, manager_id, show_paused, include_archived */
  list: (params) => axiosInstance.get(BASE, { params }),

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  create: (data) => axiosInstance.post(BASE, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  /** Soft-delete (sets deleted_at / deleted_by on server). */
  softDelete: (id) => axiosInstance.delete(`${BASE}/${id}`),

  /** Agent workspace: contacts in this campaign assigned to current user (scenarios 4 & 9). */
  open: (id, { page = 1, limit = 20, search = '' } = {}) =>
    axiosInstance.post(`${BASE}/${id}/open`, null, {
      params: { page, limit, search: search || undefined },
    }),

  /** Preview contacts matching filter rules (admin/manager/agent visibility). */
  preview: (body) => axiosInstance.post(`${BASE}/preview`, body),
};
