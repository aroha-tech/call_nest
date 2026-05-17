import { axiosInstance } from './axiosInstance';

const BASE = '/api/admin/tenant-telephony';
const PLANS_BASE = '/api/admin/telephony-billing-plans';

/**
 * Super-admin telephony billing API.
 *
 * Platform-wide defaults (rate, BYO platform fee, min balance) live under
 * /platform-settings. Per-tenant configuration lives under /:tenant_id/*.
 */
export const tenantTelephonyAdminAPI = {
  getPlatformSettings: () => axiosInstance.get(`${BASE}/platform-settings`),
  updatePlatformSettings: (body) => axiosInstance.patch(`${BASE}/platform-settings`, body),

  getTenantBilling: (tenantId) => axiosInstance.get(`${BASE}/${tenantId}/billing`),
  updateTenantBilling: (tenantId, body) => axiosInstance.patch(`${BASE}/${tenantId}/billing`, body),
  getTenantUsage: (tenantId) => axiosInstance.get(`${BASE}/${tenantId}/usage`),

  topupCredits: (tenantId, body) => axiosInstance.post(`${BASE}/${tenantId}/credits/topup`, body),
  debitCredits: (tenantId, body) =>
    axiosInstance.post(`${BASE}/${tenantId}/credits/debit-adjust`, body),

  listLedger: (tenantId, params = {}) =>
    axiosInstance.get(`${BASE}/${tenantId}/credits/ledger`, { params }),

  // BYO provider accounts (Exotel) management on behalf of a tenant.
  listAccounts: (tenantId, params = {}) =>
    axiosInstance.get(`${BASE}/${tenantId}/accounts`, { params }),
  getAccount: (tenantId, accountId) =>
    axiosInstance.get(`${BASE}/${tenantId}/accounts/${accountId}`),
  createAccount: (tenantId, body) =>
    axiosInstance.post(`${BASE}/${tenantId}/accounts`, body),
  updateAccount: (tenantId, accountId, body) =>
    axiosInstance.patch(`${BASE}/${tenantId}/accounts/${accountId}`, body),
  rotateAccountWebhookToken: (tenantId, accountId) =>
    axiosInstance.post(`${BASE}/${tenantId}/accounts/${accountId}/rotate-webhook-token`),
  deleteAccount: (tenantId, accountId) =>
    axiosInstance.delete(`${BASE}/${tenantId}/accounts/${accountId}`),
};

/** Platform-wide telephony billing plan templates (credit & unlimited). */
export const telephonyBillingPlansAdminAPI = {
  list: (params = {}, config = {}) => axiosInstance.get(PLANS_BASE, { params, ...config }),
  getOptions: (params = {}) => axiosInstance.get(`${PLANS_BASE}/options`, { params }),
  getById: (id) => axiosInstance.get(`${PLANS_BASE}/${id}`),
  create: (body) => axiosInstance.post(PLANS_BASE, body),
  reorder: (body) => axiosInstance.post(`${PLANS_BASE}/reorder`, body),
  update: (id, body) => axiosInstance.put(`${PLANS_BASE}/${id}`, body),
  toggleActive: (id) => axiosInstance.post(`${PLANS_BASE}/${id}/toggle-active`),
  delete: (id) => axiosInstance.delete(`${PLANS_BASE}/${id}`),
};
