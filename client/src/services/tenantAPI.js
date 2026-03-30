import { axiosInstance } from './axiosInstance';

/**
 * Tenant workspace dashboard (admin / manager / agent scoped stats).
 */
export const tenantDashboardAPI = {
  /** @param {{ params?: { from?: string, to?: string } }} [config] */
  get: (config = {}) => axiosInstance.get('/api/tenant/dashboard', config),
};
