import { axiosInstance } from './axiosInstance';

/**
 * Tenant workspace dashboard (admin / manager / agent scoped stats).
 */
export const tenantDashboardAPI = {
  /** @param {{ params?: { from?: string, to?: string } }} [config] */
  get: (config = {}) => axiosInstance.get('/api/tenant/dashboard', config),
  /**
   * Paginated activity log (same scope as dashboard feed).
   * @param {{ params?: { page?: number, limit?: number, q?: string, tab?: 'all'|'calls'|'records'|'team' } }} [config]
   */
  getActivity: (config = {}) => axiosInstance.get('/api/tenant/dashboard/activity', config),
};
