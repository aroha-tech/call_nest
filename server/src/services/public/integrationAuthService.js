import crypto from 'crypto';
import { query } from '../../config/db.js';

const DEFAULT_SCOPES = ['contacts.write', 'calls.write', 'events.read', 'activities.write'];
const rateBucket = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function cleanScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return DEFAULT_SCOPES;
  return [...new Set(scopes.map((x) => String(x || '').trim()).filter(Boolean))];
}

export function generateApiKey() {
  return `cn_live_${crypto.randomBytes(24).toString('hex')}`;
}

function maskKey(key) {
  const raw = String(key || '');
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

export async function listIntegrationApps(tenantId) {
  return query(
    `SELECT
      id,
      tenant_id,
      name,
      provider_code,
      api_key_hint,
      scopes_json,
      webhook_secret,
      requests_per_minute,
      is_active,
      created_at,
      updated_at
     FROM integration_apps
     WHERE tenant_id = ?
       AND deleted_at IS NULL
     ORDER BY id DESC`,
    [tenantId]
  );
}

export async function createIntegrationApp(tenantId, user, payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const providerCode = String(payload.provider_code || 'custom').trim().toLowerCase() || 'custom';
  const scopes = cleanScopes(payload.scopes);
  const webhookSecret = String(payload.webhook_secret || '').trim() || null;
  const rpm = Math.max(30, Math.min(5000, Number(payload.requests_per_minute) || 120));
  const apiKey = generateApiKey();
  const apiKeyHash = sha256(apiKey);
  const apiKeyHint = maskKey(apiKey);
  const userId = user?.id ?? null;

  const result = await query(
    `INSERT INTO integration_apps (
      tenant_id, name, provider_code, api_key_hash, api_key_hint, scopes_json, webhook_secret,
      requests_per_minute, is_active, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [tenantId, name, providerCode, apiKeyHash, apiKeyHint, JSON.stringify(scopes), webhookSecret, rpm, userId, userId]
  );

  const [row] = await query(
    `SELECT id, tenant_id, name, provider_code, api_key_hint, scopes_json, webhook_secret, requests_per_minute, is_active
     FROM integration_apps
     WHERE id = ? AND tenant_id = ?`,
    [result.insertId, tenantId]
  );
  return { app: row, api_key: apiKey };
}

export async function ensureInternalCrmApp(tenantId, user = null) {
  const [existing] = await query(
    `SELECT id, tenant_id, name, provider_code, scopes_json, webhook_secret, requests_per_minute, is_active
     FROM integration_apps
     WHERE tenant_id = ?
       AND provider_code = 'internal_crm'
       AND name = 'Internal CRM Connector'
       AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [tenantId]
  );
  if (existing) return existing;
  const userId = user?.id ?? null;
  const apiKey = generateApiKey();
  const result = await query(
    `INSERT INTO integration_apps (
      tenant_id, name, provider_code, api_key_hash, api_key_hint, scopes_json, webhook_secret,
      requests_per_minute, is_active, created_by, updated_by
    ) VALUES (?, 'Internal CRM Connector', 'internal_crm', ?, ?, ?, NULL, 10000, 1, ?, ?)`,
    [tenantId, sha256(apiKey), maskKey(apiKey), JSON.stringify(['*']), userId, userId]
  );
  const [created] = await query(
    `SELECT id, tenant_id, name, provider_code, scopes_json, webhook_secret, requests_per_minute, is_active
     FROM integration_apps
     WHERE id = ? AND tenant_id = ?`,
    [result.insertId, tenantId]
  );
  return created;
}

export async function rotateApiKey(tenantId, user, appId) {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid app id');
    err.status = 400;
    throw err;
  }
  const apiKey = generateApiKey();
  await query(
    `UPDATE integration_apps
     SET api_key_hash = ?, api_key_hint = ?, updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [sha256(apiKey), maskKey(apiKey), user?.id ?? null, id, tenantId]
  );
  return { api_key: apiKey };
}

export async function authenticatePublicRequest(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  const [app] = await query(
    `SELECT id, tenant_id, name, provider_code, scopes_json, webhook_secret, requests_per_minute, is_active
     FROM integration_apps
     WHERE api_key_hash = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [sha256(key)]
  );
  if (!app || Number(app.is_active) !== 1) return null;
  return app;
}

export function requireScope(app, requiredScope) {
  const scopes = Array.isArray(app?.scopes_json) ? app.scopes_json : [];
  return scopes.includes(requiredScope) || scopes.includes('*');
}

export function checkRateLimit(app) {
  const now = Date.now();
  const key = `${app.tenant_id}:${app.id}`;
  const limit = Math.max(1, Number(app.requests_per_minute) || 120);
  const bucket = rateBucket.get(key) || { count: 0, resetAt: now + 60000 };
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60000;
  }
  bucket.count += 1;
  rateBucket.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
