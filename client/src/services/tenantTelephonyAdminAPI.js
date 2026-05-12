import { axiosInstance } from './axiosInstance';

const BASE = '/api/admin/tenant-telephony';

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
