import crypto from 'crypto';
import { query } from '../../../config/db.js';
import { decryptSecretJson, encryptSecretJson, hintFromSecret } from '../../../utils/secretCrypto.js';

const SUPPORTED_PROVIDERS = new Set(['exotel']);

const SAFE_SELECT_COLUMNS = `
  id,
  tenant_id,
  provider_code,
  label,
  is_active,
  is_default,
  account_sid,
  caller_id_e164,
  agent_leg_e164,
  credentials_hint,
  webhook_token,
  status_callback_url,
  last_used_at,
  created_at,
  updated_at
`;

function newWebhookToken() {
  return crypto.randomBytes(24).toString('hex');
}

function validateExotelCredentials(creds = {}) {
  const sid = String(creds.exotel_sid || creds.sid || '').trim();
  const apiKey = String(creds.exotel_api_key || creds.api_key || '').trim();
  const apiToken = String(creds.exotel_api_token || creds.api_token || '').trim();
  const subdomain = String(creds.exotel_subdomain || creds.subdomain || '').trim();
  if (!sid || !apiKey || !apiToken || !subdomain) {
    const err = new Error(
      'Exotel credentials are incomplete. Required: exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain'
    );
    err.status = 400;
    throw err;
  }
  return {
    exotel_sid: sid,
    exotel_api_key: apiKey,
    exotel_api_token: apiToken,
    exotel_subdomain: subdomain,
    exotel_webhook_token: String(creds.exotel_webhook_token || '').trim() || null,
    exotel_record_calls:
      creds.exotel_record_calls == null ? true : Boolean(creds.exotel_record_calls),
    exotel_recording_channels:
      String(creds.exotel_recording_channels || '').trim() || null,
  };
}

function validateCredentialsForProvider(providerCode, credentials) {
  switch (providerCode) {
    case 'exotel':
      return validateExotelCredentials(credentials || {});
    default: {
      const err = new Error(`Unsupported provider for BYO: ${providerCode}`);
      err.status = 400;
      throw err;
    }
  }
}

function deriveAccountSid(providerCode, credentials) {
  if (providerCode === 'exotel') return credentials.exotel_sid || null;
  return null;
}

function deriveCredentialsHint(providerCode, credentials) {
  if (providerCode === 'exotel') {
    return `sid:${credentials.exotel_sid} key:${hintFromSecret(credentials.exotel_api_key)}`;
  }
  return null;
}

function shapeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    provider_code: row.provider_code,
    label: row.label,
    is_active: !!row.is_active,
    is_default: !!row.is_default,
    account_sid: row.account_sid || null,
    caller_id_e164: row.caller_id_e164 || null,
    agent_leg_e164: row.agent_leg_e164 || null,
    credentials_hint: row.credentials_hint || null,
    webhook_token: row.webhook_token,
    status_callback_url: row.status_callback_url || null,
    last_used_at: row.last_used_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listTenantAccounts(tenantId, { includeInactive = false } = {}) {
  const rows = await query(
    `SELECT ${SAFE_SELECT_COLUMNS}
     FROM tenant_telephony_accounts
     WHERE tenant_id = ? AND deleted_at IS NULL
       ${includeInactive ? '' : 'AND is_active = 1'}
     ORDER BY is_default DESC, id ASC`,
    [tenantId]
  );
  return rows.map(shapeRow);
}

export async function getTenantAccountById(tenantId, id) {
  const [row] = await query(
    `SELECT ${SAFE_SELECT_COLUMNS}
     FROM tenant_telephony_accounts
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, id]
  );
  return shapeRow(row);
}

/**
 * Returns the active default account for this tenant, or null if none configured.
 * Caller decides whether to fall back to the platform env account.
 */
export async function findActiveDefaultAccount(tenantId, providerCode = 'exotel') {
  const [row] = await query(
    `SELECT *
     FROM tenant_telephony_accounts
     WHERE tenant_id = ?
       AND provider_code = ?
       AND deleted_at IS NULL
       AND is_active = 1
     ORDER BY is_default DESC, id ASC
     LIMIT 1`,
    [tenantId, providerCode]
  );
  if (!row) return null;
  return {
    ...shapeRow(row),
    _credentials_ciphertext: row.credentials_ciphertext,
    _credentials_iv: row.credentials_iv,
    _credentials_tag: row.credentials_tag,
  };
}

/**
 * Decrypt this account's credentials. Returns the JSON object stored at create-time.
 * Throws if encryption material is missing or tampered.
 */
export function decryptAccountCredentials(accountRow) {
  if (!accountRow) {
    const err = new Error('decryptAccountCredentials: missing account row');
    err.status = 500;
    throw err;
  }
  const ciphertext = accountRow._credentials_ciphertext || accountRow.credentials_ciphertext;
  const iv = accountRow._credentials_iv || accountRow.credentials_iv;
  const tag = accountRow._credentials_tag || accountRow.credentials_tag;
  return decryptSecretJson({ ciphertext, iv, tag });
}

/**
 * Look up the tenant + account for an incoming webhook. Either by:
 *   - the webhook_token in the URL (preferred), or
 *   - the AccountSid found in the webhook payload (fallback).
 */
export async function findAccountByWebhookToken(token) {
  if (!token) return null;
  const [row] = await query(
    `SELECT *
     FROM tenant_telephony_accounts
     WHERE webhook_token = ? AND deleted_at IS NULL
     LIMIT 1`,
    [String(token).trim()]
  );
  if (!row) return null;
  return {
    ...shapeRow(row),
    _credentials_ciphertext: row.credentials_ciphertext,
    _credentials_iv: row.credentials_iv,
    _credentials_tag: row.credentials_tag,
  };
}

export async function findAccountByAccountSid(providerCode, accountSid) {
  const sid = String(accountSid || '').trim();
  if (!sid) return null;
  const [row] = await query(
    `SELECT *
     FROM tenant_telephony_accounts
     WHERE provider_code = ?
       AND account_sid = ?
       AND deleted_at IS NULL
     ORDER BY is_active DESC, id ASC
     LIMIT 1`,
    [providerCode, sid]
  );
  if (!row) return null;
  return {
    ...shapeRow(row),
    _credentials_ciphertext: row.credentials_ciphertext,
    _credentials_iv: row.credentials_iv,
    _credentials_tag: row.credentials_tag,
  };
}

export async function createTenantAccount(tenantId, userId, payload = {}) {
  const providerCode = String(payload.provider_code || 'exotel').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(providerCode)) {
    const err = new Error(`Provider not supported for BYO: ${providerCode}`);
    err.status = 400;
    throw err;
  }
  const label = String(payload.label || '').trim();
  if (!label) {
    const err = new Error('label is required');
    err.status = 400;
    throw err;
  }
  if (label.length > 120) {
    const err = new Error('label must be 120 characters or fewer');
    err.status = 400;
    throw err;
  }

  const credentials = validateCredentialsForProvider(providerCode, payload.credentials);
  const accountSid = deriveAccountSid(providerCode, credentials);
  const credsHint = deriveCredentialsHint(providerCode, credentials);
  const { ciphertext, iv, tag } = encryptSecretJson(credentials);

  const callerId = payload.caller_id_e164 ? String(payload.caller_id_e164).trim() : null;
  const agentLeg = payload.agent_leg_e164 ? String(payload.agent_leg_e164).trim() : null;
  const statusCallback = payload.status_callback_url
    ? String(payload.status_callback_url).trim().slice(0, 512)
    : null;

  // Only one active default per tenant+provider.
  const makeDefault = payload.is_default == null ? true : Boolean(payload.is_default);
  if (makeDefault) {
    await query(
      `UPDATE tenant_telephony_accounts
       SET is_default = 0, updated_by = ?
       WHERE tenant_id = ? AND provider_code = ? AND deleted_at IS NULL`,
      [userId ?? null, tenantId, providerCode]
    );
  }

  const webhookToken = newWebhookToken();
  const result = await query(
    `INSERT INTO tenant_telephony_accounts (
       tenant_id, provider_code, label, is_active, is_default,
       account_sid, caller_id_e164, agent_leg_e164,
       credentials_ciphertext, credentials_iv, credentials_tag, credentials_hint,
       webhook_token, status_callback_url,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      providerCode,
      label,
      payload.is_active == null ? 1 : (payload.is_active ? 1 : 0),
      makeDefault ? 1 : 0,
      accountSid,
      callerId,
      agentLeg,
      ciphertext,
      iv,
      tag,
      credsHint,
      webhookToken,
      statusCallback,
      userId ?? null,
      userId ?? null,
    ]
  );
  const created = await getTenantAccountById(tenantId, result.insertId);
  return created;
}

export async function updateTenantAccount(tenantId, userId, id, payload = {}) {
  const existing = await query(
    `SELECT id, provider_code FROM tenant_telephony_accounts
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, id]
  );
  if (!existing.length) {
    const err = new Error('Telephony account not found');
    err.status = 404;
    throw err;
  }
  const providerCode = existing[0].provider_code;

  const sets = [];
  const params = [];

  if (payload.label != null) {
    const label = String(payload.label).trim();
    if (!label || label.length > 120) {
      const err = new Error('label must be 1-120 characters');
      err.status = 400;
      throw err;
    }
    sets.push('label = ?');
    params.push(label);
  }
  if (payload.is_active != null) {
    sets.push('is_active = ?');
    params.push(payload.is_active ? 1 : 0);
  }
  if (payload.caller_id_e164 !== undefined) {
    sets.push('caller_id_e164 = ?');
    params.push(payload.caller_id_e164 ? String(payload.caller_id_e164).trim() : null);
  }
  if (payload.agent_leg_e164 !== undefined) {
    sets.push('agent_leg_e164 = ?');
    params.push(payload.agent_leg_e164 ? String(payload.agent_leg_e164).trim() : null);
  }
  if (payload.status_callback_url !== undefined) {
    sets.push('status_callback_url = ?');
    params.push(
      payload.status_callback_url ? String(payload.status_callback_url).trim().slice(0, 512) : null
    );
  }
  if (payload.credentials) {
    const creds = validateCredentialsForProvider(providerCode, payload.credentials);
    const { ciphertext, iv, tag } = encryptSecretJson(creds);
    sets.push('credentials_ciphertext = ?');
    params.push(ciphertext);
    sets.push('credentials_iv = ?');
    params.push(iv);
    sets.push('credentials_tag = ?');
    params.push(tag);
    sets.push('credentials_hint = ?');
    params.push(deriveCredentialsHint(providerCode, creds));
    sets.push('account_sid = ?');
    params.push(deriveAccountSid(providerCode, creds));
  }

  if (payload.is_default === true) {
    await query(
      `UPDATE tenant_telephony_accounts SET is_default = 0, updated_by = ?
       WHERE tenant_id = ? AND provider_code = ? AND id <> ? AND deleted_at IS NULL`,
      [userId ?? null, tenantId, providerCode, id]
    );
    sets.push('is_default = 1');
  } else if (payload.is_default === false) {
    sets.push('is_default = 0');
  }

  if (!sets.length) {
    return getTenantAccountById(tenantId, id);
  }

  sets.push('updated_by = ?');
  params.push(userId ?? null);

  params.push(tenantId, id);
  await query(
    `UPDATE tenant_telephony_accounts SET ${sets.join(', ')}
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    params
  );
  return getTenantAccountById(tenantId, id);
}

export async function rotateWebhookToken(tenantId, userId, id) {
  const newToken = newWebhookToken();
  const result = await query(
    `UPDATE tenant_telephony_accounts
     SET webhook_token = ?, updated_by = ?
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [newToken, userId ?? null, tenantId, id]
  );
  if (!result.affectedRows) {
    const err = new Error('Telephony account not found');
    err.status = 404;
    throw err;
  }
  return getTenantAccountById(tenantId, id);
}

export async function softDeleteTenantAccount(tenantId, userId, id) {
  const result = await query(
    `UPDATE tenant_telephony_accounts
     SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, is_active = 0, is_default = 0
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [userId ?? null, tenantId, id]
  );
  if (!result.affectedRows) {
    const err = new Error('Telephony account not found');
    err.status = 404;
    throw err;
  }
  return { id, deleted: true };
}

export async function touchLastUsed(accountId) {
  if (!accountId) return;
  try {
    await query(
      `UPDATE tenant_telephony_accounts
       SET last_used_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [accountId]
    );
  } catch (err) {
    // Non-fatal — touch is informational.
    console.warn('[tenantTelephonyAccountsService.touchLastUsed]', err?.message || err);
  }
}

export { SUPPORTED_PROVIDERS };
