import { query } from '../../config/db.js';
import { getTelephonyProvider } from './telephony/telephonyProviderRegistry.js';
import * as opportunitiesService from './opportunitiesService.js';
import { loadDispositionCallApplyMeta } from './dispositionApplyDealHelper.js';

const CALL_ATTEMPT_IDS_CAP = 5000;

/** Joins required when WHERE references c, p, u, d (search + column filters). */
const CALL_ATTEMPTS_STANDARD_JOINS = `
  LEFT JOIN contacts c ON c.id = cca.contact_id AND c.tenant_id = cca.tenant_id
  LEFT JOIN contact_phones p ON p.id = cca.contact_phone_id AND p.tenant_id = cca.tenant_id
  LEFT JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id
  LEFT JOIN dispositions d ON d.id = cca.disposition_id AND d.tenant_id = cca.tenant_id AND d.is_deleted = 0
`;

const CH_COLUMN_FILTER_OPS = new Set([
  'empty',
  'not_empty',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
]);

const CH_FILTER_FIELDS = new Set([
  'created_at',
  'id',
  'contact',
  'phone',
  'agent',
  'dial_session',
  'direction',
  'status',
  'is_connected',
  'disposition',
  'notes',
  'duration_sec',
  'started_at',
  'ended_at',
  'provider',
]);

/** Dial session linked to this attempt via dialer_session_items.last_attempt_id (newest item wins). */
const CH_DIAL_SESSION_SORT_EXPR = `(SELECT LPAD(COALESCE(CAST(ds.user_session_no AS UNSIGNED), 0), 12, '0') FROM dialer_session_items dsi INNER JOIN dialer_sessions ds ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id WHERE dsi.last_attempt_id = cca.id AND dsi.tenant_id = cca.tenant_id ORDER BY dsi.id DESC LIMIT 1)`;

const CH_DIAL_SESSION_FILTER_TEXT_EXPR = `(SELECT CONCAT(COALESCE(CAST(ds.user_session_no AS CHAR), ''), ' ', COALESCE(CAST(ds.id AS CHAR), '')) FROM dialer_session_items dsi INNER JOIN dialer_sessions ds ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id WHERE dsi.last_attempt_id = cca.id AND dsi.tenant_id = cca.tenant_id ORDER BY dsi.id DESC LIMIT 1)`;

export function normalizeCallHistoryColumnFilters(raw) {
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
    const field = String(item.field || '').trim();
    const op = String(item.op || '').trim();
    if (!CH_FILTER_FIELDS.has(field)) continue;
    if (!CH_COLUMN_FILTER_OPS.has(op)) continue;
    const value = item.value == null ? '' : String(item.value).trim();
    if (value.length > 200) continue;
    if (['contains', 'not_contains', 'starts_with', 'ends_with'].includes(op) && value === '') continue;
    byField.set(field, { field, op, value });
  }
  return [...byField.values()].slice(0, 12);
}

function pushCallHistoryColumnFilter(where, params, rule) {
  const { field, op, value } = rule;
  const like = (v) => `%${v}%`;
  const starts = (v) => `${v}%`;
  const ends = (v) => `%${v}`;

  if (field === 'dial_session') {
    if (op === 'empty') {
      where.push(
        `NOT EXISTS (SELECT 1 FROM dialer_session_items dsi WHERE dsi.tenant_id = cca.tenant_id AND dsi.last_attempt_id = cca.id)`
      );
      return;
    }
    if (op === 'not_empty') {
      where.push(
        `EXISTS (SELECT 1 FROM dialer_session_items dsi WHERE dsi.tenant_id = cca.tenant_id AND dsi.last_attempt_id = cca.id)`
      );
      return;
    }
    const e = CH_DIAL_SESSION_FILTER_TEXT_EXPR;
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
    return;
  }

  const expr = () => {
    switch (field) {
      case 'created_at':
        return 'CAST(cca.created_at AS CHAR)';
      case 'id':
        return 'CAST(cca.id AS CHAR)';
      case 'contact':
        return 'COALESCE(c.display_name, \'\')';
      case 'phone':
        return 'COALESCE(p.phone, \'\')';
      case 'agent':
        return 'COALESCE(u.name, \'\')';
      case 'direction':
        return 'COALESCE(cca.direction, \'\')';
      case 'status':
        return 'COALESCE(cca.status, \'\')';
      case 'is_connected':
        return 'CAST(cca.is_connected AS CHAR)';
      case 'disposition':
        return 'COALESCE(d.name, \'\')';
      case 'notes':
        return 'COALESCE(cca.notes, \'\')';
      case 'duration_sec':
        return 'CAST(COALESCE(cca.duration_sec, 0) AS CHAR)';
      case 'started_at':
        return 'CAST(cca.started_at AS CHAR)';
      case 'ended_at':
        return 'CAST(cca.ended_at AS CHAR)';
      case 'provider':
        return 'COALESCE(cca.provider, \'\')';
      default:
        return null;
    }
  };

  const e = expr();
  if (!e) return;

  if (op === 'empty') {
    if (field === 'notes') where.push(`(cca.notes IS NULL OR TRIM(cca.notes) = '')`);
    else if (field === 'disposition') where.push(`(d.name IS NULL OR TRIM(d.name) = '')`);
    else if (field === 'contact') where.push(`(c.display_name IS NULL OR TRIM(c.display_name) = '')`);
    else if (field === 'phone') where.push(`(p.phone IS NULL OR TRIM(p.phone) = '')`);
    else if (field === 'agent') where.push(`(u.name IS NULL OR TRIM(u.name) = '')`);
    else where.push(`((${e}) IS NULL OR TRIM(${e}) = '')`);
    return;
  }
  if (op === 'not_empty') {
    if (field === 'notes') where.push(`(cca.notes IS NOT NULL AND TRIM(cca.notes) <> '')`);
    else if (field === 'disposition') where.push(`(d.name IS NOT NULL AND TRIM(d.name) <> '')`);
    else if (field === 'contact') where.push(`(c.display_name IS NOT NULL AND TRIM(c.display_name) <> '')`);
    else if (field === 'phone') where.push(`(p.phone IS NOT NULL AND TRIM(p.phone) <> '')`);
    else if (field === 'agent') where.push(`(u.name IS NOT NULL AND TRIM(u.name) <> '')`);
    else where.push(`((${e}) IS NOT NULL AND TRIM(${e}) <> '')`);
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

async function fetchContactBaseForCall(tenantId, user, contactId) {
  const where = ['c.tenant_id = ?', 'c.deleted_at IS NULL', 'c.id = ?'];
  const params = [tenantId, contactId];
  if (user.role === 'agent') {
    where.push('c.assigned_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    where.push('c.manager_id = ?');
    params.push(user.id);
  }

  const [row] = await query(
    `SELECT
        c.id,
        c.type,
        c.manager_id,
        c.assigned_user_id,
        c.primary_phone_id
     FROM contacts c
     WHERE ${where.join(' AND ')}
     LIMIT 1`,
    params
  );
  return row || null;
}

async function fetchContactAndPhoneForCall(tenantId, user, contactId, requestedPhoneId = null) {
  const base = await fetchContactBaseForCall(tenantId, user, contactId);
  if (!base) return null;

  const reqPid = requestedPhoneId ? Number(requestedPhoneId) : null;
  if (reqPid && Number.isFinite(reqPid) && reqPid > 0) {
    const [p] = await query(
      `SELECT id AS phone_id, phone AS phone_e164
       FROM contact_phones
       WHERE tenant_id = ? AND contact_id = ? AND id = ?
       LIMIT 1`,
      [tenantId, contactId, reqPid]
    );
    if (!p?.phone_e164) return null;
    return { ...base, phone_id: p.phone_id, phone_e164: p.phone_e164 };
  }

  const [row] = await query(
    `SELECT
        p.id AS phone_id,
        p.phone AS phone_e164
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.tenant_id = c.tenant_id
      AND p.contact_id = c.id
      AND (p.id = c.primary_phone_id OR p.is_primary = 1)
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.id = ?
     ORDER BY (p.id = c.primary_phone_id) DESC, p.is_primary DESC, p.id ASC
     LIMIT 1`,
    [tenantId, contactId]
  );
  return { ...base, phone_id: row?.phone_id ?? null, phone_e164: row?.phone_e164 ?? null };
}

async function bumpContactCounters(tenantId, contactId, phoneId) {
  // contacts: first_called_at if null, last_called_at always, call_count_total += 1
  await query(
    `UPDATE contacts
     SET
       first_called_at = COALESCE(first_called_at, NOW()),
       last_called_at = NOW(),
       call_count_total = COALESCE(call_count_total, 0) + 1
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [tenantId, contactId]
  );

  if (phoneId) {
    await query(
      `UPDATE contact_phones
       SET
         last_called_at = NOW(),
         call_count = COALESCE(call_count, 0) + 1
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, phoneId]
    );
  }
}

export async function startCallForContact(
  tenantId,
  user,
  { contact_id, contact_phone_id = null, provider = 'dummy', notes = null, dialer_session_id = null } = {}
) {
  const cid = Number(contact_id);
  if (!cid) {
    const err = new Error('contact_id is required');
    err.status = 400;
    throw err;
  }

  const dialerSessionId =
    dialer_session_id === null || dialer_session_id === undefined || dialer_session_id === ''
      ? null
      : Number(dialer_session_id);
  if (dialerSessionId !== null && (!Number.isFinite(dialerSessionId) || dialerSessionId <= 0)) {
    const err = new Error('Invalid dialer_session_id');
    err.status = 400;
    throw err;
  }

  const row = await fetchContactAndPhoneForCall(tenantId, user, cid, contact_phone_id);
  if (!row) {
    const err = new Error(
      contact_phone_id ? 'Contact not found or phone does not belong to this contact' : 'Contact not found'
    );
    err.status = 404;
    throw err;
  }

  const chosenPhoneId = row.phone_id ? Number(row.phone_id) : null;
  const to = row.phone_e164;
  if (!to) {
    const err = new Error('No phone number found for this contact');
    err.status = 400;
    throw err;
  }

  const p = getTelephonyProvider(provider);
  const providerRes = await p.startOutboundCall({ to, metadata: { tenantId, contactId: cid, userId: user.id } });

  const startedAt = new Date();
  const endedAt = new Date(); // dummy provider completes immediately; real providers will update later

  const result = await query(
    `INSERT INTO contact_call_attempts (
       tenant_id,
       contact_id,
       contact_phone_id,
       agent_user_id,
       manager_id,
       dialer_session_id,
       provider,
       provider_call_id,
       direction,
       status,
       is_connected,
       notes,
       started_at,
       ended_at,
       duration_sec,
       created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      cid,
      chosenPhoneId,
      user.role === 'agent' ? user.id : row.assigned_user_id ?? null,
      row.manager_id ?? null,
      dialerSessionId,
      p.code,
      providerRes?.provider_call_id ?? null,
      providerRes?.status || 'completed',
      0,
      notes ? String(notes).slice(0, 2000) : null,
      startedAt,
      endedAt,
      0,
      user.id,
    ]
  );

  const attemptId = result.insertId;
  await bumpContactCounters(tenantId, cid, chosenPhoneId);

  return {
    id: attemptId,
    contact_id: cid,
    contact_phone_id: chosenPhoneId,
    provider: p.code,
    provider_call_id: providerRes?.provider_call_id ?? null,
    status: providerRes?.status || 'completed',
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
  };
}

export async function startCallsBulk(tenantId, user, { contact_ids = [], provider = 'dummy' } = {}) {
  const ids = Array.isArray(contact_ids)
    ? [...new Set(contact_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 100)
    : [];
  if (ids.length === 0) {
    const err = new Error('contact_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const started = [];
  const skipped = [];
  for (const id of ids) {
    try {
      const r = await startCallForContact(tenantId, user, { contact_id: id, provider });
      started.push(r);
    } catch (e) {
      skipped.push({ contact_id: id, reason: e?.message || 'failed' });
    }
  }
  return { startedCount: started.length, started, skippedCount: skipped.length, skipped };
}

export async function listCallAttempts(
  tenantId,
  user,
  {
    page = 1,
    limit = 20,
    q,
    contact_id,
    dialer_session_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    /**
     * Activity timeline cursor: ISO datetime string + optional attempt id (keyset when id set).
     * When id is null, matches (started_at < t OR started_at = t) for JS tie-break with other event types.
     */
    activity_timeline_cursor,
    today_only = false,
    /** Omit rows that only exist from starting a dial (no disposition and no agent-visible notes). */
    meaningful_only = false,
    sort_by,
    sort_dir,
    column_filters,
  } = {}
) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const { whereSql, params } = buildCallAttemptsWhere(tenantId, user, {
    q,
    contact_id,
    dialer_session_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    activity_timeline_cursor,
    today_only,
    meaningful_only,
    column_filters,
  });

  const [countRow] = await query(
    `SELECT COUNT(DISTINCT cca.id) AS total FROM contact_call_attempts cca ${CALL_ATTEMPTS_STANDARD_JOINS} WHERE ${whereSql}`,
    params
  );
  const total = countRow?.total ?? 0;

  const sortKey = String(sort_by || '').trim();
  const sortDirOrd = String(sort_dir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderMap = {
    created_at: 'cca.created_at',
    id: 'cca.id',
    contact_id: 'cca.contact_id',
    phone: 'p.phone',
    agent: 'u.name',
    dial_session: CH_DIAL_SESSION_SORT_EXPR,
    direction: 'cca.direction',
    status: 'cca.status',
    is_connected: 'cca.is_connected',
    disposition: 'd.name',
    duration_sec: 'cca.duration_sec',
    started_at: 'cca.started_at',
    ended_at: 'cca.ended_at',
    provider: 'cca.provider',
    notes: 'cca.notes',
  };
  const orderCol = orderMap[sortKey] || 'cca.created_at';
  const orderSql = `ORDER BY ${orderCol} ${sortDirOrd}, cca.id DESC`;

  const rows = await query(
    `SELECT
        cca.id,
        cca.contact_id,
        cca.contact_phone_id,
        cca.agent_user_id,
        cca.manager_id,
        cca.dialer_session_id,
        cca.provider,
        cca.provider_call_id,
        cca.direction,
        cca.status,
        cca.is_connected,
        cca.disposition_id,
        cca.notes,
        cca.started_at,
        cca.ended_at,
        cca.duration_sec,
        cca.created_at,
        c.display_name,
        p.phone AS phone_e164,
        u.name AS agent_name,
        d.name AS disposition_name,
        ds.user_session_no AS dialer_user_session_no
     FROM contact_call_attempts cca
     ${CALL_ATTEMPTS_STANDARD_JOINS}
     LEFT JOIN dialer_sessions ds
       ON ds.id = cca.dialer_session_id AND ds.tenant_id = cca.tenant_id
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

function buildCallAttemptsWhere(tenantId, user, filters = {}) {
  const {
    q,
    contact_id,
    dialer_session_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    activity_timeline_cursor,
    today_only = false,
    meaningful_only = false,
    column_filters,
  } = filters;

  const where = ['cca.tenant_id = ?'];
  const params = [tenantId];

  const parseMulti = (raw) => {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
    const s = String(raw).trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        // ignore
      }
    }
    return s
      .split(/[,;|]/)
      .map((x) => String(x).trim())
      .filter(Boolean);
  };

  const inClause = (col, values) => {
    const v = values.filter((x) => x !== '0' && x !== '');
    if (v.length === 0) return null;
    const ph = v.map(() => '?').join(', ');
    return { sql: `${col} IN (${ph})`, params: v };
  };

  if (q != null && String(q).trim()) {
    const s = String(q).trim();
    const like = `%${s}%`;
    const n = Number(s);
    const parts = [];
    const p = [];
    if (Number.isFinite(n) && n > 0) {
      parts.push('cca.id = ?');
      p.push(n);
      parts.push('cca.contact_id = ?');
      p.push(n);
      parts.push('cca.agent_user_id = ?');
      p.push(n);
    }
    parts.push('c.display_name LIKE ?');
    parts.push('p.phone LIKE ?');
    parts.push('u.name LIKE ?');
    parts.push('cca.notes LIKE ?');
    p.push(like, like, like, like);
    where.push(`(${parts.join(' OR ')})`);
    params.push(...p);
  }

  if (contact_id) {
    where.push('cca.contact_id = ?');
    params.push(Number(contact_id));
  }

  if (dialer_session_id) {
    where.push('cca.dialer_session_id = ?');
    params.push(Number(dialer_session_id));
  }

  if (disposition_id !== undefined && disposition_id !== null && disposition_id !== '') {
    const dispList = parseMulti(disposition_id);
    if (dispList.length <= 1) {
      const dispKey = String(disposition_id).trim();
      if (dispKey && dispKey !== '0') {
        where.push('cca.disposition_id = ?');
        params.push(dispKey);
      }
    } else {
      const c = inClause('cca.disposition_id', dispList);
      if (c) {
        where.push(c.sql);
        params.push(...c.params);
      }
    }
  }

  if (
    (user.role === 'manager' || user.role === 'admin') &&
    agent_user_id !== undefined &&
    agent_user_id !== null &&
    agent_user_id !== ''
  ) {
    const ids = parseMulti(agent_user_id)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map(String);
    if (ids.length === 1) {
      where.push('cca.agent_user_id = ?');
      params.push(Number(ids[0]));
    } else if (ids.length > 1) {
      const c = inClause('cca.agent_user_id', ids);
      if (c) {
        where.push(c.sql);
        params.push(...c.params.map((x) => Number(x)));
      }
    }
  }

  if (direction) {
    const dirs = parseMulti(direction).map((d) => d.toLowerCase());
    const filtered = dirs.filter((d) => d === 'inbound' || d === 'outbound');
    if (filtered.length === 1) {
      where.push('cca.direction = ?');
      params.push(filtered[0]);
    } else if (filtered.length > 1) {
      const c = inClause('cca.direction', filtered);
      if (c) {
        where.push(c.sql);
        params.push(...c.params);
      }
    }
  }

  if (status) {
    const allowed = new Set(['queued', 'ringing', 'connected', 'completed', 'failed', 'cancelled']);
    const sts = parseMulti(status).map((s) => s.toLowerCase()).filter((s) => allowed.has(s));
    if (sts.length === 1) {
      where.push('cca.status = ?');
      params.push(sts[0]);
    } else if (sts.length > 1) {
      const c = inClause('cca.status', sts);
      if (c) {
        where.push(c.sql);
        params.push(...c.params);
      }
    }
  }

  if (is_connected !== undefined) {
    const v = String(is_connected).trim().toLowerCase();
    if (v === '1' || v === 'true') where.push('cca.is_connected = 1');
    else if (v === '0' || v === 'false') where.push('cca.is_connected = 0');
  }

  if (today_only) {
    where.push('DATE(cca.created_at) = CURDATE()');
  }

  if (started_after) {
    where.push('cca.started_at >= ?');
    params.push(started_after);
  }
  if (started_before) {
    where.push('cca.started_at <= ?');
    params.push(started_before);
  }

  const atIso = activity_timeline_cursor?.startedAtIso;
  const attId = activity_timeline_cursor?.attemptId;
  if (atIso != null && String(atIso).trim() !== '') {
    if (attId != null && Number.isFinite(Number(attId))) {
      where.push('(cca.started_at < ? OR (cca.started_at = ? AND cca.id < ?))');
      params.push(atIso, atIso, Number(attId));
    } else {
      where.push('(cca.started_at < ? OR cca.started_at = ?)');
      params.push(atIso, atIso);
    }
  }

  // Role scoping: agents only their attempts; managers only their team attempts.
  if (user.role === 'agent') {
    where.push('cca.agent_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    where.push('cca.manager_id = ?');
    params.push(user.id);
  }

  if (meaningful_only) {
    where.push(`(
      (cca.disposition_id IS NOT NULL AND TRIM(cca.disposition_id) <> '' AND cca.disposition_id <> '0')
      OR (
        cca.notes IS NOT NULL
        AND TRIM(cca.notes) <> ''
        AND TRIM(cca.notes) NOT REGEXP '^dialer_session:[0-9]+$'
      )
    )`);
  }

  const columnRules = normalizeCallHistoryColumnFilters(column_filters);
  for (const rule of columnRules) {
    pushCallHistoryColumnFilter(where, params, rule);
  }

  return { whereSql: where.join(' AND '), params };
}

/** All matching call attempt ids for current list filters, capped for bulk selection. */
export async function listCallAttemptIds(tenantId, user, filters = {}) {
  const { whereSql, params } = buildCallAttemptsWhere(tenantId, user, filters);
  const [countRow] = await query(
    `SELECT COUNT(DISTINCT cca.id) AS total FROM contact_call_attempts cca ${CALL_ATTEMPTS_STANDARD_JOINS} WHERE ${whereSql}`,
    params
  );
  const total = countRow?.total ?? 0;
  const cap = CALL_ATTEMPT_IDS_CAP;
  const rows = await query(
    `SELECT cca.id
     FROM contact_call_attempts cca
     ${CALL_ATTEMPTS_STANDARD_JOINS}
     WHERE ${whereSql}
     ORDER BY cca.id ASC
     LIMIT ${cap + 1}`,
    params
  );
  const truncated = rows.length > cap;
  const ids = (truncated ? rows.slice(0, cap) : rows).map((r) => r.id);
  return { ids, total, truncated, cap };
}

export async function getCallAttemptMetrics(tenantId, user, filters = {}) {
  const { whereSql, params } = buildCallAttemptsWhere(tenantId, user, filters);

  const [row] = await query(
    `SELECT
        COUNT(DISTINCT cca.id) AS total_calls,
        SUM(CASE WHEN cca.direction = 'outbound' THEN 1 ELSE 0 END) AS outgoing_calls,
        SUM(CASE WHEN cca.direction = 'inbound' THEN 1 ELSE 0 END) AS incoming_calls,
        SUM(CASE WHEN cca.status IN ('failed','cancelled') AND cca.is_connected = 0 THEN 1 ELSE 0 END) AS missed_calls,
        SUM(CASE WHEN cca.is_connected = 1 THEN 1 ELSE 0 END) AS connected_calls,
        SUM(CASE WHEN cca.is_connected = 0 THEN 1 ELSE 0 END) AS not_connected_calls,
        SUM(CASE WHEN DATE(cca.created_at) = CURDATE() THEN 1 ELSE 0 END) AS todays_calls,
        COALESCE(SUM(COALESCE(cca.duration_sec, 0)), 0) AS call_duration_sec,
        COALESCE(AVG(CASE WHEN cca.is_connected = 1 THEN NULLIF(cca.duration_sec, 0) ELSE NULL END), 0) AS avg_call_time_sec,
        SUM(CASE WHEN dt.code = 'callback' THEN 1 ELSE 0 END) AS follow_up_calls,
        SUM(CASE WHEN d.next_action = 'schedule_callback' THEN 1 ELSE 0 END) AS scheduled_calls
     FROM contact_call_attempts cca
     ${CALL_ATTEMPTS_STANDARD_JOINS}
     LEFT JOIN dispo_types_master dt
       ON dt.id = d.dispo_type_id AND dt.is_deleted = 0
     WHERE ${whereSql}`,
    params
  );

  const n = (v) => Number(v ?? 0) || 0;
  return {
    totalCalls: n(row?.total_calls),
    outgoingCalls: n(row?.outgoing_calls),
    incomingCalls: n(row?.incoming_calls),
    missedCalls: n(row?.missed_calls),
    connectedCalls: n(row?.connected_calls),
    notConnectedCalls: n(row?.not_connected_calls),
    todaysCalls: n(row?.todays_calls),
    callDurationSec: n(row?.call_duration_sec),
    averageCallTimeSec: n(row?.avg_call_time_sec),
    followUpCalls: n(row?.follow_up_calls),
    scheduledCalls: n(row?.scheduled_calls),
  };
}

const CALL_EXPORT_MAX_ROWS = 50000;

const CALL_EXPORT_COL_SQL = {
  created_at: 'cca.created_at',
  id: 'cca.id',
  contact: 'c.display_name',
  phone: 'p.phone',
  agent: 'u.name',
  dial_session: `(SELECT CONCAT('Session ', ds.user_session_no, ' · id ', ds.id) FROM dialer_session_items dsi INNER JOIN dialer_sessions ds ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id WHERE dsi.last_attempt_id = cca.id AND dsi.tenant_id = cca.tenant_id ORDER BY dsi.id DESC LIMIT 1)`,
  direction: 'cca.direction',
  status: 'cca.status',
  is_connected: 'cca.is_connected',
  disposition: 'd.name',
  notes: 'cca.notes',
  duration_sec: 'cca.duration_sec',
  started_at: 'cca.started_at',
  ended_at: 'cca.ended_at',
  provider: 'cca.provider',
};

const CALL_EXPORT_HEADERS = {
  created_at: 'When',
  id: 'Attempt id',
  contact: 'Called party',
  phone: 'Phone',
  agent: 'Agent',
  dial_session: 'Dial session',
  direction: 'Direction',
  status: 'Status',
  is_connected: 'Connected',
  disposition: 'Disposition',
  notes: 'Notes',
  duration_sec: 'Duration (sec)',
  started_at: 'Started',
  ended_at: 'Ended',
  provider: 'Provider',
};

function csvEscapeCallExport(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCallExportCell(key, raw) {
  if (raw == null) return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    return raw.toISOString();
  }
  if (key === 'is_connected') {
    if (raw === true || raw === 1 || raw === '1') return 'Yes';
    if (raw === false || raw === 0 || raw === '0') return 'No';
  }
  return String(raw);
}

/**
 * CSV export for call history (same filters as list). Column keys match `callHistoryTableConfig` ids.
 */
export async function exportCallAttemptsCsv(
  tenantId,
  user,
  {
    q,
    contact_id,
    dialer_session_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only = false,
    meaningful_only = true,
    column_filters,
    export_scope = 'filtered',
    selected_ids = [],
    columns = [],
  } = {}
) {
  const keys = (Array.isArray(columns) ? columns : [])
    .map((k) => String(k).trim())
    .filter((k) => Object.prototype.hasOwnProperty.call(CALL_EXPORT_COL_SQL, k));
  if (keys.length === 0) {
    const err = new Error('Choose at least one column to export');
    err.status = 400;
    throw err;
  }

  const filters = {
    q,
    contact_id,
    dialer_session_id,
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only,
    meaningful_only,
    column_filters,
  };

  const { whereSql, params: baseParams } = buildCallAttemptsWhere(tenantId, user, filters);
  const params = [...baseParams];
  let whereFinal = whereSql;

  const scope = String(export_scope || 'filtered').toLowerCase() === 'selected' ? 'selected' : 'filtered';
  if (scope === 'selected') {
    const ids = [...new Set((Array.isArray(selected_ids) ? selected_ids : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(
      0,
      CALL_ATTEMPT_IDS_CAP
    );
    if (ids.length === 0) {
      return '\uFEFF';
    }
    whereFinal += ` AND cca.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  const selectList = keys.map((k) => `${CALL_EXPORT_COL_SQL[k]} AS \`${k}\``).join(', ');
  const sql = `SELECT ${selectList} FROM contact_call_attempts cca ${CALL_ATTEMPTS_STANDARD_JOINS} WHERE ${whereFinal} ORDER BY cca.created_at DESC, cca.id DESC LIMIT ${CALL_EXPORT_MAX_ROWS + 1}`;

  const rows = await query(sql, params);
  const dataRows = rows.length > CALL_EXPORT_MAX_ROWS ? rows.slice(0, CALL_EXPORT_MAX_ROWS) : rows;

  const headerLine = keys.map((k) => csvEscapeCallExport(CALL_EXPORT_HEADERS[k] || k)).join(',');
  const lines = [`\uFEFF${headerLine}`];
  for (const row of dataRows) {
    const cells = keys.map((k) => csvEscapeCallExport(formatCallExportCell(k, row[k])));
    lines.push(cells.join(','));
  }
  return lines.join('\r\n');
}

/**
 * Update call notes only (no disposition change, no dialer queue side effects).
 */
export async function updateAttemptNotesOnly(tenantId, user, attemptId, { notes = null } = {}) {
  const id = Number(attemptId);
  if (!id) {
    const err = new Error('Invalid attempt id');
    err.status = 400;
    throw err;
  }

  const where = ['tenant_id = ?', 'id = ?'];
  const params = [tenantId, id];
  if (user.role === 'agent') {
    where.push('(agent_user_id = ? OR created_by = ?)');
    params.push(user.id, user.id);
  } else if (user.role === 'manager') {
    where.push('(manager_id = ? OR created_by = ?)');
    params.push(user.id, user.id);
  }

  const raw = notes != null ? String(notes).trim() : '';
  // "Save note" appends a new note entry to the attempt. Empty saves are a no-op.
  if (raw) {
    const entryText = raw.slice(0, 2000);
    const entry = `[${new Date().toISOString()}] ${entryText}`;
    const updateResult = await query(
      `UPDATE contact_call_attempts
       SET notes = CASE
         WHEN notes IS NULL OR TRIM(notes) = '' THEN ?
         ELSE CONCAT(notes, '\n\n', ?)
       END
       WHERE ${where.join(' AND ')}`,
      [entry, entry, ...params]
    );
    const affected = Number(updateResult?.affectedRows ?? 0);
    if (affected === 0) {
      const err = new Error('Call attempt not found or you do not have access');
      err.status = 404;
      throw err;
    }
  } else {
    // Verify the attempt exists and is in scope (avoid misleading "saved" toasts).
    const [probe] = await query(
      `SELECT id FROM contact_call_attempts WHERE ${where.join(' AND ')} LIMIT 1`,
      params
    );
    if (!probe) {
      const err = new Error('Call attempt not found or you do not have access');
      err.status = 404;
      throw err;
    }
  }

  const [row] = await query(
    `SELECT id, contact_id, disposition_id, notes FROM contact_call_attempts WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id]
  );
  return row;
}

export async function setAttemptDisposition(
  tenantId,
  user,
  attemptId,
  body = {}
) {
  const id = Number(attemptId);
  if (!id) {
    const err = new Error('Invalid attempt id');
    err.status = 400;
    throw err;
  }

  const {
    disposition_id = null,
    notes: notesFromBody,
    deal_id: bodyDealId,
    stage_id: bodyStageId,
  } = body;

  // Only update attempts within scope (agents: their own; managers: their team; admin: any tenant).
  // Managers who dial often have contacts with NULL or stale manager_id; startCallForContact always sets created_by to the dialing user.
  const where = ['tenant_id = ?', 'id = ?'];
  const params = [tenantId, id];
  if (user.role === 'agent') {
    where.push('(agent_user_id = ? OR created_by = ?)');
    params.push(user.id, user.id);
  } else if (user.role === 'manager') {
    where.push('(manager_id = ? OR created_by = ?)');
    params.push(user.id, user.id);
  }

  const dispNormalized =
    disposition_id !== undefined && disposition_id !== null ? String(disposition_id).trim() : '';
  if (dispNormalized.length > 36) {
    const err = new Error('Invalid disposition id');
    err.status = 400;
    throw err;
  }
  const dispForDb = dispNormalized.length > 0 ? dispNormalized : null;

  let applyMeta = null;
  if (dispForDb) {
    applyMeta = await loadDispositionCallApplyMeta(tenantId, dispForDb);
    if (!applyMeta) {
      const err = new Error('Disposition not found');
      err.status = 400;
      throw err;
    }
  }

  // Do not overwrite notes with null when the dialer sends an empty textarea after "Save notes"
  // (notes were already stored via PATCH). Only set `notes` when non-empty, or when `clear_notes`
  // is explicit (e.g. Activities row editor).
  const clearNotes =
    body.clear_notes === true || String(body.clear_notes || '').toLowerCase() === 'true';
  let updateNotesColumn = false;
  let notesVal = null;
  if (clearNotes) {
    updateNotesColumn = true;
    notesVal = null;
  } else if (notesFromBody !== undefined && notesFromBody !== null) {
    const t = String(notesFromBody).trim();
    if (t.length > 0) {
      updateNotesColumn = true;
      const entryText = t.slice(0, 2000);
      notesVal = `[${new Date().toISOString()}] ${entryText}`;
    }
  }

  const updateResult = updateNotesColumn
    ? await query(
        `UPDATE contact_call_attempts
         SET disposition_id = ?, notes = ${
           notesVal === null
             ? '?'
             : `CASE
                  WHEN notes IS NULL OR TRIM(notes) = '' THEN ?
                  ELSE CONCAT(notes, '\n\n', ?)
                END`
         }
         WHERE ${where.join(' AND ')}`,
        notesVal === null
          ? [dispForDb, null, ...params]
          : [dispForDb, notesVal, notesVal, ...params]
      )
    : await query(
        `UPDATE contact_call_attempts
         SET disposition_id = ?
         WHERE ${where.join(' AND ')}`,
        [dispForDb, ...params]
      );

  const affected = Number(updateResult?.affectedRows ?? 0);
  if (affected === 0) {
    const err = new Error('Call attempt not found or you do not have access to set its disposition');
    err.status = 404;
    throw err;
  }

  const [row] = await query(
    `SELECT id, contact_id, disposition_id, notes FROM contact_call_attempts WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id]
  );

  // Only advance the dialer queue when a real disposition was chosen. Tenant dispositions
  // use UUID strings (CHAR(36)); do not use Number() here — Number(uuid) is NaN and would
  // skip this update forever.
  // `next_number` is handled in dialerSessionsService.handleNextNumberDisposition (called from
  // the calls controller) so we can pick the next line or complete the lead and auto-dial.
  let next_action = null;
  if (dispForDb && applyMeta) {
    const na = String(applyMeta.next_action || '').trim().toLowerCase();
    next_action = na || null;
    if (na !== 'next_number') {
      await query(
        `UPDATE dialer_session_items
         SET state = 'called', called_at = NOW()
         WHERE tenant_id = ? AND last_attempt_id = ? AND state = 'calling'`,
        [tenantId, id]
      );
    }

    if (row?.contact_id) {
      let oppDealId = null;
      let oppStageId = null;
      if (applyMeta.requires_deal_selection) {
        const bd =
          bodyDealId !== undefined && bodyDealId !== null && bodyDealId !== ''
            ? Number(bodyDealId)
            : null;
        const bs =
          bodyStageId !== undefined && bodyStageId !== null && bodyStageId !== ''
            ? Number(bodyStageId)
            : null;
        if (bd && bs && Number.isFinite(bd) && Number.isFinite(bs)) {
          oppDealId = bd;
          oppStageId = bs;
        }
      } else if (applyMeta.legacy_deal_id != null && applyMeta.legacy_stage_id != null) {
        oppDealId = applyMeta.legacy_deal_id;
        oppStageId = applyMeta.legacy_stage_id;
      }
      if (
        oppDealId &&
        oppStageId &&
        Number.isFinite(oppDealId) &&
        Number.isFinite(oppStageId)
      ) {
        try {
          await opportunitiesService.applyOpportunityFromDisposition(
            tenantId,
            user,
            row.contact_id,
            oppDealId,
            oppStageId
          );
        } catch (oppErr) {
          console.error('applyOpportunityFromDisposition:', oppErr?.message || oppErr);
        }
      }
    }
  }

  return { attempt: row || null, next_action };
}

