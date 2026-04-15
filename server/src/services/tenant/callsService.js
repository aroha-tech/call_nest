import { query } from '../../config/db.js';
import { getTelephonyProvider } from './telephony/telephonyProviderRegistry.js';
import * as opportunitiesService from './opportunitiesService.js';
import { loadDispositionCallApplyMeta } from './dispositionApplyDealHelper.js';

const CALL_ATTEMPT_IDS_CAP = 5000;

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
  { contact_id, contact_phone_id = null, provider = 'dummy', notes = null } = {}
) {
  const cid = Number(contact_id);
  if (!cid) {
    const err = new Error('contact_id is required');
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      cid,
      chosenPhoneId,
      user.role === 'agent' ? user.id : row.assigned_user_id ?? null,
      row.manager_id ?? null,
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
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only = false,
    /** Omit rows that only exist from starting a dial (no disposition and no agent-visible notes). */
    meaningful_only = false,
    sort_by,
    sort_dir,
  } = {}
) {
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

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = ['cca.tenant_id = ?'];
  const params = [tenantId];

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

  // Scope to contact if provided
  if (contact_id) {
    where.push('cca.contact_id = ?');
    params.push(Number(contact_id));
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

  // Role scoping: agents only their attempts; managers only their team attempts.
  if (user.role === 'agent') {
    where.push('cca.agent_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    where.push('cca.manager_id = ?');
    params.push(user.id);
  }

  if (meaningful_only) {
    // disposition_id is CHAR(36) UUID — never use `> 0` (MySQL casts UUID to 0 and drops every row).
    where.push(`(
      (cca.disposition_id IS NOT NULL AND TRIM(cca.disposition_id) <> '' AND cca.disposition_id <> '0')
      OR (
        cca.notes IS NOT NULL
        AND TRIM(cca.notes) <> ''
        AND TRIM(cca.notes) NOT REGEXP '^dialer_session:[0-9]+$'
      )
    )`);
  }

  const whereSql = where.join(' AND ');
  const [countRow] = await query(`SELECT COUNT(*) AS total FROM contact_call_attempts cca WHERE ${whereSql}`, params);
  const total = countRow?.total ?? 0;

  const sortKey = String(sort_by || '').trim();
  const sortDir = String(sort_dir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderMap = {
    created_at: 'cca.created_at',
    id: 'cca.id',
    contact_id: 'cca.contact_id',
    phone: 'p.phone',
    agent: 'u.name',
    direction: 'cca.direction',
    status: 'cca.status',
    is_connected: 'cca.is_connected',
    disposition: 'd.name',
  };
  const orderCol = orderMap[sortKey] || 'cca.created_at';
  const orderSql = `ORDER BY ${orderCol} ${sortDir}, cca.id DESC`;

   const rows = await query(
    `SELECT
        cca.id,
        cca.contact_id,
        cca.contact_phone_id,
        cca.agent_user_id,
        cca.manager_id,
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
        d.name AS disposition_name
     FROM contact_call_attempts cca
     LEFT JOIN contacts c ON c.id = cca.contact_id AND c.tenant_id = cca.tenant_id
     LEFT JOIN contact_phones p ON p.id = cca.contact_phone_id AND p.tenant_id = cca.tenant_id
     LEFT JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id
     LEFT JOIN dispositions d
       ON d.id = cca.disposition_id AND d.tenant_id = cca.tenant_id AND d.is_deleted = 0
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
    disposition_id,
    agent_user_id,
    direction,
    status,
    is_connected,
    started_after,
    started_before,
    today_only = false,
    meaningful_only = false,
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

  return { whereSql: where.join(' AND '), params };
}

/** All matching call attempt ids for current list filters, capped for bulk selection. */
export async function listCallAttemptIds(tenantId, user, filters = {}) {
  const { whereSql, params } = buildCallAttemptsWhere(tenantId, user, filters);
  const [countRow] = await query(`SELECT COUNT(*) AS total FROM contact_call_attempts cca WHERE ${whereSql}`, params);
  const total = countRow?.total ?? 0;
  const cap = CALL_ATTEMPT_IDS_CAP;
  const rows = await query(
    `SELECT cca.id
     FROM contact_call_attempts cca
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
        COUNT(*) AS total_calls,
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
     LEFT JOIN dispositions d
       ON d.id = cca.disposition_id AND d.tenant_id = cca.tenant_id AND d.is_deleted = 0
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

