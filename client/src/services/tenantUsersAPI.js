import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/users';

/**
 * Tenant (company) users API - for company admin to manage users within their tenant.
 */
export const tenantUsersAPI = {
  getAll: ({
    search = '',
    includeDisabled = false,
    page = 1,
    limit = 20,
    role,
    filterManagerId,
  } = {}) => {
    const params = { search, include_disabled: includeDisabled, page, limit };
    if (role && role !== '__all__') params.role = role;
    if (filterManagerId && filterManagerId !== '__all__') params.filter_manager_id = filterManagerId;
    return axiosInstance.get(BASE, { params });
  },
  getById: (id) => axiosInstance.get(`${BASE}/${id}`),
  create: (data) => axiosInstance.post(BASE, data),
  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),
};
