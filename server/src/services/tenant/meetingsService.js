import { query } from '../../config/db.js';
import { trySendMeetingAttendeeEmail } from './meetingNotifyService.js';

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

async function assertEmailAccount(tenantId, emailAccountId) {
  const id = Number(emailAccountId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid email account');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id FROM email_accounts
     WHERE tenant_id = ? AND id = ? AND is_deleted = 0
     LIMIT 1`,
    [tenantId, id]
  );
  if (!row) {
    const err = new Error('Email account not found');
    err.status = 400;
    throw err;
  }
  return id;
}

async function assertContactOptional(tenantId, contactId) {
  if (contactId == null || contactId === '') return null;
  const cid = Number(contactId);
  if (!Number.isFinite(cid)) return null;
  const [row] = await query(
    `SELECT id FROM contacts WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, cid]
  );
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 400;
    throw err;
  }
  return cid;
}

async function assertUserOptional(tenantId, userId) {
  if (userId == null || userId === '') return null;
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;
  const [row] = await query(
    `SELECT id FROM users WHERE tenant_id = ? AND id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
    [tenantId, uid]
  );
  if (!row) {
    const err = new Error('User not found');
    err.status = 400;
    throw err;
  }
  return uid;
}

/**
 * @param {number} tenantId
 * @param {{ email_account_id?: number|string|null, from?: string, to?: string }} filters
 */
export async function listInRange(tenantId, { email_account_id = null, from = null, to = null } = {}) {
  const rangeFrom = from && String(from).trim() ? String(from).trim() : null;
  const rangeTo = to && String(to).trim() ? String(to).trim() : null;

  let sql2 = `
    SELECT
      m.id,
      m.tenant_id,
      m.contact_id,
      m.assigned_user_id,
      m.email_account_id,
      m.title,
      m.description,
      m.location,
      m.attendee_email,
      m.start_at,
      m.end_at,
      m.meeting_status,
      m.attendance_status,
      m.created_at,
      m.updated_at,
      ea.email_address AS account_email,
      COALESCE(ea.account_name, ea.email_address) AS account_label
    FROM tenant_meetings m
    INNER JOIN email_accounts ea
      ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id AND ea.is_deleted = 0
    WHERE m.tenant_id = ? AND m.deleted_at IS NULL
  `;
  const p2 = [tenantId];
  if (email_account_id != null && email_account_id !== '') {
    const eid = Number(email_account_id);
    if (Number.isFinite(eid)) {
      sql2 += ' AND m.email_account_id = ?';
      p2.push(eid);
    }
  }
  if (rangeFrom && rangeTo) {
    sql2 += ' AND m.start_at < ? AND m.end_at > ?';
    p2.push(rangeTo, rangeFrom);
  } else if (rangeFrom) {
    sql2 += ' AND m.end_at > ?';
    p2.push(rangeFrom);
  } else if (rangeTo) {
    sql2 += ' AND m.start_at < ?';
    p2.push(rangeTo);
  }
  sql2 += ' ORDER BY m.start_at ASC, m.id ASC';

  return query(sql2, p2);
}

const LIST_SELECT = `
    SELECT
      m.id,
      m.tenant_id,
      m.contact_id,
      m.assigned_user_id,
      m.email_account_id,
      m.title,
      m.description,
      m.location,
      m.attendee_email,
      m.start_at,
      m.end_at,
      m.meeting_status,
      m.attendance_status,
      m.created_at,
      m.updated_at,
      ea.email_address AS account_email,
      COALESCE(ea.account_name, ea.email_address) AS account_label
    FROM tenant_meetings m
    INNER JOIN email_accounts ea
      ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id AND ea.is_deleted = 0
`;

/**
 * Paginated list with optional search (title, attendee, location, description).
 * @param {number} tenantId
 * @param {{ email_account_id?: number|string|null, search?: string|null, page?: number, limit?: number }} opts
 */
export async function listPaged(tenantId, { email_account_id = null, search = null, page = 1, limit = 20 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const offset = (pg - 1) * lim;

  let where = 'WHERE m.tenant_id = ? AND m.deleted_at IS NULL';
  const params = [tenantId];
  if (email_account_id != null && email_account_id !== '') {
    const eid = Number(email_account_id);
    if (Number.isFinite(eid)) {
      where += ' AND m.email_account_id = ?';
      params.push(eid);
    }
  }
  const q = search && String(search).trim() ? String(search).trim() : '';
  if (q) {
    const like = `%${q}%`;
    where += ' AND (m.title LIKE ? OR m.attendee_email LIKE ? OR m.location LIKE ? OR m.description LIKE ?)';
    params.push(like, like, like, like);
  }

  const countSql = `
    SELECT COUNT(*) AS c
    FROM tenant_meetings m
    INNER JOIN email_accounts ea
      ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id AND ea.is_deleted = 0
    ${where}`;
  const [countRow] = await query(countSql, params);
  const total = Number(countRow?.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / lim));

  // Inline LIMIT/OFFSET: some MySQL builds reject bound parameters for LIMIT in prepared statements (ER_WRONG_ARGUMENTS).
  const limInt = Math.min(100, Math.max(1, Math.floor(Number(lim) || 20)));
  const offsetInt = Math.max(0, Math.floor(Number(offset) || 0));
  const sql = `${LIST_SELECT} ${where} ORDER BY m.start_at DESC, m.id DESC LIMIT ${limInt} OFFSET ${offsetInt}`;
  const rows = await query(sql, params);

  return {
    rows,
    total,
    page: pg,
    limit: lim,
    totalPages,
  };
}

/**
 * Dashboard metrics (7 buckets).
 * @param {number} tenantId
 * @param {{ email_account_id?: number|string|null }} [filters]
 */
export async function getMetrics(tenantId, { email_account_id = null } = {}) {
  const params = [tenantId];
  let accountClause = '';
  if (email_account_id != null && email_account_id !== '') {
    const eid = Number(email_account_id);
    if (Number.isFinite(eid)) {
      accountClause = ' AND m.email_account_id = ?';
      params.push(eid);
    }
  }

  const [row] = await query(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN m.meeting_status = 'scheduled' AND m.start_at >= NOW() THEN 1 ELSE 0 END) AS scheduled,
        SUM(CASE
              WHEN m.meeting_status IN ('scheduled', 'rescheduled') AND m.start_at > NOW()
              THEN 1 ELSE 0
            END) AS upcoming,
        SUM(CASE
              WHEN m.meeting_status IN ('scheduled', 'rescheduled') AND m.start_at < NOW()
              THEN 1 ELSE 0
            END) AS missed,
        SUM(CASE WHEN m.meeting_status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN m.meeting_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN m.meeting_status = 'rescheduled' THEN 1 ELSE 0 END) AS rescheduled,
        SUM(CASE WHEN DATE(m.start_at) = CURDATE() THEN 1 ELSE 0 END) AS today
     FROM tenant_meetings m
     WHERE m.tenant_id = ? AND m.deleted_at IS NULL${accountClause}`,
    params
  );

  const n = (v) => Number(v ?? 0) || 0;
  return {
    total: n(row?.total),
    scheduled: n(row?.scheduled),
    upcoming: n(row?.upcoming),
    missed: n(row?.missed),
    completed: n(row?.completed),
    cancelled: n(row?.cancelled),
    rescheduled: n(row?.rescheduled),
    today: n(row?.today),
  };
}

export async function findById(tenantId, id) {
  const mid = Number(id);
  if (!Number.isFinite(mid)) return null;
  const [row] = await query(
    `SELECT
        m.*,
        ea.email_address AS account_email,
        COALESCE(ea.account_name, ea.email_address) AS account_label
     FROM tenant_meetings m
     INNER JOIN email_accounts ea
       ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id AND ea.is_deleted = 0
     WHERE m.tenant_id = ? AND m.id = ? AND m.deleted_at IS NULL`,
    [tenantId, mid]
  );
  return row || null;
}

export async function create(tenantId, userId, payload) {
  const email_account_id = await assertEmailAccount(tenantId, payload.email_account_id);
  const title = trimStr(payload.title);
  if (!title) {
    const err = new Error('title is required');
    err.status = 400;
    throw err;
  }
  const start_at = trimStr(payload.start_at);
  const end_at = trimStr(payload.end_at);
  if (!start_at || !end_at) {
    const err = new Error('start_at and end_at are required');
    err.status = 400;
    throw err;
  }
  if (String(start_at) >= String(end_at)) {
    const err = new Error('end_at must be after start_at');
    err.status = 400;
    throw err;
  }

  const status = trimStr(payload.meeting_status) || 'scheduled';
  const allowed = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
  if (!allowed.includes(status)) {
    const err = new Error('Invalid meeting_status');
    err.status = 400;
    throw err;
  }

  const contact_id = await assertContactOptional(tenantId, payload.contact_id);
  const assigned_user_id = await assertUserOptional(tenantId, payload.assigned_user_id);
  const attendanceRaw = trimStr(payload.attendance_status) || 'unknown';
  const attAllowed = ['unknown', 'attended', 'no_show', 'cancelled'];
  if (!attAllowed.includes(attendanceRaw)) {
    const err = new Error('Invalid attendance_status');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO tenant_meetings
      (tenant_id, contact_id, assigned_user_id, email_account_id, title, description, location, attendee_email,
       start_at, end_at, meeting_status, attendance_status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      contact_id,
      assigned_user_id,
      email_account_id,
      title,
      trimStr(payload.description),
      trimStr(payload.location),
      trimStr(payload.attendee_email),
      start_at,
      end_at,
      status,
      attendanceRaw,
      userId ?? null,
      userId ?? null,
    ]
  );
  const row = await findById(tenantId, result.insertId);
  const notifyKind = row?.meeting_status === 'cancelled' ? 'cancelled' : 'created';
  void trySendMeetingAttendeeEmail(tenantId, userId, row, notifyKind);
  return row;
}

export async function update(tenantId, userId, id, payload) {
  const existing = await findById(tenantId, id);
  if (!existing) {
    const err = new Error('Meeting not found');
    err.status = 404;
    throw err;
  }

  let email_account_id = existing.email_account_id;
  if (payload.email_account_id !== undefined) {
    email_account_id = await assertEmailAccount(tenantId, payload.email_account_id);
  }

  const updates = [];
  const params = [];

  if (payload.title !== undefined) {
    const t = trimStr(payload.title);
    if (!t) {
      const err = new Error('title cannot be empty');
      err.status = 400;
      throw err;
    }
    updates.push('title = ?');
    params.push(t);
  }
  if (payload.description !== undefined) {
    updates.push('description = ?');
    params.push(trimStr(payload.description));
  }
  if (payload.location !== undefined) {
    updates.push('location = ?');
    params.push(trimStr(payload.location));
  }
  if (payload.attendee_email !== undefined) {
    updates.push('attendee_email = ?');
    params.push(trimStr(payload.attendee_email));
  }
  if (payload.start_at !== undefined) {
    updates.push('start_at = ?');
    params.push(trimStr(payload.start_at));
  }
  if (payload.end_at !== undefined) {
    updates.push('end_at = ?');
    params.push(trimStr(payload.end_at));
  }
  if (payload.meeting_status !== undefined) {
    const s = trimStr(payload.meeting_status);
    const allowed = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
    if (!s || !allowed.includes(s)) {
      const err = new Error('Invalid meeting_status');
      err.status = 400;
      throw err;
    }
    updates.push('meeting_status = ?');
    params.push(s);
  }
  if (payload.contact_id !== undefined) {
    const cid = await assertContactOptional(tenantId, payload.contact_id);
    updates.push('contact_id = ?');
    params.push(cid);
  }
  if (payload.assigned_user_id !== undefined) {
    const aid = await assertUserOptional(tenantId, payload.assigned_user_id);
    updates.push('assigned_user_id = ?');
    params.push(aid);
  }
  if (payload.attendance_status !== undefined) {
    const a = trimStr(payload.attendance_status);
    const attAllowed = ['unknown', 'attended', 'no_show', 'cancelled'];
    if (!a || !attAllowed.includes(a)) {
      const err = new Error('Invalid attendance_status');
      err.status = 400;
      throw err;
    }
    updates.push('attendance_status = ?');
    params.push(a);
  }
  updates.push('email_account_id = ?');
  params.push(email_account_id);

  const sa = payload.start_at !== undefined ? trimStr(payload.start_at) : existing.start_at;
  const ea = payload.end_at !== undefined ? trimStr(payload.end_at) : existing.end_at;
  if (sa && ea && String(sa) >= String(ea)) {
    const err = new Error('end_at must be after start_at');
    err.status = 400;
    throw err;
  }

  updates.push('updated_by = ?');
  params.push(userId ?? null);
  params.push(tenantId, Number(id));

  await query(`UPDATE tenant_meetings SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`, params);

  const row = await findById(tenantId, id);
  const notifyKind = row?.meeting_status === 'cancelled' ? 'cancelled' : 'updated';
  void trySendMeetingAttendeeEmail(tenantId, userId, row, notifyKind);
  return row;
}

export async function remove(tenantId, userId, id) {
  const existing = await findById(tenantId, id);
  if (!existing) {
    const err = new Error('Meeting not found');
    err.status = 404;
    throw err;
  }
  await query(
    `UPDATE tenant_meetings
     SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [userId ?? null, userId ?? null, tenantId, Number(id)]
  );
  return { success: true };
}
