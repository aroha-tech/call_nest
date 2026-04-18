import { query } from '../../config/db.js';
import { getCreatedByUserIdsForScope } from './userMessageScopeService.js';

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

function contactActivityPath(contactType, contactId) {
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const t = String(contactType || '').toLowerCase();
  return t === 'lead' ? `/leads/${cid}/activity` : `/contacts/${cid}/activity`;
}

function deriveFeedKind(category, eventType) {
  const c = String(category || '').toLowerCase();
  const t = String(eventType || '').toLowerCase();
  if (c === 'call') return 'call';
  if (c === 'dialer') return 'dialer';
  if (c === 'message' && t.includes('whatsapp')) return 'whatsapp';
  if (c === 'message' && t.includes('email')) return 'email';
  if (c === 'user') return 'teammate';
  if (c === 'profile') return 'settings';
  if (c === 'tenant') return 'workspace';
  if (c === 'campaign') return 'campaign';
  if (c === 'deal' && t.startsWith('pipeline.')) return 'settings';
  if (c === 'deal') return 'crm';
  if (c === 'contact') return 'crm';
  if (
    c === 'disposition' ||
    c === 'dialing_set' ||
    c === 'call_script' ||
    c === 'email_account' ||
    c === 'whatsapp_account'
  ) {
    return 'settings';
  }
  return 'crm';
}

function normalizeActivityTab(actingUser, tab) {
  const role = actingUser?.role;
  const raw = String(tab || 'all').toLowerCase();
  const allowed = new Set(['all', 'calls', 'records', 'team']);
  let t = allowed.has(raw) ? raw : 'all';
  if (t === 'team' && role === 'agent') t = 'all';
  return t;
}

/** SQL fragment matching dashboard client filters (All / Calls / CRM / Team). */
function sqlActivityTabFilter(tab) {
  if (tab === 'calls') {
    return ` AND l.event_category IN ('call', 'dialer')`;
  }
  if (tab === 'records') {
    return ` AND (
      l.event_category = 'contact'
      OR (l.event_category = 'deal' AND LOWER(COALESCE(l.event_type, '')) NOT LIKE 'pipeline.%')
      OR (l.event_category = 'message' AND LOWER(COALESCE(l.event_type, '')) LIKE '%whatsapp%')
      OR (l.event_category = 'message' AND LOWER(COALESCE(l.event_type, '')) LIKE '%email%')
      OR l.event_category = 'profile'
      OR (l.event_category = 'deal' AND LOWER(COALESCE(l.event_type, '')) LIKE 'pipeline.%')
      OR l.event_category IN ('disposition','dialing_set','call_script','email_account','whatsapp_account')
      OR l.event_category = 'tenant'
    )`;
  }
  if (tab === 'team') {
    return ` AND l.event_category = 'user'`;
  }
  return '';
}

function mapTenantActivityLogRow(r) {
  const kind = deriveFeedKind(r.event_category, r.event_type);
  const at = toIso(r.created_at);
  const who = r.actor_name || 'User';
  return {
    kind,
    at: at || new Date().toISOString(),
    actor: r.actor_user_id
      ? { id: Number(r.actor_user_id), name: who, role: r.actor_role || null }
      : null,
    title: String(r.summary || r.event_type || 'Activity').slice(0, 220),
    detail: r.contact_name ? String(r.contact_name) : null,
    href: contactActivityPath(r.contact_type, r.contact_id),
  };
}

/**
 * Paginated activity list (same row shape as dashboard feed) with optional summary search.
 */
export async function listTenantActivityFeedPaginated(
  tenantId,
  actingUser,
  { page = 1, limit = 20, search = '', tab = 'all' } = {}
) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return { data: [], total: 0, page: 1, limit: 20, tab: 'all' };

  const tabNorm = normalizeActivityTab(actingUser, tab);
  const tabSql = sqlActivityTabFilter(tabNorm);

  const scopeIds = await getCreatedByUserIdsForScope(tenantId, actingUser);
  const actorSql =
    scopeIds == null ? '' : ` AND l.actor_user_id IN (${scopeIds.map(() => '?').join(',')})`;
  const baseParams = [tid, ...(scopeIds == null ? [] : scopeIds)];

  let searchSql = '';
  const filterParams = [...baseParams];
  const q = String(search || '').trim().slice(0, 200);
  if (q) {
    searchSql = ' AND l.summary LIKE ?';
    filterParams.push(`%${q}%`);
  }

  const [countRow] = await query(
    `SELECT COUNT(*) AS c FROM tenant_activity_log l
     WHERE l.tenant_id = ? AND l.deleted_at IS NULL${actorSql}${searchSql}${tabSql}`,
    filterParams
  );
  const total = Number(countRow?.c ?? 0);

  const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
  const limitNum = Math.min(100, Math.max(10, Math.floor(Number(limit)) || 20));
  const offset = (pageNum - 1) * limitNum;

  const rows = await query(
    `SELECT l.*, u.name AS actor_name, u.role AS actor_role,
            c.display_name AS contact_name, c.type AS contact_type
     FROM tenant_activity_log l
     LEFT JOIN users u ON u.id = l.actor_user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     LEFT JOIN contacts c ON c.id = l.contact_id AND c.tenant_id = l.tenant_id
     WHERE l.tenant_id = ? AND l.deleted_at IS NULL${actorSql}${searchSql}${tabSql}
     ORDER BY l.created_at DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
    filterParams
  );

  return {
    data: rows.map((r) => ({
      id: Number(r.id),
      ...mapTenantActivityLogRow(r),
    })),
    total,
    page: pageNum,
    limit: limitNum,
    tab: tabNorm,
  };
}

/**
 * @param {number} tenantId
 * @param {number|null|undefined} actorUserId
 * @param {object} row
 * @param {string} row.event_category
 * @param {string} row.event_type
 * @param {string} row.summary
 * @param {object} [row.payload_json]
 * @param {string} [row.entity_type]
 * @param {number} [row.entity_id]
 * @param {number} [row.contact_id]
 * @param {number} [row.ref_call_attempt_id]
 */
export async function insertTenantActivityLog(tenantId, actorUserId, row) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const summary = String(row?.summary || '').trim().slice(0, 500);
  if (!summary) return;
  const cat = String(row?.event_category || '').trim().slice(0, 64);
  const typ = String(row?.event_type || '').trim().slice(0, 128);
  if (!cat || !typ) return;

  await query(
    `INSERT INTO tenant_activity_log (
       tenant_id, actor_user_id, event_category, event_type, summary, payload_json,
       entity_type, entity_id, contact_id, ref_call_attempt_id,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tid,
      actorUserId ?? null,
      cat,
      typ,
      summary,
      row.payload_json != null ? JSON.stringify(row.payload_json) : null,
      row.entity_type != null ? String(row.entity_type).slice(0, 32) : null,
      row.entity_id != null ? Number(row.entity_id) : null,
      row.contact_id != null ? Number(row.contact_id) : null,
      row.ref_call_attempt_id != null ? Number(row.ref_call_attempt_id) : null,
      actorUserId ?? null,
      actorUserId ?? null,
    ]
  );
}

export async function safeLogTenantActivity(tenantId, actorUserId, row) {
  try {
    await insertTenantActivityLog(tenantId, actorUserId, row);
  } catch (e) {
    console.error('[tenant_activity_log]', e?.message || e);
  }
}

/**
 * Dashboard feed rows (same shape as legacy merged feed for the React dashboard).
 */
export async function listTenantActivityFeed(tenantId, actingUser, { limit = 45 } = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return [];

  const scopeIds = await getCreatedByUserIdsForScope(tenantId, actingUser);
  const cap = Math.min(80, Math.max(10, Number(limit) || 45));

  const actorSql =
    scopeIds == null ? '' : ` AND l.actor_user_id IN (${scopeIds.map(() => '?').join(',')})`;
  const params = [tid, ...(scopeIds == null ? [] : scopeIds)];

  const rows = await query(
    `SELECT l.*, u.name AS actor_name, u.role AS actor_role,
            c.display_name AS contact_name, c.type AS contact_type
     FROM tenant_activity_log l
     LEFT JOIN users u ON u.id = l.actor_user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     LEFT JOIN contacts c ON c.id = l.contact_id AND c.tenant_id = l.tenant_id
     WHERE l.tenant_id = ? AND l.deleted_at IS NULL${actorSql}
     ORDER BY l.created_at DESC
     LIMIT ${cap}`,
    params
  );

  return rows.map(mapTenantActivityLogRow);
}
