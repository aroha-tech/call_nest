import { axiosInstance } from './axiosInstance';

/**
 * Tenant-side telephony settings API.
 *
 * BYO provider accounts: /api/tenant/telephony-accounts
 * Wallet / usage:        /api/tenant/call-credits
 *
 * These are scoped to the caller's own tenant context (tenant auth middleware).
 */

const ACCOUNTS = '/api/tenant/telephony-accounts';
const CREDITS = '/api/tenant/call-credits';

export const tenantTelephonyAPI = {
  // Modes (account_mode, billing_mode)
  getMode: () => axiosInstance.get(`${ACCOUNTS}/mode`),
  updateMode: (body) => axiosInstance.patch(`${ACCOUNTS}/mode`, body),

  // BYO provider accounts (Exotel)
  listAccounts: (params = {}) => axiosInstance.get(ACCOUNTS, { params }),
  getAccount: (id) => axiosInstance.get(`${ACCOUNTS}/${id}`),
  createAccount: (body) => axiosInstance.post(ACCOUNTS, body),
  updateAccount: (id, body) => axiosInstance.patch(`${ACCOUNTS}/${id}`, body),
  rotateAccountWebhookToken: (id) =>
    axiosInstance.post(`${ACCOUNTS}/${id}/rotate-webhook-token`),
  deleteAccount: (id) => axiosInstance.delete(`${ACCOUNTS}/${id}`),

  // Wallet / credit / usage (read-only for tenants)
  getBalance: () => axiosInstance.get(`${CREDITS}/balance`),
  getUsage: () => axiosInstance.get(`${CREDITS}/usage`),
  listLedger: (params = {}) => axiosInstance.get(`${CREDITS}/ledger`, { params }),

  getPurchaseConfig: () => axiosInstance.get(`${CREDITS}/purchase/config`),
  listPurchasePlans: () => axiosInstance.get(`${CREDITS}/purchase/plans`),
  getPurchaseWallet: () => axiosInstance.get(`${CREDITS}/purchase/wallet`),
  createPurchaseOrder: (planId) => axiosInstance.post(`${CREDITS}/purchase/orders`, { planId }),
  verifyPurchasePayment: (payload) => axiosInstance.post(`${CREDITS}/purchase/verify`, payload),

  getSubscriptionCurrent: () => axiosInstance.get(`${CREDITS}/subscription/current`),
  listSubscriptionHistory: (params = {}) =>
    axiosInstance.get(`${CREDITS}/subscription/history`, { params }),
  createSubscriptionCheckout: (planId, { autoRenew = true, billingInterval = 'month' } = {}) =>
    axiosInstance.post(`${CREDITS}/subscription/checkout`, {
      planId,
      autoRenew,
      billingInterval,
    }),
  verifySubscriptionCheckout: (payload) =>
    axiosInstance.post(`${CREDITS}/subscription/verify`, payload),
};
