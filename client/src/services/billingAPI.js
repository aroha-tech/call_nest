import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/billing';

export const billingAPI = {
  getConfig: () => axiosInstance.get(`${BASE}/config`),
  listPlans: () => axiosInstance.get(`${BASE}/plans`),
  createOrder: (planId) => axiosInstance.post(`${BASE}/orders`, { planId }),
  verifyPayment: (payload) => axiosInstance.post(`${BASE}/verify`, payload),
  listPayments: (params = {}) => axiosInstance.get(`${BASE}/payments`, { params }),
  listSubscriptions: (params = {}) => axiosInstance.get(`${BASE}/subscriptions`, { params }),
  getCurrent: () => axiosInstance.get(`${BASE}/current`),
};

const ADMIN_BASE = '/api/admin/billing';

export const platformBillingAPI = {
  listPlans: () => axiosInstance.get(`${ADMIN_BASE}/plans`),
  listPayments: (params = {}) => axiosInstance.get(`${ADMIN_BASE}/payments`, { params }),
  listSubscriptions: (params = {}) => axiosInstance.get(`${ADMIN_BASE}/subscriptions`, { params }),
};
