import { axiosInstance } from './axiosInstance';

/**
 * Tenant workspace dashboard (admin / manager / agent scoped stats).
 */
export const tenantDashboardAPI = {
  get: () => axiosInstance.get('/api/tenant/dashboard'),
};
