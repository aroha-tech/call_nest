import { dummyProvider } from './providers/dummyProvider.js';
import { twilioProvider } from './providers/twilioProvider.js';
import { exotelProvider } from './providers/exotelProvider.js';
import { knowlarityProvider } from './providers/knowlarityProvider.js';
import { myoperatorProvider } from './providers/myoperatorProvider.js';
import { ozonetelProvider } from './providers/ozonetelProvider.js';
import { env } from '../../../config/env.js';
import { query } from '../../../config/db.js';
import {
  decryptAccountCredentials,
  findActiveDefaultAccount,
} from './tenantTelephonyAccountsService.js';

/**
 * Provider registry so swapping providers is isolated.
 */
const PROVIDERS = new Map([
  [dummyProvider.code, dummyProvider],
  [twilioProvider.code, twilioProvider],
  [exotelProvider.code, exotelProvider],
  [knowlarityProvider.code, knowlarityProvider],
  [myoperatorProvider.code, myoperatorProvider],
  [ozonetelProvider.code, ozonetelProvider],
]);

export function getDefaultTelephonyProviderCode() {
  const configured = String(env.telephony.defaultProvider || 'exotel')
    .trim()
    .toLowerCase();
  if (PROVIDERS.has(configured)) return configured;
  return 'exotel';
}

export function getTelephonyProvider(code = null) {
  const key = String(code || getDefaultTelephonyProviderCode())
    .trim()
    .toLowerCase();
  return PROVIDERS.get(key) || PROVIDERS.get(getDefaultTelephonyProviderCode()) || dummyProvider;
}

/**
 * Resolve the telephony provider + per-tenant credentials + display numbers for a tenant.
 *
 * Selection rules:
 *   - tenants.telephony_account_mode = 'byo_account' AND there is an active BYO account
 *       -> use that account's credentials and webhook token.
 *   - otherwise (default_account, or BYO row missing/disabled)
 *       -> use the platform env credentials. No webhook token.
 *
 * The returned `meta` is what providers/UI need:
 *   {
 *     providerCode,
 *     provider,                // the provider object with .startOutboundCall()
 *     accountId | null,        // tenant_telephony_accounts.id when BYO
 *     credentials | null,      // decrypted BYO credentials, or null when env-default
 *     webhookToken | null,     // BYO webhook routing token
 *     statusCallbackOverride,  // BYO-specific override of the StatusCallback URL
 *     callerIdAccountDefault,  // account-level caller id (for resolver fallback)
 *     agentLegAccountDefault,
 *     accountMode,             // 'default_account' | 'byo_account'
 *     callBillingMode,         // 'credit' | 'unlimited'
 *   }
 */
export async function resolveProviderForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!tid) {
    const err = new Error('resolveProviderForTenant: tenantId is required');
    err.status = 500;
    throw err;
  }

  const [tenant] = await query(
    `SELECT id, telephony_account_mode, call_billing_mode
     FROM tenants
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [tid]
  );
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const providerCode = getDefaultTelephonyProviderCode();
  const provider = getTelephonyProvider(providerCode);

  const accountMode = String(tenant.telephony_account_mode || 'default_account');
  const callBillingMode = String(tenant.call_billing_mode || 'credit');

  if (accountMode !== 'byo_account') {
    return {
      providerCode,
      provider,
      accountId: null,
      credentials: null,
      webhookToken: null,
      statusCallbackOverride: null,
      callerIdAccountDefault: null,
      agentLegAccountDefault: null,
      accountMode,
      callBillingMode,
    };
  }

  const account = await findActiveDefaultAccount(tid, providerCode);
  if (!account) {
    // Tenant is in BYO mode but has no active account: refuse rather than silently using platform creds.
    const err = new Error(
      'Tenant is in BYO telephony mode but has no active provider account configured. Add one under Settings → Calling → Provider accounts.'
    );
    err.status = 409;
    throw err;
  }

  const credentials = decryptAccountCredentials(account);

  return {
    providerCode: account.provider_code,
    provider: getTelephonyProvider(account.provider_code),
    accountId: account.id,
    credentials,
    webhookToken: account.webhook_token,
    statusCallbackOverride: account.status_callback_url || null,
    callerIdAccountDefault: account.caller_id_e164 || null,
    agentLegAccountDefault: account.agent_leg_e164 || null,
    accountMode,
    callBillingMode,
  };
}
