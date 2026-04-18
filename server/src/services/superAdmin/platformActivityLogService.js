import { query } from '../../config/db.js';

function toIso(v) {
  if (!v) return null;
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * @param {object} row
 * @param {number|null} [row.actor_user_id]
 * @param {number|null} [row.subject_tenant_id]
 * @param {string} row.event_category
 * @param {string} row.event_type
 * @param {string} row.summary
 * @param {object} [row.payload_json]
 * @param {string} [row.entity_type]
 * @param {number} [row.entity_id]
 */
export async function insertPlatformActivityLog(row) {
  const summary = String(row?.summary || '').trim().slice(0, 500);
  if (!summary) return;
  const cat = String(row?.event_category || '').trim().slice(0, 64);
  const typ = String(row?.event_type || '').trim().slice(0, 128);
  if (!cat || !typ) return;

  const actorId = row.actor_user_id != null ? Number(row.actor_user_id) : null;

  await query(
    `INSERT INTO platform_activity_log (
       actor_user_id, subject_tenant_id, event_category, event_type, summary, payload_json,
       entity_type, entity_id, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number.isFinite(actorId) && actorId > 0 ? actorId : null,
      row.subject_tenant_id != null ? Number(row.subject_tenant_id) : null,
      cat,
      typ,
      summary,
      row.payload_json != null ? JSON.stringify(row.payload_json) : null,
      row.entity_type != null ? String(row.entity_type).slice(0, 32) : null,
      row.entity_id != null ? Number(row.entity_id) : null,
      Number.isFinite(actorId) && actorId > 0 ? actorId : null,
      Number.isFinite(actorId) && actorId > 0 ? actorId : null,
    ]
  );
}

export async function safeLogPlatformActivity(row) {
  try {
    await insertPlatformActivityLog(row);
  } catch (e) {
    console.error('[platform_activity_log]', e?.message || e);
  }
}

/**
 * Super-admin dashboard feed (merged tenant + user style chips).
 */
export async function listPlatformActivityFeed({ limit = 32 } = {}) {
  const cap = Math.min(60, Math.max(8, Number(limit) || 32));
  let rows;
  try {
    rows = await query(
      `SELECT l.*, u.name AS actor_name, u.email AS actor_email FROM platform_activity_log l
       LEFT JOIN users u ON u.id = l.actor_user_id AND u.is_deleted = 0
       WHERE l.deleted_at IS NULL
       ORDER BY l.created_at DESC
       LIMIT ${cap}`
    );
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      console.warn(
        '[platform_activity_log] Table missing; super-admin activity feed is empty until you run migration 064_activity_log_tables.sql'
      );
      return [];
    }
    throw e;
  }

  return rows.map((r) => {
    const kind = String(r.event_category || '').toLowerCase() === 'user' ? 'user' : 'tenant';
    const at = toIso(r.created_at);
    const actorBit = r.actor_name || r.actor_email;
    return {
      kind,
      at: at || new Date().toISOString(),
      title: String(r.summary || r.event_type || 'Platform activity').slice(0, 220),
      detail: actorBit ? `By ${actorBit}` : null,
      href: kind === 'tenant' ? '/admin/tenants' : '/admin/users',
    };
  });
}
