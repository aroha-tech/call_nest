import { query } from '../../config/db.js';
import { getTelephonyProvider } from './telephony/telephonyProviderRegistry.js';

async function fetchContactAndPhoneForCall(tenantId, user, contactId) {
  // Ownership restriction: match same logic as contactsService buildOwnershipWhere but inline for call module.
  // Admin: any in tenant; Manager: manager_id = me; Agent: assigned_user_id = me.
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
        c.primary_phone_id,
        p.id AS phone_id,
        p.phone AS phone_e164
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.tenant_id = c.tenant_id
      AND p.contact_id = c.id
      AND (p.id = c.primary_phone_id OR p.is_primary = 1)
     WHERE ${where.join(' AND ')}
     ORDER BY (p.id = c.primary_phone_id) DESC, p.is_primary DESC, p.id ASC
     LIMIT 1`,
    params
  );
  return row || null;
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

  const row = await fetchContactAndPhoneForCall(tenantId, user, cid);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }

  const chosenPhoneId = contact_phone_id ? Number(contact_phone_id) : row.phone_id ? Number(row.phone_id) : null;
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

export async function listCallAttempts(tenantId, user, { page = 1, limit = 20, contact_id } = {}) {
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

  // Only update attempts within scope (agents: their own; managers: their team; admin: any tenant)
  const where = ['tenant_id = ?', 'id = ?'];
  const params = [tenantId, id];
  if (user.role === 'agent') {
    where.push('agent_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    where.push('manager_id = ?');
    params.push(user.id);
  }

  await query(
    `UPDATE contact_call_attempts
     SET disposition_id = ?, notes = ?
     WHERE ${where.join(' AND ')}`,
    [disposition_id || null, notes ? String(notes).slice(0, 2000) : null, ...params]
  );

  const [row] = await query(
    `SELECT id, contact_id, disposition_id, notes FROM contact_call_attempts WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id]
  );

  // Only advance the dialer queue when a real disposition was chosen. A PUT with
  // disposition_id null (e.g. Activities "Save" with empty select, or bad client)
  // must NOT mark the row "called" or the first lead disappears while you are still on them.
  const dispIdNum =
    disposition_id !== undefined && disposition_id !== null && disposition_id !== ''
      ? Number(disposition_id)
      : NaN;
  if (Number.isFinite(dispIdNum) && dispIdNum > 0) {
    await query(
      `UPDATE dialer_session_items
       SET state = 'called', called_at = NOW()
       WHERE tenant_id = ? AND last_attempt_id = ? AND state = 'calling'`,
      [tenantId, id]
    );
  }

  return row || null;
}

