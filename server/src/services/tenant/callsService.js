import { query } from '../../config/db.js';
import { getTelephonyProvider } from './telephony/telephonyProviderRegistry.js';

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
    contact_id,
    disposition_id,
    agent_user_id,
    started_after,
    started_before,
  } = {}
) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = ['cca.tenant_id = ?'];
  const params = [tenantId];

  // Scope to contact if provided
  if (contact_id) {
    where.push('cca.contact_id = ?');
    params.push(Number(contact_id));
  }

  if (disposition_id !== undefined && disposition_id !== null && disposition_id !== '') {
    const did = Number(disposition_id);
    if (Number.isFinite(did) && did > 0) {
      where.push('cca.disposition_id = ?');
      params.push(did);
    }
  }

  if (
    (user.role === 'manager' || user.role === 'admin') &&
    agent_user_id !== undefined &&
    agent_user_id !== null &&
    agent_user_id !== ''
  ) {
    const aid = Number(agent_user_id);
    if (Number.isFinite(aid) && aid > 0) {
      if (user.role === 'manager') {
        const [ag] = await query(
          `SELECT id FROM users
           WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0 AND manager_id = ?
           LIMIT 1`,
          [aid, tenantId, user.id]
        );
        if (!ag) {
          const err = new Error('Invalid agent filter');
          err.status = 403;
          throw err;
        }
      } else {
        const [ag] = await query(
          `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0 LIMIT 1`,
          [aid, tenantId]
        );
        if (!ag) {
          const err = new Error('Invalid agent filter');
          err.status = 400;
          throw err;
        }
      }
      where.push('cca.agent_user_id = ?');
      params.push(aid);
    }
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

  const whereSql = where.join(' AND ');
  const [countRow] = await query(`SELECT COUNT(*) AS total FROM contact_call_attempts cca WHERE ${whereSql}`, params);
  const total = countRow?.total ?? 0;

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
        u.name AS agent_name
     FROM contact_call_attempts cca
     LEFT JOIN contacts c ON c.id = cca.contact_id AND c.tenant_id = cca.tenant_id
     LEFT JOIN contact_phones p ON p.id = cca.contact_phone_id AND p.tenant_id = cca.tenant_id
     LEFT JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id
     WHERE ${whereSql}
     ORDER BY cca.created_at DESC, cca.id DESC
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

export async function setAttemptDisposition(tenantId, user, attemptId, { disposition_id = null, notes = null } = {}) {
  const id = Number(attemptId);
  if (!id) {
    const err = new Error('Invalid attempt id');
    err.status = 400;
    throw err;
  }

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

  const updateResult = await query(
    `UPDATE contact_call_attempts
     SET disposition_id = ?, notes = ?
     WHERE ${where.join(' AND ')}`,
    [dispForDb, notes ? String(notes).slice(0, 2000) : null, ...params]
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
  if (dispForDb) {
    const [dispo] = await query(
      `SELECT next_action FROM dispositions WHERE tenant_id = ? AND id = ? AND is_deleted = 0 LIMIT 1`,
      [tenantId, dispForDb]
    );
    const na = String(dispo?.next_action || '').trim().toLowerCase();
    next_action = na || null;
    if (na !== 'next_number') {
      await query(
        `UPDATE dialer_session_items
         SET state = 'called', called_at = NOW()
         WHERE tenant_id = ? AND last_attempt_id = ? AND state = 'calling'`,
        [tenantId, id]
      );
    }
  }

  return { attempt: row || null, next_action };
}

