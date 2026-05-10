import { query } from '../../config/db.js';
import { normalizeTelephonyNullable } from '../../utils/telephonyNumberInput.js';
import { safeLogPlatformActivity } from './platformActivityLogService.js';

function normalizeCaller(raw) {
  const v = normalizeTelephonyNullable(raw);
  if (v === undefined) return undefined;
  if (v === null || v === '') {
    const err = new Error('Caller ID is required');
    err.status = 400;
    throw err;
  }
  return v;
}

async function assertCallerUnique(callerE164, excludeId) {
  const params = [callerE164];
  let sql = `SELECT id FROM tenant_dialer_phone_numbers WHERE caller_id_e164 = ? AND deleted_at IS NULL`;
  if (excludeId) {
    sql += ` AND id <> ?`;
    params.push(excludeId);
  }
  const [dup] = await query(sql, params);
  if (dup) {
    const err = new Error('This caller ID is already in the platform inventory');
    err.status = 409;
    throw err;
  }
}

async function selectRowById(id) {
  const [row] = await query(
    `SELECT n.id, n.tenant_id, n.label, n.caller_id_e164, n.agent_leg_e164,
            n.assigned_user_id, n.is_active, n.created_at, n.updated_at,
            u.name AS assigned_user_name, u.email AS assigned_user_email,
            ten.name AS tenant_name, ten.slug AS tenant_slug
     FROM tenant_dialer_phone_numbers n
     LEFT JOIN tenants ten ON ten.id = n.tenant_id AND ten.is_deleted = 0
     LEFT JOIN users u ON u.id = n.assigned_user_id AND u.is_deleted = 0
       AND (n.tenant_id IS NULL OR u.tenant_id = n.tenant_id)
     WHERE n.id = ? AND n.deleted_at IS NULL`,
    [id]
  );
  return row || null;
}

/**
 * @param {{ tenant_id?: string|number, unallocated_only?: boolean }} [filters]
 */
export async function listAll(filters = {}) {
  let where = 'n.deleted_at IS NULL';
  const params = [];
  if (filters.unallocated_only) {
    where += ' AND n.tenant_id IS NULL';
  } else if (filters.tenant_id != null && filters.tenant_id !== '') {
    const tid = Number(filters.tenant_id);
    if (tid) {
      where += ' AND n.tenant_id = ?';
      params.push(tid);
    }
  }
  return query(
    `SELECT n.id, n.tenant_id, n.label, n.caller_id_e164, n.agent_leg_e164,
            n.assigned_user_id, n.is_active, n.created_at, n.updated_at,
            u.name AS assigned_user_name, u.email AS assigned_user_email,
            ten.name AS tenant_name, ten.slug AS tenant_slug
     FROM tenant_dialer_phone_numbers n
     LEFT JOIN tenants ten ON ten.id = n.tenant_id AND ten.is_deleted = 0
     LEFT JOIN users u ON u.id = n.assigned_user_id AND u.is_deleted = 0
       AND (n.tenant_id IS NULL OR u.tenant_id = n.tenant_id)
     WHERE ${where}
     ORDER BY (n.tenant_id IS NULL) DESC, ten.name ASC, n.caller_id_e164 ASC, n.id ASC`,
    params
  );
}

export async function createPlatformRow(actingUserId, body = {}) {
  let tenant_id = body.tenant_id;
  if (tenant_id === undefined || tenant_id === null || tenant_id === '') {
    tenant_id = null;
  } else {
    tenant_id = Number(tenant_id);
    if (!Number.isFinite(tenant_id) || tenant_id <= 0) {
      const err = new Error('Invalid workspace');
      err.status = 400;
      throw err;
    }
    const [t] = await query(`SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`, [tenant_id]);
    if (!t) {
      const err = new Error('Workspace not found');
      err.status = 404;
      throw err;
    }
  }

  const label =
    body.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 128) : null;
  const caller_id_e164 = normalizeCaller(body.caller_id_e164);
  const agent_leg_e164 = normalizeTelephonyNullable(body.agent_leg_e164);
  const legVal = agent_leg_e164 === undefined ? null : agent_leg_e164;

  await assertCallerUnique(caller_id_e164, null);

  const result = await query(
    `INSERT INTO tenant_dialer_phone_numbers (
       tenant_id, label, caller_id_e164, agent_leg_e164, assigned_user_id, is_active,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
    [tenant_id, label, caller_id_e164, legVal, actingUserId ?? null, actingUserId ?? null]
  );
  const insertId = result.insertId;

  await safeLogPlatformActivity({
    actor_user_id: actingUserId,
    subject_tenant_id: tenant_id,
    event_category: 'platform',
    event_type: 'dialer.phone_inventory_created',
    summary: `Dialer inventory: added ${caller_id_e164}`,
    entity_type: 'tenant_dialer_phone_number',
    entity_id: insertId,
  });

  return selectRowById(insertId);
}

export async function updatePlatformRow(actingUserId, id, body = {}) {
  const nid = Number(id);
  if (!nid) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }

  const [existing] = await query(
    `SELECT id, tenant_id, assigned_user_id FROM tenant_dialer_phone_numbers WHERE id = ? AND deleted_at IS NULL`,
    [nid]
  );
  if (!existing) {
    const err = new Error('Phone number not found');
    err.status = 404;
    throw err;
  }

  let nextTenantId = existing.tenant_id;
  if (body.tenant_id !== undefined) {
    if (body.tenant_id === null || body.tenant_id === '') {
      nextTenantId = null;
    } else {
      nextTenantId = Number(body.tenant_id);
      if (!Number.isFinite(nextTenantId) || nextTenantId <= 0) {
        const err = new Error('Invalid workspace');
        err.status = 400;
        throw err;
      }
      const [t] = await query(`SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`, [nextTenantId]);
      if (!t) {
        const err = new Error('Workspace not found');
        err.status = 404;
        throw err;
      }
    }
  }

  const updates = [];
  const params = [];

  if (body.label !== undefined) {
    updates.push('label = ?');
    params.push(
      body.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 128) : null
    );
  }
  if (body.caller_id_e164 !== undefined) {
    const c = normalizeCaller(body.caller_id_e164);
    await assertCallerUnique(c, nid);
    updates.push('caller_id_e164 = ?');
    params.push(c);
  }
  if (body.agent_leg_e164 !== undefined) {
    const leg = normalizeTelephonyNullable(body.agent_leg_e164);
    updates.push('agent_leg_e164 = ?');
    params.push(leg === undefined ? null : leg);
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }

  const tenantChanged = nextTenantId !== existing.tenant_id;
  if (tenantChanged) {
    updates.push('tenant_id = ?');
    params.push(nextTenantId);
    if (nextTenantId === null) {
      updates.push('assigned_user_id = ?');
      params.push(null);
    } else if (existing.assigned_user_id) {
      const [u] = await query(
        `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
        [existing.assigned_user_id, nextTenantId]
      );
      if (!u) {
        updates.push('assigned_user_id = ?');
        params.push(null);
      }
    }
  }

  if (updates.length === 0) {
    return selectRowById(nid);
  }

  updates.push('updated_by = ?');
  params.push(actingUserId ?? null);
  params.push(nid);

  await query(
    `UPDATE tenant_dialer_phone_numbers SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  await safeLogPlatformActivity({
    actor_user_id: actingUserId,
    subject_tenant_id: nextTenantId,
    event_category: 'platform',
    event_type: 'dialer.phone_inventory_updated',
    summary: 'Dialer inventory row updated',
    entity_type: 'tenant_dialer_phone_number',
    entity_id: nid,
  });

  return selectRowById(nid);
}

export async function softDeletePlatformRow(actingUserId, id) {
  const nid = Number(id);
  if (!nid) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id, tenant_id, caller_id_e164 FROM tenant_dialer_phone_numbers WHERE id = ? AND deleted_at IS NULL`,
    [nid]
  );
  if (!row) {
    const err = new Error('Phone number not found');
    err.status = 404;
    throw err;
  }
  await query(
    `UPDATE tenant_dialer_phone_numbers
     SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [actingUserId ?? null, nid]
  );

  await safeLogPlatformActivity({
    actor_user_id: actingUserId,
    subject_tenant_id: row.tenant_id,
    event_category: 'platform',
    event_type: 'dialer.phone_inventory_removed',
    summary: `Dialer inventory removed: ${row.caller_id_e164 || nid}`,
    entity_type: 'tenant_dialer_phone_number',
    entity_id: nid,
  });

  return { ok: true };
}
