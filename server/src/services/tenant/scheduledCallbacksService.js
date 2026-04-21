import { query } from '../../config/db.js';
import { getCreatedByUserIdsForScope } from './userMessageScopeService.js';

function clampInt(v, { min = 1, max = 100, fallback = 20 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function getAssignedUserIdsForScope(tenantId, actingUser) {
  return getCreatedByUserIdsForScope(tenantId, actingUser);
}

function enforceRequestedUserIdInScope(requestedUserId, scopedIds) {
  if (!requestedUserId) return { effectiveIds: scopedIds };
  const id = Number(requestedUserId);
  if (!Number.isFinite(id) || id <= 0) return { effectiveIds: scopedIds };
  if (scopedIds == null) return { effectiveIds: null };
  if (scopedIds.includes(id)) return { effectiveIds: [id] };
  return { effectiveIds: [] };
}

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

async function assertContact(tenantId, contactId) {
  const id = Number(contactId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid contact');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id FROM contacts WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, id]
  );
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 400;
    throw err;
  }
  return id;
}

async function assertUser(tenantId, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid assigned user');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id FROM users WHERE tenant_id = ? AND id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
    [tenantId, id]
  );
  if (!row) {
    const err = new Error('Assigned user not found');
    err.status = 400;
    throw err;
  }
  return id;
}

async function assertPhoneOptional(tenantId, contactId, phoneId) {
  if (phoneId == null || phoneId === '') return null;
  const id = Number(phoneId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const [row] = await query(
    `SELECT id FROM contact_phones WHERE tenant_id = ? AND id = ? AND contact_id = ? LIMIT 1`,
    [tenantId, id, cid]
  );
  if (!row) {
    const err = new Error('Contact phone not found');
    err.status = 400;
    throw err;
  }
  return id;
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const allowed = new Set(['pending', 'completed', 'cancelled']);
  if (!s) return 'pending';
  if (!allowed.has(s)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }
  return s;
}

function normalizeMysqlDatetime(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  // Accept either "YYYY-MM-DD HH:mm:ss" or ISO-like "YYYY-MM-DDTHH:mm"
  const v = t.includes('T') ? t.replace('T', ' ') : t;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
  const err = new Error('Invalid scheduled_at');
  err.status = 400;
  throw err;
}

/**
 * Pending callbacks for the tenant dashboard widget (same assignee scope as list/metrics).
 * Oldest scheduled first (overdue pending appears before future).
 */
export async function listDashboardPendingCallbacks(tenantId, actingUser, limit = 6) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const lim = Math.min(20, Math.max(1, limit));
  const scopeClause =
    scopedIds == null ? '' : ` AND sc.assigned_user_id IN (${scopedIds.map(() => '?').join(',')}) `;
  const scopeParams = scopedIds == null ? [] : scopedIds;

  const rows = await query(
    `SELECT sc.id, sc.contact_id, sc.scheduled_at, sc.status, sc.notes,
            c.display_name AS contact_name, c.type AS contact_type,
            cp.phone AS contact_phone,
            u.name AS assigned_name
     FROM scheduled_callbacks sc
     INNER JOIN contacts c
       ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN contact_phones cp
       ON cp.id = sc.contact_phone_id AND cp.tenant_id = sc.tenant_id
     LEFT JOIN users u
       ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
     WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL
       AND sc.status = 'pending'${scopeClause}
     ORDER BY sc.scheduled_at ASC
     LIMIT ${lim}`,
    [tenantId, ...scopeParams]
  );

  return rows.map((r) => ({
    id: r.id,
    contact_id: r.contact_id,
    scheduled_at: r.scheduled_at,
    status: r.status,
    notes: r.notes,
    contact_name: r.contact_name,
    contact_type: r.contact_type,
    contact_phone: r.contact_phone,
    assigned_name: r.assigned_name,
  }));
}

export async function getCallbackMetrics(tenantId, actingUser, { assigned_user_id = null } = {}) {
  const scopedIds = await getAssignedUserIdsForScope(tenantId, actingUser);
  const { effectiveIds } = enforceRequestedUserIdInScope(assigned_user_id, scopedIds);
  if (effectiveIds && effectiveIds.length === 0) {
    return { total: 0, pending: 0, upcoming: 0, missed: 0, completed: 0, cancelled: 0, today: 0 };
  }

  const scopeClause = effectiveIds == null ? '' : ` AND sc.assigned_user_id IN (${effectiveIds.map(() => '?').join(',')}) `;
  const scopeParams = effectiveIds == null ? [] : effectiveIds;

  const [row] = await query(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN sc.status = 'pending' AND sc.scheduled_at >= NOW() THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN sc.status = 'pending' AND sc.scheduled_at >= NOW() THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN sc.status = 'pending' AND sc.scheduled_at < NOW() THEN 1 ELSE 0 END) AS missed,
        SUM(CASE WHEN sc.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN sc.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN DATE(sc.scheduled_at) = CURDATE() THEN 1 ELSE 0 END) AS today
     FROM scheduled_callbacks sc
     WHERE sc.tenant_id = ? AND sc.deleted_at IS NULL${scopeClause}`,
    [tenantId, ...scopeParams]
  );

  const n = (v) => Number(v ?? 0) || 0;
  return {
    total: n(row?.total),
    pending: n(row?.pending),
    upcoming: n(row?.upcoming),
    missed: n(row?.missed),
    completed: n(row?.completed),
    cancelled: n(row?.cancelled),
    today: n(row?.today),
  };
}

export async function findCallbackById(tenantId, id) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const [row] = await query(
    `SELECT
        sc.*,
        c.display_name AS contact_name,
        c.type AS contact_type,
        cp.phone AS contact_phone,
        u.name AS assigned_name,
        u.email AS assigned_email
     FROM scheduled_callbacks sc
     INNER JOIN contacts c
       ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN contact_phones cp
       ON cp.id = sc.contact_phone_id AND cp.tenant_id = sc.tenant_id
     LEFT JOIN users u
       ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
     WHERE sc.tenant_id = ? AND sc.id = ? AND sc.deleted_at IS NULL
     LIMIT 1`,
    [tenantId, cid]
  );
  return row || null;
}

export async function createCallback(tenantId, user, payload) {
  const contact_id = await assertContact(tenantId, payload.contact_id);
  const assigned_user_id = await assertUser(tenantId, payload.assigned_user_id);
  const contact_phone_id = await assertPhoneOptional(tenantId, contact_id, payload.contact_phone_id);
  const scheduled_at = normalizeMysqlDatetime(payload.scheduled_at);
  if (!scheduled_at) {
    const err = new Error('scheduled_at is required');
    err.status = 400;
    throw err;
  }
  const status = normalizeStatus(payload.status);

  const notes = trimStr(payload.notes);
  const outcome_notes = trimStr(payload.outcome_notes);
  const completed_at =
    status === 'completed' ? normalizeMysqlDatetime(payload.completed_at) || scheduled_at : null;

  const result = await query(
    `INSERT INTO scheduled_callbacks
      (tenant_id, contact_id, contact_phone_id, assigned_user_id, scheduled_at, status, notes, completed_at, outcome_notes, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      contact_id,
      contact_phone_id,
      assigned_user_id,
      scheduled_at,
      status,
      notes,
      completed_at,
      outcome_notes,
      user?.id ?? null,
      user?.id ?? null,
    ]
  );
  return findCallbackById(tenantId, result.insertId);
}

export async function updateCallback(tenantId, user, id, payload) {
  const existing = await findCallbackById(tenantId, id);
  if (!existing) {
    const err = new Error('Callback not found');
    err.status = 404;
    throw err;
  }

  const sets = [];
  const params = [];

  if (payload.contact_id !== undefined) {
    const cid = await assertContact(tenantId, payload.contact_id);
    sets.push('contact_id = ?');
    params.push(cid);
  }
  if (payload.assigned_user_id !== undefined) {
    const uid = await assertUser(tenantId, payload.assigned_user_id);
    sets.push('assigned_user_id = ?');
    params.push(uid);
  }
  if (payload.contact_phone_id !== undefined) {
    const effectiveContactId = payload.contact_id !== undefined ? await assertContact(tenantId, payload.contact_id) : existing.contact_id;
    const pid = await assertPhoneOptional(tenantId, effectiveContactId, payload.contact_phone_id);
    sets.push('contact_phone_id = ?');
    params.push(pid);
  }
  if (payload.scheduled_at !== undefined) {
    const dt = normalizeMysqlDatetime(payload.scheduled_at);
    if (!dt) {
      const err = new Error('scheduled_at is required');
      err.status = 400;
      throw err;
    }
    sets.push('scheduled_at = ?');
    params.push(dt);
  }
  if (payload.notes !== undefined) {
    sets.push('notes = ?');
    params.push(trimStr(payload.notes));
  }
  if (payload.outcome_notes !== undefined) {
    sets.push('outcome_notes = ?');
    params.push(trimStr(payload.outcome_notes));
  }
  if (payload.status !== undefined) {
    const st = normalizeStatus(payload.status);
    sets.push('status = ?');
    params.push(st);
    if (st === 'completed') {
      const dt = normalizeMysqlDatetime(payload.completed_at) || existing.completed_at || existing.scheduled_at;
      sets.push('completed_at = ?');
      params.push(dt);
    } else {
      sets.push('completed_at = ?');
      params.push(null);
    }
  }

  if (sets.length === 0) return existing;

  sets.push('updated_by = ?');
  params.push(user?.id ?? null);
  params.push(tenantId, Number(id));

  await query(
    `UPDATE scheduled_callbacks
     SET ${sets.join(', ')}
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    params
  );

  return findCallbackById(tenantId, id);
}

export async function removeCallback(tenantId, user, id) {
  const existing = await findCallbackById(tenantId, id);
  if (!existing) {
    const err = new Error('Callback not found');
    err.status = 404;
    throw err;
  }
  await query(
    `UPDATE scheduled_callbacks
     SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [user?.id ?? null, user?.id ?? null, tenantId, Number(id)]
  );
  return { success: true };
}

