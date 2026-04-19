import { query } from '../../config/db.js';
import { getCreatedByUserIdsForScope } from './userMessageScopeService.js';

const NEAR_WINDOW_MINUTES = 120;

function clampInt(v, { min = 1, max = 100, fallback = 20 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function trimStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function parseCsvList(v) {
  const t = trimStr(v);
  if (!t) return [];
  return t
    .split(',')
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function timeFlagSql(flag, { column, openClauseSql }) {
  const f = String(flag || '').trim().toLowerCase();
  if (!f || f === 'all') return { clause: '', params: [] };
  if (f === 'today') {
    return { clause: ` AND DATE(${column}) = CURDATE() `, params: [] };
  }
  if (f === 'missed') {
    return { clause: ` AND ${column} < NOW() ${openClauseSql ? ` AND (${openClauseSql}) ` : ''} `, params: [] };
  }
  if (f === 'near') {
    return {
      clause: ` AND ${column} >= NOW() AND ${column} < DATE_ADD(NOW(), INTERVAL ${NEAR_WINDOW_MINUTES} MINUTE) ${
        openClauseSql ? ` AND (${openClauseSql}) ` : ''
      } `,
      params: [],
    };
  }
  if (f === 'upcoming') {
    return {
      clause: ` AND ${column} >= DATE_ADD(NOW(), INTERVAL ${NEAR_WINDOW_MINUTES} MINUTE) ${
        openClauseSql ? ` AND (${openClauseSql}) ` : ''
      } `,
      params: [],
    };
  }
  return { clause: '', params: [] };
}

function normalizeYmd(v) {
  const t = String(v || '').trim();
  if (!t) return null;
  // Expect YYYY-MM-DD (from date input). Keep as-is; DB will parse.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function rangeToSql(fromYmd, toYmd, { column = 'scheduled_at' } = {}) {
  const from = normalizeYmd(fromYmd);
  const to = normalizeYmd(toYmd);
  if (!from || !to) return { clause: '', params: [] };
  // Inclusive calendar range: [from 00:00:00, to + 1 day 00:00:00)
  return {
    clause: ` AND ${column} >= CONCAT(?, ' 00:00:00') AND ${column} < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY) `,
    params: [from, to],
  };
}

async function getAssignedUserIdsForScope(tenantId, actingUser) {
  // Reuse outbound-message scope semantics: admin = all, manager = self + team agents, agent = self.
  return getCreatedByUserIdsForScope(tenantId, actingUser);
}

function enforceRequestedUserIdInScope(requestedUserId, scopedIds) {
  if (!requestedUserId) return { requested: null, effectiveIds: scopedIds };
  const id = Number(requestedUserId);
  if (!Number.isFinite(id) || id <= 0) return { requested: null, effectiveIds: scopedIds };
  if (scopedIds == null) return { requested: id, effectiveIds: null }; // admin: allow any tenant user
  if (scopedIds.includes(id)) return { requested: id, effectiveIds: [id] };
  // Out of scope: treat as no results (avoid leaking existence).
  return { requested: id, effectiveIds: [] };
}

export async function listTeamMembersInScope(tenantId, actingUser) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const params = [tenantId];
  let where = 'WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0';
  if (scopedIds != null) {
    if (!scopedIds.length) return [];
    where += ` AND id IN (${scopedIds.map(() => '?').join(',')})`;
    params.push(...scopedIds);
  }
  const rows = await query(
    `SELECT id, name, email, role
     FROM users
     ${where}
     ORDER BY COALESCE(name, email) ASC, id ASC`,
    params
  );
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role }));
}

export async function getSummaryByPerson(tenantId, actingUser, { from, to, assigned_user_id } = {}) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const { effectiveIds } = enforceRequestedUserIdInScope(assigned_user_id, scopedIds);
  if (effectiveIds && effectiveIds.length === 0) return [];

  const drMeetings = rangeToSql(from, to, { column: 'm.start_at' });
  const drCallbacks = rangeToSql(from, to, { column: 'sc.scheduled_at' });
  const drCalls = rangeToSql(from, to, { column: 'COALESCE(cca.started_at, cca.created_at)' });

  const meetingScopeClause =
    effectiveIds == null
      ? ''
      : ` AND m.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const callbackScopeClause =
    effectiveIds == null
      ? ''
      : ` AND sc.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const callScopeClause =
    effectiveIds == null
      ? ''
      : ` AND cca.agent_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;

  const scopeParams = effectiveIds == null ? [] : effectiveIds;

  const meetingAggPromise = query(
    `SELECT
        COALESCE(m.assigned_user_id, m.created_by) AS user_id,
        SUM(CASE WHEN m.meeting_status IN ('scheduled','rescheduled') THEN 1 ELSE 0 END) AS meetings_open,
        SUM(CASE WHEN m.meeting_status = 'completed' THEN 1 ELSE 0 END) AS meetings_done,
        SUM(CASE WHEN m.attendance_status = 'no_show' THEN 1 ELSE 0 END) AS meetings_no_show
     FROM tenant_meetings m
     WHERE m.tenant_id = ? AND m.deleted_at IS NULL
       ${drMeetings.clause}
       ${meetingScopeClause}
     GROUP BY user_id`,
    [tenantId, ...drMeetings.params, ...scopeParams]
  );

  const callbackAggPromise = query(
    `SELECT
        sc.assigned_user_id AS user_id,
        SUM(CASE WHEN sc.status = 'pending' THEN 1 ELSE 0 END) AS callbacks_pending,
        SUM(CASE WHEN sc.status = 'completed' THEN 1 ELSE 0 END) AS callbacks_done
     FROM scheduled_callbacks sc
     WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL
       ${drCallbacks.clause}
       ${callbackScopeClause}
     GROUP BY user_id`,
    [tenantId, ...drCallbacks.params, ...scopeParams]
  );

  const callsAggPromise = query(
    `SELECT
        cca.agent_user_id AS user_id,
        COUNT(*) AS dial_attempts,
        SUM(CASE WHEN cca.is_connected = 1 THEN 1 ELSE 0 END) AS connected
     FROM contact_call_attempts cca
     WHERE cca.tenant_id = ?
       ${drCalls.clause}
       ${callScopeClause}
     GROUP BY user_id`,
    [tenantId, ...drCalls.params, ...scopeParams]
  );

  const [meetingAgg, callbackAgg, callsAgg] = await Promise.all([
    meetingAggPromise,
    callbackAggPromise,
    callsAggPromise,
  ]);

  const map = new Map();
  const put = (userId, patch) => {
    const k = String(userId);
    map.set(k, { user_id: Number(userId), ...map.get(k), ...patch });
  };

  for (const r of meetingAgg) {
    put(r.user_id, {
      meetings_open: Number(r.meetings_open || 0),
      meetings_done: Number(r.meetings_done || 0),
      meetings_no_show: Number(r.meetings_no_show || 0),
    });
  }
  for (const r of callbackAgg) {
    put(r.user_id, {
      callbacks_pending: Number(r.callbacks_pending || 0),
      callbacks_done: Number(r.callbacks_done || 0),
    });
  }
  for (const r of callsAgg) {
    put(r.user_id, {
      dial_attempts: Number(r.dial_attempts || 0),
      connected: Number(r.connected || 0),
    });
  }

  const userIds = Array.from(map.values())
    .map((r) => r.user_id)
    .filter((x) => Number.isFinite(Number(x)));
  if (!userIds.length) return [];

  const userRows = await query(
    `SELECT id, name, email
     FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0
       AND id IN (${userIds.map(() => '?').join(',')})
     ORDER BY COALESCE(name, email) ASC`,
    [tenantId, ...userIds]
  );
  const userMap = new Map(userRows.map((u) => [String(u.id), u]));

  return Array.from(map.values())
    .map((r) => {
      const u = userMap.get(String(r.user_id));
      return {
        user_id: r.user_id,
        person: u?.name || u?.email || `User ${r.user_id}`,
        meetings_open: Number(r.meetings_open || 0),
        meetings_done: Number(r.meetings_done || 0),
        meetings_no_show: Number(r.meetings_no_show || 0),
        callbacks_pending: Number(r.callbacks_pending || 0),
        callbacks_done: Number(r.callbacks_done || 0),
        dial_attempts: Number(r.dial_attempts || 0),
        connected: Number(r.connected || 0),
      };
    })
    .sort((a, b) => String(a.person).localeCompare(String(b.person)));
}

export async function listMeetingsPaged(
  tenantId,
  actingUser,
  { from, to, assigned_user_id, page = 1, limit = 20, status = null, q = null, time_flag = null } = {}
) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const { effectiveIds } = enforceRequestedUserIdInScope(assigned_user_id, scopedIds);
  if (effectiveIds && effectiveIds.length === 0) {
    return { rows: [], total: 0, page: 1, limit: clampInt(limit), totalPages: 1 };
  }

  const lim = clampInt(limit, { min: 1, max: 100, fallback: 20 });
  const pg = clampInt(page, { min: 1, max: 100000, fallback: 1 });
  const offset = (pg - 1) * lim;

  const dr = rangeToSql(from, to, { column: 'm.start_at' });
  const scopeClause =
    effectiveIds == null ? '' : ` AND m.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const scopeParams = effectiveIds == null ? [] : effectiveIds;

  const statusList = parseCsvList(status);
  const statusClause = statusList.length ? ` AND m.meeting_status IN (${statusList.map(() => '?').join(',')}) ` : '';
  const qq = trimStr(q);
  const qClause = qq
    ? ' AND (m.title LIKE ? OR m.attendee_email LIKE ? OR m.location LIKE ? OR c.display_name LIKE ?) '
    : '';
  const qParams = qq ? Array(4).fill(`%${qq}%`) : [];
  const openMeetingClause = "m.meeting_status IN ('scheduled','rescheduled')";
  const tf = timeFlagSql(time_flag, { column: 'm.start_at', openClauseSql: openMeetingClause });

  const countSql = `
    SELECT COUNT(*) AS c
    FROM tenant_meetings m
    LEFT JOIN contacts c
      ON c.id = m.contact_id AND c.tenant_id = m.tenant_id AND c.deleted_at IS NULL
    WHERE m.tenant_id = ? AND m.deleted_at IS NULL
      ${dr.clause}
      ${scopeClause}
      ${statusClause}
      ${qClause}
      ${tf.clause}
  `;
  const [countRow] = await query(countSql, [
    tenantId,
    ...dr.params,
    ...scopeParams,
    ...statusList,
    ...qParams,
  ]);
  const total = Number(countRow?.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / lim) || 1);

  const limInt = Math.min(100, Math.max(1, Math.floor(Number(lim) || 20)));
  const offsetInt = Math.max(0, Math.floor(Number(offset) || 0));

  const sql = `
    SELECT
      m.id,
      m.contact_id,
      c.type AS contact_type,
      c.display_name AS contact_name,
      m.assigned_user_id,
      u.name AS assigned_name,
      u.email AS assigned_email,
      m.title,
      m.start_at,
      m.end_at,
      m.meeting_status,
      m.attendance_status,
      m.location,
      m.attendee_email
    FROM tenant_meetings m
    LEFT JOIN contacts c
      ON c.id = m.contact_id AND c.tenant_id = m.tenant_id AND c.deleted_at IS NULL
    LEFT JOIN users u
      ON u.id = m.assigned_user_id AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
    WHERE m.tenant_id = ? AND m.deleted_at IS NULL
      ${dr.clause}
      ${scopeClause}
      ${statusClause}
      ${qClause}
      ${tf.clause}
    ORDER BY m.start_at ASC, m.id ASC
    LIMIT ${limInt} OFFSET ${offsetInt}
  `;

  const rows = await query(sql, [tenantId, ...dr.params, ...scopeParams, ...statusList, ...qParams]);
  return { rows, total, page: pg, limit: lim, totalPages };
}

export async function listCallbacksPaged(
  tenantId,
  actingUser,
  { from, to, assigned_user_id, page = 1, limit = 20, status = null, q = null, time_flag = null } = {}
) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const { effectiveIds } = enforceRequestedUserIdInScope(assigned_user_id, scopedIds);
  if (effectiveIds && effectiveIds.length === 0) {
    return { rows: [], total: 0, page: 1, limit: clampInt(limit), totalPages: 1 };
  }

  const lim = clampInt(limit, { min: 1, max: 100, fallback: 20 });
  const pg = clampInt(page, { min: 1, max: 100000, fallback: 1 });
  const offset = (pg - 1) * lim;

  const dr = rangeToSql(from, to, { column: 'sc.scheduled_at' });
  const scopeClause =
    effectiveIds == null ? '' : ` AND sc.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const scopeParams = effectiveIds == null ? [] : effectiveIds;

  const statusList = parseCsvList(status);
  const statusClause = statusList.length ? ` AND sc.status IN (${statusList.map(() => '?').join(',')}) ` : '';
  const qq = trimStr(q);
  const qClause = qq
    ? ' AND (c.display_name LIKE ? OR cp.phone LIKE ? OR sc.notes LIKE ? OR sc.outcome_notes LIKE ?) '
    : '';
  const qParams = qq ? Array(4).fill(`%${qq}%`) : [];
  const openCallbackClause = "sc.status = 'pending'";
  const tf = timeFlagSql(time_flag, { column: 'sc.scheduled_at', openClauseSql: openCallbackClause });

  const countSql = `
    SELECT COUNT(*) AS c
    FROM scheduled_callbacks sc
    INNER JOIN contacts c
      ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
    LEFT JOIN contact_phones cp
      ON cp.id = sc.contact_phone_id AND cp.tenant_id = sc.tenant_id
    WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL
      ${dr.clause}
      ${scopeClause}
      ${statusClause}
      ${qClause}
      ${tf.clause}
  `;
  const [countRow] = await query(countSql, [
    tenantId,
    ...dr.params,
    ...scopeParams,
    ...statusList,
    ...qParams,
  ]);
  const total = Number(countRow?.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / lim) || 1);

  const limInt = Math.min(100, Math.max(1, Math.floor(Number(lim) || 20)));
  const offsetInt = Math.max(0, Math.floor(Number(offset) || 0));

  const sql = `
    SELECT
      sc.id,
      sc.contact_id,
      c.type AS contact_type,
      c.display_name AS contact_name,
      cp.phone AS contact_phone,
      sc.assigned_user_id,
      u.name AS assigned_name,
      u.email AS assigned_email,
      sc.scheduled_at,
      sc.status,
      sc.notes,
      sc.outcome_notes,
      sc.completed_at
    FROM scheduled_callbacks sc
    INNER JOIN contacts c
      ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
    LEFT JOIN contact_phones cp
      ON cp.id = sc.contact_phone_id AND cp.tenant_id = sc.tenant_id
    LEFT JOIN users u
      ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
    WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL
      ${dr.clause}
      ${scopeClause}
      ${statusClause}
      ${qClause}
      ${tf.clause}
    ORDER BY sc.scheduled_at ASC, sc.id ASC
    LIMIT ${limInt} OFFSET ${offsetInt}
  `;
  const rows = await query(sql, [tenantId, ...dr.params, ...scopeParams, ...statusList, ...qParams]);
  return { rows, total, page: pg, limit: lim, totalPages };
}

export async function listCallbacksInRange(
  tenantId,
  actingUser,
  { from, to, assigned_user_id, status = null } = {}
) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const { effectiveIds } = enforceRequestedUserIdInScope(assigned_user_id, scopedIds);
  if (effectiveIds && effectiveIds.length === 0) return [];

  const dr = rangeToSql(from, to, { column: 'sc.scheduled_at' });
  const scopeClause =
    effectiveIds == null ? '' : ` AND sc.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const scopeParams = effectiveIds == null ? [] : effectiveIds;

  const statusList = parseCsvList(status);
  const statusClause = statusList.length ? ` AND sc.status IN (${statusList.map(() => '?').join(',')}) ` : '';

  const sql = `
    SELECT
      sc.id,
      sc.contact_id,
      c.type AS contact_type,
      c.display_name AS contact_name,
      cp.phone AS contact_phone,
      sc.assigned_user_id,
      u.name AS assigned_name,
      u.email AS assigned_email,
      sc.scheduled_at,
      sc.status,
      sc.notes,
      sc.outcome_notes,
      sc.completed_at
    FROM scheduled_callbacks sc
    INNER JOIN contacts c
      ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
    LEFT JOIN contact_phones cp
      ON cp.id = sc.contact_phone_id AND cp.tenant_id = sc.tenant_id
    LEFT JOIN users u
      ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
    WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL
      ${dr.clause}
      ${scopeClause}
      ${statusClause}
    ORDER BY sc.scheduled_at ASC, sc.id ASC
  `;
  return query(sql, [tenantId, ...dr.params, ...scopeParams, ...statusList]);
}

