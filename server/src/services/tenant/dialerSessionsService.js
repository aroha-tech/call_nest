import { query, withConnection } from '../../config/db.js';
import { startCallForContact } from './callsService.js';
import { enrichDispositionsForDialerSession } from './dispositionApplyDealHelper.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

function normalizeIds(arr, max = 200) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, max);
}

export async function createSession(
  tenantId,
  user,
  { contact_ids = [], provider = 'dummy', dialing_set_id = null, call_script_id = null } = {}
) {
  const rawIds = normalizeIds(contact_ids, 500);
  if (rawIds.length === 0) {
    const err = new Error('contact_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const placeholders = rawIds.map(() => '?').join(',');
  const visibleRows = await query(
    `SELECT c.id
     FROM contacts c
     WHERE c.tenant_id = ?
       AND c.deleted_at IS NULL
       AND c.id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1
         FROM contact_blacklist_entries b
         WHERE b.tenant_id = c.tenant_id
           AND b.deleted_at IS NULL
           AND (
             b.contact_id = c.id
             OR (
               b.phone_e164 IS NOT NULL
               AND EXISTS (
                 SELECT 1
                 FROM contact_phones cp
                 WHERE cp.tenant_id = c.tenant_id
                   AND cp.contact_id = c.id
                   AND cp.phone = b.phone_e164
               )
             )
           )
       )`,
    [tenantId, ...rawIds]
  );
  const allowedSet = new Set(visibleRows.map((r) => Number(r.id)));
  const ids = rawIds.filter((id) => allowedSet.has(Number(id)));
  if (ids.length === 0) {
    const err = new Error('Selected leads are blacklisted or unavailable for dialing');
    err.status = 400;
    throw err;
  }

  const dialingSetId = dialing_set_id ? String(dialing_set_id).trim() : null;
  const callScriptId = call_script_id === null || call_script_id === '' ? null : Number(call_script_id);

  const uid = user?.id != null ? Number(user.id) : null;
  const [nextRow] = await query(
    `SELECT COALESCE(MAX(user_session_no), 0) + 1 AS next_no
     FROM dialer_sessions
     WHERE tenant_id = ? AND created_by_user_id <=> ?`,
    [tenantId, uid]
  );
  const userSessionNo = Math.max(1, Number(nextRow?.next_no) || 1);

  const result = await query(
    `INSERT INTO dialer_sessions (
       tenant_id, created_by_user_id, user_session_no, provider, status, started_at, ended_at, paused_at, paused_seconds, dialing_set_id, call_script_id
     ) VALUES (?, ?, ?, ?, 'ready', NULL, NULL, NULL, 0, ?, ?)`,
    [tenantId, uid, userSessionNo, String(provider || 'dummy'), dialingSetId, callScriptId]
  );
  const sessionId = result.insertId;

  await safeLogTenantActivity(tenantId, uid, {
    event_category: 'dialer',
    event_type: 'dialer.session.created',
    summary: `Dialer session #${userSessionNo} started (${ids.length} contact(s) queued)`,
    payload_json: {
      session_id: sessionId,
      provider: String(provider || 'dummy'),
      queue_size: ids.length,
    },
  });

  // Insert queued items in given order
  for (let i = 0; i < ids.length; i++) {
    const cid = ids[i];
    await query(
      `INSERT IGNORE INTO dialer_session_items (tenant_id, session_id, contact_id, order_index, state)
       VALUES (?, ?, ?, ?, 'queued')`,
      [tenantId, sessionId, cid, i]
    );
  }

  return getSession(tenantId, user, sessionId);
}

export async function getSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  if (!sid) return null;

  const [sess] = await query(
    `SELECT
        id,
        tenant_id,
        created_by_user_id,
        user_session_no,
        provider,
        status,
        started_at,
        ended_at,
        paused_at,
        paused_seconds,
        dialing_set_id,
        call_script_id,
        created_at,
        (CASE WHEN started_at IS NULL THEN 0
          ELSE GREATEST(
            0,
            TIMESTAMPDIFF(SECOND, started_at, COALESCE(ended_at, UTC_TIMESTAMP()))
              - COALESCE(paused_seconds, 0)
          )
        END) AS duration_sec
     FROM dialer_sessions
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, sid]
  );
  if (!sess) return null;

  if (user.role === 'admin') {
    // tenant-wide
  } else if (user.role === 'manager') {
    const creatorId = Number(sess.created_by_user_id);
    if (creatorId !== Number(user.id)) {
      const [agentRow] = await query(
        `SELECT id FROM users WHERE tenant_id = ? AND id = ? AND manager_id = ? AND is_deleted = 0 LIMIT 1`,
        [tenantId, creatorId, user.id]
      );
      if (!agentRow) {
        const err = new Error('Forbidden');
        err.status = 403;
        throw err;
      }
    }
  } else if (Number(sess.created_by_user_id) !== Number(user.id)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const items = await query(
    `SELECT
        dsi.id,
        dsi.contact_id,
        dsi.contact_phone_id,
        dsi.order_index,
        dsi.state,
        dsi.last_attempt_id,
        dsi.last_error,
        dsi.called_at,
        c.display_name,
        c.primary_phone_id,
        p.phone AS primary_phone,
        p_pick.phone AS selected_phone,
        cca.contact_phone_id AS attempt_contact_phone_id,
        p_att.phone AS attempt_phone,
        cca.is_connected AS attempt_is_connected,
        cca.status AS attempt_status,
        cca.disposition_id AS attempt_disposition_id
     FROM dialer_session_items dsi
     LEFT JOIN contacts c ON c.id = dsi.contact_id AND c.tenant_id = dsi.tenant_id
     LEFT JOIN contact_phones p ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN contact_phones p_pick
       ON p_pick.id = dsi.contact_phone_id AND p_pick.tenant_id = dsi.tenant_id
     LEFT JOIN contact_call_attempts cca ON cca.id = dsi.last_attempt_id AND cca.tenant_id = dsi.tenant_id
     LEFT JOIN contact_phones p_att
       ON p_att.id = cca.contact_phone_id AND p_att.tenant_id = dsi.tenant_id
     WHERE dsi.tenant_id = ? AND dsi.session_id = ?
     ORDER BY dsi.order_index ASC, dsi.id ASC`,
    [tenantId, sid]
  );

  // Dialing set dispositions (buttons) for this session
  let dispositions = [];
  if (sess.dialing_set_id) {
    const rawDispos = await query(
      `SELECT
          d.id,
          d.name,
          d.code,
          d.next_action,
          d.is_connected,
          d.actions
       FROM dialing_set_dispositions dsd
       INNER JOIN dispositions d
         ON d.id = dsd.disposition_id AND d.tenant_id = dsd.tenant_id AND d.is_deleted = 0
       WHERE dsd.tenant_id = ? AND dsd.dialing_set_id = ?
       ORDER BY dsd.order_index ASC`,
      [tenantId, String(sess.dialing_set_id)]
    );
    dispositions = await enrichDispositionsForDialerSession(tenantId, rawDispos);
  }

  // Call script body (rendered in UI with variables)
  let script = null;
  if (sess.call_script_id) {
    const [srow] = await query(
      `SELECT id, script_name, script_body
       FROM call_scripts
       WHERE tenant_id = ? AND id = ? AND is_deleted = 0
       LIMIT 1`,
      [tenantId, Number(sess.call_script_id)]
    );
    script = srow || null;
  }

  return { ...sess, items, dispositions, script };
}

function parseMultiDialerStatus(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return s
    .split(/[,;|]/)
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
}

const DIAL_SESSION_STATUS = new Set(['ready', 'active', 'paused', 'completed', 'cancelled']);

const DS_COLUMN_FILTER_OPS = new Set([
  'empty',
  'not_empty',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
]);

const DS_FILTER_FIELD_ALIASES = {
  session_no: 'user_session_no',
  leads: 'items_count',
  created: 'created_at',
  started: 'started_at',
  ended: 'ended_at',
  created_by: 'creator_name',
  called: 'called_count',
  connected: 'connected_count',
  failed: 'failed_count',
  queued_left: 'queued_count',
  script: 'script_name',
  session_time: 'duration_sec',
};

function mapDialSessionsColumnFilterField(raw) {
  const f = String(raw || '').trim();
  return DS_FILTER_FIELD_ALIASES[f] || f;
}

const DS_FILTER_FIELDS = new Set([
  'user_session_no',
  'id',
  'status',
  'provider',
  'created_at',
  'started_at',
  'ended_at',
  'creator_name',
  'items_count',
  'called_count',
  'connected_count',
  'failed_count',
  'queued_count',
  'script_name',
  'duration_sec',
]);

/** Scalar subquery — same as list ORDER BY items_count */
const DS_ITEMS_COUNT_SUBQUERY = `(SELECT COUNT(*) FROM dialer_session_items dsi WHERE dsi.tenant_id = ds.tenant_id AND dsi.session_id = ds.id)`;

const DS_SUB_QUEUED = `(SELECT COUNT(*) FROM dialer_session_items dsi WHERE dsi.tenant_id = ds.tenant_id AND dsi.session_id = ds.id AND dsi.state = 'queued')`;

const DS_SUB_CALLED = `(SELECT COUNT(*) FROM dialer_session_items dsi WHERE dsi.tenant_id = ds.tenant_id AND dsi.session_id = ds.id AND dsi.state = 'called')`;

const DS_SUB_FAILED = `(SELECT COUNT(*) FROM dialer_session_items dsi WHERE dsi.tenant_id = ds.tenant_id AND dsi.session_id = ds.id AND dsi.state = 'failed')`;

const DS_SUB_CONNECTED = `(SELECT COUNT(*) FROM dialer_session_items dsi INNER JOIN contact_call_attempts cca ON cca.id = dsi.last_attempt_id AND cca.tenant_id = dsi.tenant_id WHERE dsi.tenant_id = ds.tenant_id AND dsi.session_id = ds.id AND dsi.state = 'called' AND cca.is_connected = 1)`;

const DS_SCRIPT_NAME_SUB = `(SELECT cs.script_name FROM call_scripts cs WHERE cs.tenant_id = ds.tenant_id AND cs.id = ds.call_script_id AND cs.is_deleted = 0 LIMIT 1)`;

/** Wall-clock length minus paused_seconds (ended_at or now). */
const DS_SESSION_DURATION_SEC = `(CASE WHEN ds.started_at IS NULL THEN 0 ELSE GREATEST(0, TIMESTAMPDIFF(SECOND, ds.started_at, COALESCE(ds.ended_at, UTC_TIMESTAMP())) - COALESCE(ds.paused_seconds, 0)) END)`;

const DIAL_SESSION_IDS_CAP = 5000;

const DS_EXPORT_MAX_ROWS = 50000;

const DS_EXPORT_COL_SQL = {
  session_no: 'ds.user_session_no',
  id: 'ds.id',
  status: 'ds.status',
  provider: 'ds.provider',
  leads: DS_ITEMS_COUNT_SUBQUERY,
  called: DS_SUB_CALLED,
  connected: DS_SUB_CONNECTED,
  failed: DS_SUB_FAILED,
  queued_left: DS_SUB_QUEUED,
  script: DS_SCRIPT_NAME_SUB,
  session_time: DS_SESSION_DURATION_SEC,
  created: 'ds.created_at',
  started: 'ds.started_at',
  ended: 'ds.ended_at',
  created_by: 'u.name',
};

const DS_EXPORT_HEADERS = {
  session_no: 'Session #',
  id: 'ID',
  status: 'Status',
  provider: 'Provider',
  leads: 'Total contacts',
  called: 'Called',
  connected: 'Connected',
  failed: 'Failed',
  queued_left: 'Queued left',
  script: 'Script',
  session_time: 'Session time (sec)',
  created: 'Created',
  started: 'Started',
  ended: 'Ended',
  created_by: 'Created by',
};

function normalizeDialSessionsColumnFilters(raw) {
  if (raw == null || raw === '') return [];
  let arr;
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const byField = new Map();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const field = mapDialSessionsColumnFilterField(String(item.field || '').trim());
    const op = String(item.op || '').trim();
    if (!DS_FILTER_FIELDS.has(field)) continue;
    if (!DS_COLUMN_FILTER_OPS.has(op)) continue;
    const value = item.value == null ? '' : String(item.value).trim();
    if (value.length > 200) continue;
    if (['contains', 'not_contains', 'starts_with', 'ends_with'].includes(op) && value === '') continue;
    byField.set(field, { field, op, value });
  }
  return [...byField.values()].slice(0, 12);
}

function pushDialSessionsColumnFilter(where, params, rule) {
  const { field, op, value } = rule;
  const like = (v) => `%${v}%`;
  const starts = (v) => `${v}%`;
  const ends = (v) => `%${v}`;

  const expr = () => {
    switch (field) {
      case 'user_session_no':
        return 'CAST(ds.user_session_no AS CHAR)';
      case 'id':
        return 'CAST(ds.id AS CHAR)';
      case 'status':
        return 'COALESCE(ds.status, \'\')';
      case 'provider':
        return 'COALESCE(ds.provider, \'\')';
      case 'created_at':
        return 'CAST(ds.created_at AS CHAR)';
      case 'started_at':
        return 'CAST(ds.started_at AS CHAR)';
      case 'ended_at':
        return 'CAST(ds.ended_at AS CHAR)';
      case 'creator_name':
        return 'COALESCE(u.name, \'\')';
      case 'items_count':
        return `CAST(${DS_ITEMS_COUNT_SUBQUERY} AS CHAR)`;
      case 'called_count':
        return `CAST(${DS_SUB_CALLED} AS CHAR)`;
      case 'connected_count':
        return `CAST(${DS_SUB_CONNECTED} AS CHAR)`;
      case 'failed_count':
        return `CAST(${DS_SUB_FAILED} AS CHAR)`;
      case 'queued_count':
        return `CAST(${DS_SUB_QUEUED} AS CHAR)`;
      case 'script_name':
        return `COALESCE(${DS_SCRIPT_NAME_SUB}, '')`;
      case 'duration_sec':
        return `CAST(${DS_SESSION_DURATION_SEC} AS CHAR)`;
      default:
        return null;
    }
  };

  const e = expr();
  if (!e) return;

  if (op === 'empty') {
    where.push(`((${e}) IS NULL OR TRIM(${e}) = '')`);
    return;
  }
  if (op === 'not_empty') {
    where.push(`((${e}) IS NOT NULL AND TRIM(${e}) <> '')`);
    return;
  }
  if (op === 'contains') {
    where.push(`(${e} LIKE ?)`);
    params.push(like(value));
    return;
  }
  if (op === 'not_contains') {
    where.push(`(NOT (COALESCE(${e}, '') LIKE ?))`);
    params.push(like(value));
    return;
  }
  if (op === 'starts_with') {
    where.push(`(${e} LIKE ?)`);
    params.push(starts(value));
    return;
  }
  if (op === 'ends_with') {
    where.push(`(${e} LIKE ?)`);
    params.push(ends(value));
  }
}

const DS_LIST_USER_JOIN = `LEFT JOIN users u ON u.id = ds.created_by_user_id AND u.tenant_id = ds.tenant_id`;

function optNonNegInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function pushScalarRange(where, params, exprSql, minRaw, maxRaw) {
  let min = optNonNegInt(minRaw);
  let max = optNonNegInt(maxRaw);
  if (min != null && max != null && min > max) {
    const t = min;
    min = max;
    max = t;
  }
  if (min != null) {
    where.push(`(${exprSql}) >= ?`);
    params.push(min);
  }
  if (max != null) {
    where.push(`(${exprSql}) <= ?`);
    params.push(max);
  }
}

/**
 * Shared WHERE for list, ids, and CSV export (must JOIN users when counting — filters may reference u.name).
 */
function buildDialSessionsWhere(
  tenantId,
  user,
  {
    q,
    status,
    provider,
    created_after,
    created_before,
    column_filters,
    created_by_user_id,
    script_q,
    items_min,
    items_max,
    called_min,
    called_max,
    connected_min,
    connected_max,
    failed_min,
    failed_max,
    queued_min,
    queued_max,
    duration_min,
    duration_max,
  } = {}
) {
  const where = ['ds.tenant_id = ?'];
  const params = [tenantId];

  if (user.role === 'admin') {
    /* tenant-wide */
  } else if (user.role === 'manager') {
    where.push(
      `(ds.created_by_user_id = ? OR ds.created_by_user_id IN (SELECT id FROM users WHERE tenant_id = ? AND manager_id = ? AND role = 'agent' AND is_deleted = 0))`
    );
    params.push(user.id, tenantId, user.id);
  } else {
    where.push('ds.created_by_user_id = ?');
    params.push(user.id);
  }

  const qTrim = q != null && String(q).trim() ? String(q).trim() : '';
  if (qTrim) {
    const n = parseInt(qTrim, 10);
    if (String(n) === qTrim && n > 0) {
      where.push('(ds.id = ? OR ds.user_session_no = ?)');
      params.push(n, n);
    } else {
      where.push('(CAST(ds.user_session_no AS CHAR) LIKE ? OR CAST(ds.id AS CHAR) LIKE ?)');
      params.push(`%${qTrim}%`, `%${qTrim}%`);
    }
  }

  if (provider != null && String(provider).trim() !== '') {
    where.push('ds.provider = ?');
    params.push(String(provider).trim());
  }

  const sts = parseMultiDialerStatus(status).filter((s) => DIAL_SESSION_STATUS.has(s));
  if (sts.length === 1) {
    where.push('ds.status = ?');
    params.push(sts[0]);
  } else if (sts.length > 1) {
    const ph = sts.map(() => '?').join(', ');
    where.push(`ds.status IN (${ph})`);
    params.push(...sts);
  }

  if (created_after) {
    where.push('ds.created_at >= ?');
    params.push(created_after);
  }
  if (created_before) {
    where.push('ds.created_at <= ?');
    params.push(created_before);
  }

  const creatorFilter = optNonNegInt(created_by_user_id);
  if (creatorFilter != null) {
    where.push('ds.created_by_user_id = ?');
    params.push(creatorFilter);
  }

  const scriptTrim =
    script_q != null && String(script_q).trim() ? String(script_q).trim().slice(0, 200) : '';
  if (scriptTrim) {
    where.push(`(COALESCE(${DS_SCRIPT_NAME_SUB}, '') LIKE ?)`);
    params.push(`%${scriptTrim}%`);
  }

  pushScalarRange(where, params, DS_ITEMS_COUNT_SUBQUERY, items_min, items_max);
  pushScalarRange(where, params, DS_SUB_CALLED, called_min, called_max);
  pushScalarRange(where, params, DS_SUB_CONNECTED, connected_min, connected_max);
  pushScalarRange(where, params, DS_SUB_FAILED, failed_min, failed_max);
  pushScalarRange(where, params, DS_SUB_QUEUED, queued_min, queued_max);
  pushScalarRange(where, params, DS_SESSION_DURATION_SEC, duration_min, duration_max);

  const columnRules = normalizeDialSessionsColumnFilters(column_filters);
  for (const rule of columnRules) {
    pushDialSessionsColumnFilter(where, params, rule);
  }

  return { whereSql: where.join(' AND '), params };
}

/** All matching dial session ids for current list filters, capped for bulk selection. */
export async function listDialSessionIds(tenantId, user, filters = {}) {
  const { whereSql, params } = buildDialSessionsWhere(tenantId, user, filters);
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM dialer_sessions ds ${DS_LIST_USER_JOIN} WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.total) || 0;
  const cap = DIAL_SESSION_IDS_CAP;
  const rows = await query(
    `SELECT ds.id FROM dialer_sessions ds
     ${DS_LIST_USER_JOIN}
     WHERE ${whereSql}
     ORDER BY ds.id ASC
     LIMIT ${cap + 1}`,
    params
  );
  const truncated = rows.length > cap;
  const ids = (truncated ? rows.slice(0, cap) : rows).map((r) => r.id);
  return { ids, total, truncated, cap };
}

function csvEscapeDialSessionExport(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDialSessionExportCell(key, raw) {
  if (raw == null) return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    return raw.toISOString();
  }
  return String(raw);
}

/**
 * CSV export (same filters as list). Column keys match `dialSessionsTableConfig` ids.
 */
export async function exportDialSessionsCsv(
  tenantId,
  user,
  {
    q,
    status,
    provider,
    created_after,
    created_before,
    column_filters,
    created_by_user_id,
    script_q,
    items_min,
    items_max,
    called_min,
    called_max,
    connected_min,
    connected_max,
    failed_min,
    failed_max,
    queued_min,
    queued_max,
    duration_min,
    duration_max,
    export_scope = 'filtered',
    selected_ids = [],
    columns = [],
  } = {}
) {
  const keys = (Array.isArray(columns) ? columns : [])
    .map((k) => String(k).trim())
    .filter((k) => Object.prototype.hasOwnProperty.call(DS_EXPORT_COL_SQL, k));
  if (keys.length === 0) {
    const err = new Error('Choose at least one column to export');
    err.status = 400;
    throw err;
  }

  const filters = {
    q,
    status,
    provider,
    created_after,
    created_before,
    column_filters,
    created_by_user_id,
    script_q,
    items_min,
    items_max,
    called_min,
    called_max,
    connected_min,
    connected_max,
    failed_min,
    failed_max,
    queued_min,
    queued_max,
    duration_min,
    duration_max,
  };
  const { whereSql, params: baseParams } = buildDialSessionsWhere(tenantId, user, filters);
  const params = [...baseParams];
  let whereFinal = whereSql;

  const scope = String(export_scope || 'filtered').toLowerCase() === 'selected' ? 'selected' : 'filtered';
  if (scope === 'selected') {
    const ids = [
      ...new Set(
        (Array.isArray(selected_ids) ? selected_ids : [])
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ].slice(0, DIAL_SESSION_IDS_CAP);
    if (ids.length === 0) {
      return '\uFEFF';
    }
    whereFinal += ` AND ds.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  const selectList = keys.map((k) => `${DS_EXPORT_COL_SQL[k]} AS \`${k}\``).join(', ');
  const sql = `SELECT ${selectList} FROM dialer_sessions ds ${DS_LIST_USER_JOIN} WHERE ${whereFinal} ORDER BY ds.created_at DESC, ds.id DESC LIMIT ${DS_EXPORT_MAX_ROWS + 1}`;

  const rows = await query(sql, params);
  const dataRows = rows.length > DS_EXPORT_MAX_ROWS ? rows.slice(0, DS_EXPORT_MAX_ROWS) : rows;

  const headerLine = keys.map((k) => csvEscapeDialSessionExport(DS_EXPORT_HEADERS[k] || k)).join(',');
  const lines = [`\uFEFF${headerLine}`];
  for (const row of dataRows) {
    const cells = keys.map((k) => csvEscapeDialSessionExport(formatDialSessionExportCell(k, row[k])));
    lines.push(cells.join(','));
  }
  return lines.join('\r\n');
}

/**
 * Paginated dial sessions for the tenant. Admin: all; manager: own + direct reports; agent: own only.
 */
export async function listDialSessions(
  tenantId,
  user,
  {
    page = 1,
    limit = 20,
    q,
    status,
    provider,
    created_after,
    created_before,
    sort_by,
    sort_dir,
    column_filters,
    created_by_user_id,
    script_q,
    items_min,
    items_max,
    called_min,
    called_max,
    connected_min,
    connected_max,
    failed_min,
    failed_max,
    queued_min,
    queued_max,
    duration_min,
    duration_max,
  } = {}
) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const { whereSql, params } = buildDialSessionsWhere(tenantId, user, {
    q,
    status,
    provider,
    created_after,
    created_before,
    column_filters,
    created_by_user_id,
    script_q,
    items_min,
    items_max,
    called_min,
    called_max,
    connected_min,
    connected_max,
    failed_min,
    failed_max,
    queued_min,
    queued_max,
    duration_min,
    duration_max,
  });

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM dialer_sessions ds ${DS_LIST_USER_JOIN} WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.total) || 0;

  const sortKey = String(sort_by || '').trim();
  const sortDirOrd = String(sort_dir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderMap = {
    created_at: 'ds.created_at',
    id: 'ds.id',
    user_session_no: 'ds.user_session_no',
    provider: 'ds.provider',
    status: 'ds.status',
    started_at: 'ds.started_at',
    ended_at: 'ds.ended_at',
    creator_name: 'u.name',
    items_count: DS_ITEMS_COUNT_SUBQUERY,
    called_count: DS_SUB_CALLED,
    connected_count: DS_SUB_CONNECTED,
    failed_count: DS_SUB_FAILED,
    queued_count: DS_SUB_QUEUED,
    script_name: DS_SCRIPT_NAME_SUB,
    duration_sec: DS_SESSION_DURATION_SEC,
  };
  const orderCol = orderMap[sortKey] || 'ds.created_at';
  const orderSql = `ORDER BY ${orderCol} ${sortDirOrd}, ds.id DESC`;

  const rows = await query(
    `SELECT
        ds.id,
        ds.user_session_no,
        ds.provider,
        ds.status,
        ds.started_at,
        ds.ended_at,
        ds.created_at,
        ds.created_by_user_id,
        u.name AS creator_name,
        ${DS_ITEMS_COUNT_SUBQUERY} AS items_count,
        ${DS_SUB_CALLED} AS called_count,
        ${DS_SUB_CONNECTED} AS connected_count,
        ${DS_SUB_FAILED} AS failed_count,
        ${DS_SUB_QUEUED} AS queued_count,
        ${DS_SCRIPT_NAME_SUB} AS script_name,
        ${DS_SESSION_DURATION_SEC} AS duration_sec
     FROM dialer_sessions ds
     ${DS_LIST_USER_JOIN}
     WHERE ${whereSql}
     ${orderSql}
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

async function pickNextQueuedItem(tenantId, sessionId) {
  const [row] = await query(
    `SELECT id, contact_id, contact_phone_id
     FROM dialer_session_items
     WHERE tenant_id = ? AND session_id = ? AND state = 'queued'
     ORDER BY order_index ASC, id ASC
     LIMIT 1`,
    [tenantId, sessionId]
  );
  return row || null;
}

export async function callNextInSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  if (!sid) {
    const err = new Error('Invalid session id');
    err.status = 400;
    throw err;
  }

  // Serialize all "next dial" work per session (double-clicks, StrictMode, parallel tabs).
  const lockName = `cn_dn_${tenantId}_${sid}`.slice(0, 64);
  return withConnection(async (conn) => {
    const [lr] = await conn.query('SELECT GET_LOCK(?, 25) AS g', [lockName]);
    const got = Number(lr?.[0]?.g);
    if (got !== 1) {
      const err = new Error('Another dial action is in progress for this session. Please wait.');
      err.status = 409;
      throw err;
    }
    try {
      return await runCallNextAfterLock(tenantId, user, sid);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?) AS r', [lockName]);
    }
  });
}

async function runCallNextAfterLock(tenantId, user, sid) {
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status === 'paused') {
    const err = new Error('Session is paused');
    err.status = 400;
    throw err;
  }
  if (session.status !== 'active' && session.status !== 'ready') {
    const err = new Error('Session is not active');
    err.status = 400;
    throw err;
  }
  if (session.status === 'ready') {
    await query(
      `UPDATE dialer_sessions
       SET status = 'active', started_at = COALESCE(started_at, NOW())
       WHERE tenant_id = ? AND id = ? AND status = 'ready'`,
      [tenantId, sid]
    );
  }

  const [activeCalling] = await query(
    `SELECT id FROM dialer_session_items
     WHERE tenant_id = ? AND session_id = ? AND state = 'calling'
     LIMIT 1`,
    [tenantId, sid]
  );
  if (activeCalling) {
    const err = new Error('Finish the current call (set a disposition) before dialing the next lead.');
    err.status = 400;
    throw err;
  }

  const next = await pickNextQueuedItem(tenantId, sid);
  if (!next) {
    const doneRes = await query(
      `UPDATE dialer_sessions SET status = 'completed', ended_at = NOW()
       WHERE tenant_id = ? AND id = ? AND status IN ('active','ready')`,
      [tenantId, sid]
    );
    if (Number(doneRes?.affectedRows ?? 0) > 0) {
      await safeLogTenantActivity(tenantId, user?.id, {
        event_category: 'dialer',
        event_type: 'dialer.session.completed',
        summary: `Dialer session #${Number(session.user_session_no)} completed`,
        payload_json: { session_id: sid },
      });
    }
    return { done: true, attempt: null, session: await getSession(tenantId, user, sid) };
  }

  // Set state = calling and last_attempt_id together after the attempt row exists.
  // (A prior two-step update left rows in state calling with NULL last_attempt_id, which
  // disabled disposition buttons until the client refetched.)
  try {
    const attempt = await startCallForContact(tenantId, user, {
      contact_id: next.contact_id,
      contact_phone_id: next.contact_phone_id != null ? next.contact_phone_id : null,
      provider: session.provider || 'dummy',
      dialer_session_id: sid,
    });
    await query(
      `UPDATE dialer_session_items
       SET state = 'calling', last_attempt_id = ?, last_error = NULL, called_at = NULL
       WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
      [attempt.id, tenantId, next.id]
    );
    return { done: false, attempt, session: await getSession(tenantId, user, sid) };
  } catch (e) {
    await query(
      `UPDATE dialer_session_items
       SET state = 'failed', last_error = ?
       WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
      [String(e?.message || 'Call failed').slice(0, 255), tenantId, next.id]
    );
    return { done: false, attempt: null, error: e?.message || 'Call failed', session: await getSession(tenantId, user, sid) };
  }
}

/**
 * After disposition with next_action = next_number: dial the next phone on the same queue item,
 * or complete the item and advance to the next contact (same lock as call next).
 */
export async function handleNextNumberDisposition(tenantId, user, attemptId) {
  const aid = Number(attemptId);
  if (!aid || !Number.isFinite(aid)) {
    const err = new Error('Invalid attempt id');
    err.status = 400;
    throw err;
  }

  const probeRows = await query(
    `SELECT session_id
     FROM dialer_session_items
     WHERE tenant_id = ? AND last_attempt_id = ? AND state = 'calling'
     LIMIT 1`,
    [tenantId, aid]
  );
  const probe = probeRows[0];
  if (!probe) {
    return {
      skipped: true,
      auto_dialed: false,
      done: false,
      attempt: null,
      session: null,
    };
  }

  const sid = Number(probe.session_id);

  return withConnection(async (conn) => {
    const lockName = `cn_dn_${tenantId}_${sid}`.slice(0, 64);
    const [lr] = await conn.query('SELECT GET_LOCK(?, 25) AS g', [lockName]);
    const got = Number(lr?.[0]?.g);
    if (got !== 1) {
      const err = new Error('Another dial action is in progress for this session. Please wait.');
      err.status = 409;
      throw err;
    }
    try {
      const rows = await query(
        `SELECT dsi.id AS item_id,
                dsi.session_id,
                dsi.contact_id,
                dsi.contact_phone_id,
                ds.status AS sess_status
         FROM dialer_session_items dsi
         INNER JOIN dialer_sessions ds
           ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id
         WHERE dsi.tenant_id = ? AND dsi.last_attempt_id = ? AND dsi.state = 'calling'
         LIMIT 1`,
        [tenantId, aid]
      );
      const itemRow = rows[0];
      if (!itemRow) {
        return {
          skipped: true,
          auto_dialed: false,
          done: false,
          attempt: null,
          session: await getSession(tenantId, user, sid),
        };
      }

      const [attemptRow] = await query(
        `SELECT contact_phone_id FROM contact_call_attempts WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, aid]
      );
      const apid = attemptRow?.contact_phone_id;
      const attemptPhoneId =
        apid != null && String(apid) !== '' ? Number(apid) : null;

      const phones = await query(
        `SELECT id, phone, label, is_primary
         FROM contact_phones
         WHERE tenant_id = ? AND contact_id = ?
         ORDER BY is_primary DESC, id ASC`,
        [tenantId, itemRow.contact_id]
      );

      let nextIdx;
      if (attemptPhoneId != null && Number.isFinite(attemptPhoneId) && attemptPhoneId > 0) {
        const idx = phones.findIndex((p) => Number(p.id) === attemptPhoneId);
        nextIdx = idx >= 0 ? idx + 1 : phones.length;
      } else {
        nextIdx = phones.length > 0 ? 1 : 0;
      }

      const nextPhone = phones[nextIdx];

      if (!nextPhone) {
        await query(
          `UPDATE dialer_session_items
           SET state = 'called', called_at = NOW()
           WHERE tenant_id = ? AND id = ? AND last_attempt_id = ? AND state = 'calling'`,
          [tenantId, itemRow.item_id, aid]
        );
        const dial = await runCallNextAfterLock(tenantId, user, sid);
        return {
          skipped: false,
          auto_dialed: Boolean(dial?.attempt?.id),
          done: Boolean(dial?.done),
          attempt: dial?.attempt ?? null,
          session: dial?.session ?? (await getSession(tenantId, user, sid)),
        };
      }

      await query(
        `UPDATE dialer_session_items
         SET state = 'queued',
             last_attempt_id = NULL,
             called_at = NULL,
             contact_phone_id = ?
         WHERE tenant_id = ? AND id = ? AND last_attempt_id = ? AND state = 'calling'`,
        [nextPhone.id, tenantId, itemRow.item_id, aid]
      );

      if (String(itemRow.sess_status || '').toLowerCase() === 'paused') {
        return {
          skipped: false,
          auto_dialed: false,
          done: false,
          attempt: null,
          session: await getSession(tenantId, user, sid),
        };
      }

      const dial = await runCallNextAfterLock(tenantId, user, sid);
      return {
        skipped: false,
        auto_dialed: Boolean(dial?.attempt?.id),
        done: Boolean(dial?.done),
        attempt: dial?.attempt ?? null,
        session: dial?.session ?? (await getSession(tenantId, user, sid)),
      };
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?) AS r', [lockName]);
    }
  });
}

export async function cancelSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  await query(
    `UPDATE dialer_sessions SET status = 'cancelled', ended_at = NOW()
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, sid]
  );
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'dialer',
    event_type: 'dialer.session.cancelled',
    summary: `Dialer session #${Number(session.user_session_no)} cancelled`,
    payload_json: { session_id: sid },
  });
  return getSession(tenantId, user, sid);
}

export async function pauseSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status === 'completed' || session.status === 'cancelled') return session;
  if (session.status === 'paused') return session;

  await query(
    `UPDATE dialer_sessions
     SET status = 'paused', paused_at = NOW()
     WHERE tenant_id = ? AND id = ? AND status IN ('ready','active')`,
    [tenantId, sid]
  );
  return getSession(tenantId, user, sid);
}

export async function resumeSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status !== 'paused') return session;

  await query(
    `UPDATE dialer_sessions
     SET
       status = 'active',
       paused_seconds = paused_seconds + GREATEST(0, TIMESTAMPDIFF(SECOND, paused_at, NOW())),
       paused_at = NULL
     WHERE tenant_id = ? AND id = ? AND status = 'paused'`,
    [tenantId, sid]
  );
  return getSession(tenantId, user, sid);
}

export async function updateSessionItemTargetPhone(
  tenantId,
  user,
  sessionId,
  itemId,
  { contact_phone_id: phoneIdRaw = null } = {}
) {
  const sid = Number(sessionId);
  const iid = Number(itemId);
  if (!sid || !iid) {
    const err = new Error('Invalid session or item id');
    err.status = 400;
    throw err;
  }

  await getSession(tenantId, user, sid);

  const phoneId =
    phoneIdRaw === null || phoneIdRaw === undefined || phoneIdRaw === ''
      ? null
      : Number(phoneIdRaw);
  if (phoneId !== null && (!Number.isFinite(phoneId) || phoneId <= 0)) {
    const err = new Error('Invalid contact_phone_id');
    err.status = 400;
    throw err;
  }

  const [item] = await query(
    `SELECT id, contact_id, state FROM dialer_session_items WHERE tenant_id = ? AND session_id = ? AND id = ? LIMIT 1`,
    [tenantId, sid, iid]
  );
  if (!item) {
    const err = new Error('Queue item not found');
    err.status = 404;
    throw err;
  }
  if (item.state !== 'queued') {
    const err = new Error('You can only change the target number while this lead is queued.');
    err.status = 400;
    throw err;
  }

  if (phoneId) {
    const [ph] = await query(
      `SELECT id FROM contact_phones WHERE tenant_id = ? AND contact_id = ? AND id = ? LIMIT 1`,
      [tenantId, item.contact_id, phoneId]
    );
    if (!ph) {
      const err = new Error('Phone does not belong to this contact');
      err.status = 400;
      throw err;
    }
  }

  await query(
    `UPDATE dialer_session_items SET contact_phone_id = ? WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
    [phoneId, tenantId, iid]
  );
  return getSession(tenantId, user, sid);
}

