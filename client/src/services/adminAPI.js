import { axiosInstance } from './axiosInstance';

/**
 * Super Admin (platform) APIs: dashboard, tenants, users.
 */

export const dashboardAPI = {
  getStats: () => axiosInstance.get('/api/admin/dashboard/stats'),
};

export const tenantsAPI = {
  getAll: ({ search = '', includeDisabled = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/tenants', {
      params: { search, include_disabled: includeDisabled, page, limit },
    }),
  getById: (id) => axiosInstance.get(`/api/admin/tenants/${id}`),
  create: (data) => axiosInstance.post('/api/admin/tenants', data),
  update: (id, data) => axiosInstance.put(`/api/admin/tenants/${id}`, data),
};

export const usersAPI = {
  getAll: ({ tenantId, search = '', includeDisabled = false, page = 1, limit = 20 } = {}) =>
    axiosInstance.get('/api/admin/users', {
      params: { tenant_id: tenantId, search, include_disabled: includeDisabled, page, limit },
    }),
  getById: (id) => axiosInstance.get(`/api/admin/users/${id}`),
  create: (data) => axiosInstance.post('/api/admin/users', data),
  update: (id, data) => axiosInstance.put(`/api/admin/users/${id}`, data),
};
