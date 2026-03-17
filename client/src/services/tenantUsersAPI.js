import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/users';

/**
 * Tenant (company) users API - for company admin to manage users within their tenant.
 */
export const tenantUsersAPI = {
  getAll: ({ search = '', includeDisabled = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get(BASE, {
      params: { search, include_disabled: includeDisabled, page, limit },
    }),
  getById: (id) => axiosInstance.get(`${BASE}/${id}`),
  create: (data) => axiosInstance.post(BASE, data),
  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),
};
