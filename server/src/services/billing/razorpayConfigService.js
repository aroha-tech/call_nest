import { env } from '../../config/env.js';
import { query } from '../../config/db.js';

const CACHE_TTL_MS = 60_000;
const SETTING_KEYS = Object.freeze({
  KEY_ID: 'billing.razorpay_key_id',
  KEY_SECRET: 'billing.razorpay_key_secret',
  WEBHOOK_SECRET: 'billing.razorpay_webhook_secret',
});

let cached = null;
let cacheExpiresAt = 0;

function isDevMockEnabled() {
  if (env.nodeEnv === 'production') return false;
  const v = String(process.env.RAZORPAY_DEV_MOCK || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function coerceSettingString(jsonValue) {
  if (jsonValue == null) return '';
  if (typeof jsonValue === 'string') return jsonValue.trim();
  if (typeof jsonValue === 'object' && jsonValue !== null && 'value' in jsonValue) {
    return String(jsonValue.value ?? '').trim();
  }
  return String(jsonValue).trim();
}

async function readSettingString(key) {
  const [row] = await query(
    `SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  return coerceSettingString(row?.setting_value);
}

/**
 * Resolved Razorpay credentials: env vars take precedence, then platform_settings.
 */
export async function getRazorpayConfig() {
  const now = Date.now();
  if (cached && cacheExpiresAt > now) return cached;

  const devMock = isDevMockEnabled();
  const envKeyId = env.razorpay?.keyId || '';
  const envSecret = env.razorpay?.keySecret || '';
  const envWebhook = env.razorpay?.webhookSecret || '';

  if (envKeyId && envSecret) {
    cached = {
      keyId: envKeyId,
      keySecret: envSecret,
      webhookSecret: envWebhook,
      devMock: false,
      configured: true,
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cached;
  }

  if (devMock) {
    cached = {
      keyId: '',
      keySecret: '',
      webhookSecret: '',
      devMock: true,
      configured: true,
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cached;
  }

  const [dbKeyId, dbSecret, dbWebhook] = await Promise.all([
    readSettingString(SETTING_KEYS.KEY_ID),
    readSettingString(SETTING_KEYS.KEY_SECRET),
    readSettingString(SETTING_KEYS.WEBHOOK_SECRET),
  ]);

  const keyId = dbKeyId;
  const keySecret = dbSecret;
  const webhookSecret = dbWebhook;
  const configured = Boolean(keyId && keySecret);

  cached = {
    keyId,
    keySecret,
    webhookSecret,
    devMock: false,
    configured,
  };
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cached;
}

export function invalidateRazorpayConfigCache() {
  cached = null;
  cacheExpiresAt = 0;
}

export function isDevMockPayment(body) {
  if (!isDevMockEnabled()) return false;
  const sig = String(body?.razorpay_signature || body?.signature || '').trim();
  return sig === 'dev_mock';
}

export async function getClientRazorpayConfig() {
  const cfg = await getRazorpayConfig();
  return {
    razorpayKeyId: cfg.keyId || (cfg.devMock ? 'dev_mock' : ''),
    razorpayConfigured: cfg.configured,
    razorpayDevMock: cfg.devMock,
  };
}

export async function getRazorpaySettingsForAdmin() {
  const cfg = await getRazorpayConfig();
  const hasSecret = Boolean(cfg.keySecret);
  return {
    razorpay_key_id: cfg.keyId || '',
    razorpay_key_secret_set: hasSecret,
    razorpay_webhook_secret_set: Boolean(cfg.webhookSecret),
    razorpay_configured: cfg.configured,
    razorpay_dev_mock: cfg.devMock,
    source: env.razorpay?.keyId && env.razorpay?.keySecret ? 'env' : hasSecret ? 'platform' : cfg.devMock ? 'dev_mock' : 'none',
  };
}

async function upsertStringSetting(key, value, updatedByUserId) {
  const trimmed = String(value ?? '').trim();
  const payload = JSON.stringify({ value: trimmed });
  await query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
     VALUES (?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [key, payload, updatedByUserId ?? null]
  );
}

export async function updateRazorpaySettings(
  { razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret },
  updatedByUserId
) {
  if (env.razorpay?.keyId && env.razorpay?.keySecret) {
    const err = new Error(
      'Razorpay keys are set in server environment variables. Remove RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from .env to manage keys in the admin UI.'
    );
    err.status = 400;
    throw err;
  }

  if (razorpay_key_id !== undefined) {
    await upsertStringSetting(SETTING_KEYS.KEY_ID, razorpay_key_id, updatedByUserId);
  }
  if (razorpay_key_secret !== undefined && String(razorpay_key_secret).trim() !== '') {
    await upsertStringSetting(SETTING_KEYS.KEY_SECRET, razorpay_key_secret, updatedByUserId);
  }
  if (razorpay_webhook_secret !== undefined && String(razorpay_webhook_secret).trim() !== '') {
    await upsertStringSetting(SETTING_KEYS.WEBHOOK_SECRET, razorpay_webhook_secret, updatedByUserId);
  }

  invalidateRazorpayConfigCache();
  return getRazorpaySettingsForAdmin();
}

export { SETTING_KEYS as RAZORPAY_SETTING_KEYS };
