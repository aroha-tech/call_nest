import { query } from '../../config/db.js';

const ALLOWED_PROVIDERS = [
  'meta_lead_ads',
  'google_lead_forms',
  'justdial',
  'indiamart',
  'real_estate_portal',
];

function normalizeProviderCode(providerCode) {
  return String(providerCode || '').trim().toLowerCase();
}

export function validateProviderCode(providerCode) {
  const code = normalizeProviderCode(providerCode);
  if (!code) return null;
  if (!ALLOWED_PROVIDERS.includes(code)) return null;
  return code;
}

export async function listIntegrations(tenantId) {
  const rows = await query(
    `SELECT 
      id,
      tenant_id,
      provider_code,
      provider_account_name,
      provider_account_name AS account_name,
      tokens_json,
      webhook_secret,
      default_owner_user_id,
      default_country_code,
      is_active,
      created_at,
      updated_at
     FROM lead_integrations
     WHERE tenant_id = ?
       AND deleted_at IS NULL
     ORDER BY provider_code ASC, created_at DESC`,
    [tenantId]
  );

  return rows;
}

export async function getIntegrationById(tenantId, integrationId) {
  const rows = await query(
    `SELECT *
     FROM lead_integrations
     WHERE tenant_id = ?
       AND id = ?
       AND deleted_at IS NULL`,
    [tenantId, integrationId]
  );

  return rows?.[0] || null;
}

export async function upsertIntegration(tenantId, user, payload) {
  const providerCode = validateProviderCode(payload?.provider_code);
  if (!providerCode) {
    const err = new Error('Invalid provider_code');
    err.status = 400;
    throw err;
  }

  const providerAccountName = String(payload?.provider_account_name || 'default').trim();
  const tokensJson = payload?.tokens_json ?? {};
  const webhookSecret = payload?.webhook_secret ?? null;
  const defaultOwnerUserId = payload?.default_owner_user_id ?? null;
  const defaultCountryCode = String(payload?.default_country_code || '+91').trim() || '+91';
  const isActive = payload?.is_active === 0 ? 0 : 1;

  // Ensure JSON is stored as object
  const safeTokens =
    typeof tokensJson === 'object' && tokensJson !== null ? tokensJson : { raw: String(tokensJson) };

  // Find existing integration by unique key (tenant + provider + account name)
  const existingRows = await query(
    `SELECT id
     FROM lead_integrations
     WHERE tenant_id = ?
       AND provider_code = ?
       AND provider_account_name = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, providerCode, providerAccountName]
  );

  const nowUserId = user?.id ?? null;

  if (existingRows?.[0]?.id) {
    const id = existingRows[0].id;
    await query(
      `UPDATE lead_integrations
       SET tokens_json = ?,
           webhook_secret = ?,
           default_owner_user_id = ?,
           default_country_code = ?,
           is_active = ?,
           updated_by = ?
       WHERE id = ? AND tenant_id = ?`,
      [JSON.stringify(safeTokens), webhookSecret, defaultOwnerUserId, defaultCountryCode, isActive, nowUserId, id, tenantId]
    );

    return getIntegrationById(tenantId, id);
  }

  const insertResult = await query(
    `INSERT INTO lead_integrations (
       tenant_id,
       provider_code,
       provider_account_name,
       tokens_json,
       webhook_secret,
       default_owner_user_id,
       default_country_code,
       is_active,
       created_by,
       updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      providerCode,
      providerAccountName,
      JSON.stringify(safeTokens),
      webhookSecret,
      defaultOwnerUserId,
      defaultCountryCode,
      isActive,
      nowUserId,
      nowUserId,
    ]
  );

  const id = insertResult.insertId;
  return getIntegrationById(tenantId, id);
}

export async function resolveIntegrationForWebhook(integrationId, providerCode) {
  const code = validateProviderCode(providerCode);
  const idNum = Number(integrationId);
  if (!code || !Number.isFinite(idNum) || idNum <= 0) {
    const err = new Error('Invalid integration id or provider');
    err.status = 400;
    throw err;
  }

  const rows = await query(
    `SELECT *
     FROM lead_integrations
     WHERE id = ?
       AND provider_code = ?
       AND deleted_at IS NULL
       AND is_active = 1
     LIMIT 1`,
    [idNum, code]
  );

  const integration = rows?.[0] || null;
  if (!integration) {
    const err = new Error('Integration not found');
    err.status = 404;
    throw err;
  }

  return integration;
}

export async function getOwnerUser(tenantId, userId) {
  const rows = await query(
    `SELECT id, tenant_id, role, manager_id
     FROM users
     WHERE tenant_id = ?
       AND id = ?
       AND is_deleted = 0
       AND is_enabled = 1
     LIMIT 1`,
    [tenantId, userId]
  );

  return rows?.[0] || null;
}

