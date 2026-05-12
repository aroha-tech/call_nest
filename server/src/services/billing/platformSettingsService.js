import { query } from '../../config/db.js';

/**
 * Tiny TTL cache for platform_settings rows. Settings change rarely (super-admin only)
 * but are read on the hot dial path, so we don't want to round-trip MySQL every call.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map();

const KEYS = Object.freeze({
  DEFAULT_CALL_RATE_PAISE_PER_MINUTE: 'telephony.default_call_rate_paise_per_minute',
  DEFAULT_BYO_PLATFORM_FEE_PAISE_PER_MINUTE: 'telephony.default_byo_platform_fee_paise_per_minute',
  DEFAULT_CALL_MIN_BALANCE_PAISE: 'telephony.default_call_min_balance_paise',
  DEFAULT_UNLIMITED_MINUTES_CAP_PER_MONTH: 'telephony.default_unlimited_minutes_cap_per_month',
});

function setCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function coerceNumberValue(jsonValue, fallback) {
  if (jsonValue == null) return fallback;
  const v =
    typeof jsonValue === 'object' && jsonValue !== null && 'value' in jsonValue
      ? jsonValue.value
      : jsonValue;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

async function readSettingNumber(key, fallback) {
  const cached = readCache(key);
  if (cached !== undefined) return cached;
  const [row] = await query(
    `SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  const v = coerceNumberValue(row ? row.setting_value : null, fallback);
  setCache(key, v);
  return v;
}

export async function getDefaultCallRatePaisePerMinute() {
  return readSettingNumber(KEYS.DEFAULT_CALL_RATE_PAISE_PER_MINUTE, 100);
}

export async function getDefaultByoPlatformFeePaisePerMinute() {
  return readSettingNumber(KEYS.DEFAULT_BYO_PLATFORM_FEE_PAISE_PER_MINUTE, 25);
}

export async function getDefaultCallMinBalancePaise() {
  return readSettingNumber(KEYS.DEFAULT_CALL_MIN_BALANCE_PAISE, 100);
}

/**
 * Default monthly cap (in connected minutes) for unlimited-mode tenants.
 * 0 = uncapped. Returned in minutes (NOT paise).
 */
export async function getDefaultUnlimitedMinutesCapPerMonth() {
  return readSettingNumber(KEYS.DEFAULT_UNLIMITED_MINUTES_CAP_PER_MONTH, 0);
}

/** Super-admin setter. Persists the value and invalidates the cache. */
export async function setSettingNumber(key, value, updatedByUserId = null) {
  const allowed = Object.values(KEYS);
  if (!allowed.includes(key)) {
    const err = new Error(`Unknown platform setting key: ${key}`);
    err.status = 400;
    throw err;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`Setting ${key} must be a non-negative number`);
    err.status = 400;
    throw err;
  }
  const payload = JSON.stringify({ value: Math.floor(n) });
  await query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
     VALUES (?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [key, payload, updatedByUserId ?? null]
  );
  cache.delete(key);
  return Math.floor(n);
}

export async function getAllTelephonySettings() {
  const [rate, byoFee, minBal, cap] = await Promise.all([
    getDefaultCallRatePaisePerMinute(),
    getDefaultByoPlatformFeePaisePerMinute(),
    getDefaultCallMinBalancePaise(),
    getDefaultUnlimitedMinutesCapPerMonth(),
  ]);
  return {
    default_call_rate_paise_per_minute: rate,
    default_byo_platform_fee_paise_per_minute: byoFee,
    default_call_min_balance_paise: minBal,
    default_unlimited_minutes_cap_per_month: cap,
  };
}

export const PLATFORM_SETTING_KEYS = KEYS;
