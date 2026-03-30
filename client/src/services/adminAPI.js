import { axiosInstance } from './axiosInstance';

/**
 * Super Admin (platform) APIs: dashboard, tenants, users.
 */

export const dashboardAPI = {
  /** @param {{ from?: string, to?: string }} [params] */
  getStats: (params) =>
    axiosInstance.get('/api/admin/dashboard/stats', { params: params || {} }),
};

export const tenantsAPI = {
  getAll: ({
    search = '',
    includeDisabled = false,
    page = 1,
    limit = 20,
    industryId,
    minUsers,
    maxUsers,
  } = {}) => {
    const params = { search, include_disabled: includeDisabled, page, limit };
    if (industryId && industryId !== '__all__') {
      params.industry_id = industryId;
    }
    if (minUsers !== undefined && minUsers !== null && String(minUsers).trim() !== '') {
      params.min_users = minUsers;
    }
    if (maxUsers !== undefined && maxUsers !== null && String(maxUsers).trim() !== '') {
      params.max_users = maxUsers;
    }
    return axiosInstance.get('/api/admin/tenants', { params });
  },
  getById: (id) => axiosInstance.get(`/api/admin/tenants/${id}`),
  create: (data) => axiosInstance.post('/api/admin/tenants', data),
  update: (id, data) => axiosInstance.put(`/api/admin/tenants/${id}`, data),
};

export const usersAPI = {
  getAll: ({
    tenantId,
    search = '',
    includeDisabled = false,
    page = 1,
    limit = 20,
    role,
    filterManagerId,
  } = {}) => {
    const params = {
      tenant_id: tenantId,
      search,
      include_disabled: includeDisabled,
      page,
      limit,
    };
    if (role && role !== '__all__') params.role = role;
    if (filterManagerId && filterManagerId !== '__all__') params.filter_manager_id = filterManagerId;
    return axiosInstance.get('/api/admin/users', { params });
  },
  getById: (id) => axiosInstance.get(`/api/admin/users/${id}`),
  create: (data) => axiosInstance.post('/api/admin/users', data),
  update: (id, data) => axiosInstance.put(`/api/admin/users/${id}`, data),
};
