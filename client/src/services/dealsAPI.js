import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/deals';

export const dealsAPI = {
  /** @param {{ include_inactive?: boolean }} [params] */
  list: (params) => axiosInstance.get(BASE, { params }),

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  create: (data) => axiosInstance.post(BASE, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  softDelete: (id) => axiosInstance.delete(`${BASE}/${id}`),

  getBoard: (id) => axiosInstance.get(`${BASE}/${id}/board`),

  createStage: (dealId, data) => axiosInstance.post(`${BASE}/${dealId}/stages`, data),

  updateStage: (dealId, stageId, data) => axiosInstance.patch(`${BASE}/${dealId}/stages/${stageId}`, data),

  deleteStage: (dealId, stageId) => axiosInstance.delete(`${BASE}/${dealId}/stages/${stageId}`),

  reorderStages: (dealId, stageIds) =>
    axiosInstance.put(`${BASE}/${dealId}/stages/reorder`, { stage_ids: stageIds }),
};
