import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

function parseStored(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o !== null ? o : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

/** Normalized flags returned to clients (defaults when column is NULL). */
export function mergeDialerWorkspaceConfig(stored) {
  const o = stored && typeof stored === 'object' ? stored : {};
  return {
    show_activity_tab: o.show_activity_tab !== false,
    show_email_tab: o.show_email_tab === true,
    show_website_tab: o.show_website_tab === true,
    allow_edit_contact_in_session: o.allow_edit_contact_in_session !== false,
  };
}

const ALLOWED_KEYS = new Set([
  'show_activity_tab',
  'show_email_tab',
  'show_website_tab',
  'allow_edit_contact_in_session',
]);

export async function getMergedForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!tid) {
    const err = new Error('Invalid tenant');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT dialer_workspace_config AS cfg
     FROM tenants
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [tid]
  );
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  return mergeDialerWorkspaceConfig(parseStored(row.cfg));
}

/**
 * @param {number} tenantId
 * @param {number|null} actingUserId
 * @param {Record<string, unknown>} body
 */
export async function updateForTenant(tenantId, actingUserId, body) {
  const tid = Number(tenantId);
  if (!tid) {
    const err = new Error('Invalid tenant');
    err.status = 400;
    throw err;
  }

  const patch = {};
  if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      patch[k] = Boolean(v);
    }
  }

  const [row] = await query(
    `SELECT dialer_workspace_config AS cfg
     FROM tenants
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [tid]
  );
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const base = mergeDialerWorkspaceConfig(parseStored(row.cfg));
  const merged = mergeDialerWorkspaceConfig({ ...base, ...patch });

  await query(
    `UPDATE tenants
     SET dialer_workspace_config = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND is_deleted = 0`,
    [JSON.stringify(merged), tid]
  );

  await safeLogTenantActivity(tid, actingUserId, {
    event_category: 'tenant',
    event_type: 'tenant.dialer_workspace_config_updated',
    summary: 'Dial workspace options updated',
    entity_type: 'tenant',
    entity_id: tid,
  });

  return merged;
}
