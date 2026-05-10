import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

async function clearOtherAssignments(tenantId, userId, exceptId, actingUserId) {
  if (!tenantId || !userId) return;
  await query(
    `UPDATE tenant_dialer_phone_numbers
     SET assigned_user_id = NULL, updated_by = ?
     WHERE tenant_id = ?
       AND assigned_user_id = ?
       AND id <> ?
       AND deleted_at IS NULL`,
    [actingUserId ?? null, tenantId, userId, exceptId]
  );
}

export async function listForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return [];
  return query(
    `SELECT n.id, n.tenant_id, n.label, n.caller_id_e164, n.agent_leg_e164,
            n.assigned_user_id, n.is_active, n.created_at, n.updated_at,
            u.name AS assigned_user_name, u.email AS assigned_user_email
     FROM tenant_dialer_phone_numbers n
     LEFT JOIN users u
       ON u.id = n.assigned_user_id AND u.tenant_id = n.tenant_id AND u.is_deleted = 0
     WHERE n.tenant_id = ? AND n.deleted_at IS NULL
     ORDER BY n.is_active DESC, n.caller_id_e164 ASC, n.id ASC`,
    [tid]
  );
}

/**
 * Tenant admins may only change assignment and active flag; inventory is managed by platform admins.
 */
export async function updateRowForTenant(tenantId, actingUserId, id, body = {}) {
  const tid = Number(tenantId);
  const nid = Number(id);
  if (!tid || !nid) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }

  const [existing] = await query(
    `SELECT id FROM tenant_dialer_phone_numbers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [nid, tid]
  );
  if (!existing) {
    const err = new Error('Phone number not found');
    err.status = 404;
    throw err;
  }

  const updates = [];
  const params = [];

  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }

  let assigned_user_id = undefined;
  if (body.assigned_user_id !== undefined) {
    if (body.assigned_user_id === null || body.assigned_user_id === '') {
      assigned_user_id = null;
    } else {
      assigned_user_id = Number(body.assigned_user_id);
      if (!Number.isFinite(assigned_user_id) || assigned_user_id <= 0) {
        const err = new Error('Invalid assigned user');
        err.status = 400;
        throw err;
      }
      const [u] = await query(
        `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 LIMIT 1`,
        [assigned_user_id, tid]
      );
      if (!u) {
        const err = new Error('User not found in this workspace');
        err.status = 400;
        throw err;
      }
    }
    updates.push('assigned_user_id = ?');
    params.push(assigned_user_id);
  }

  if (updates.length === 0) {
    const [row] = await query(
      `SELECT n.id, n.tenant_id, n.label, n.caller_id_e164, n.agent_leg_e164,
              n.assigned_user_id, n.is_active, n.created_at, n.updated_at,
              u.name AS assigned_user_name, u.email AS assigned_user_email
       FROM tenant_dialer_phone_numbers n
       LEFT JOIN users u ON u.id = n.assigned_user_id AND u.tenant_id = n.tenant_id AND u.is_deleted = 0
       WHERE n.id = ? AND n.tenant_id = ? AND n.deleted_at IS NULL`,
      [nid, tid]
    );
    return row;
  }

  updates.push('updated_by = ?');
  params.push(actingUserId ?? null);
  params.push(nid, tid);

  await query(
    `UPDATE tenant_dialer_phone_numbers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    params
  );

  if (assigned_user_id !== undefined && assigned_user_id) {
    await clearOtherAssignments(tid, assigned_user_id, nid, actingUserId);
  }

  await safeLogTenantActivity(tid, actingUserId, {
    event_category: 'tenant',
    event_type: 'dialer.phone_number_updated',
    summary: 'Dialer phone assignment or status updated',
    entity_type: 'tenant_dialer_phone_number',
    entity_id: nid,
  });

  const [row] = await query(
    `SELECT n.id, n.tenant_id, n.label, n.caller_id_e164, n.agent_leg_e164,
            n.assigned_user_id, n.is_active, n.created_at, n.updated_at,
            u.name AS assigned_user_name, u.email AS assigned_user_email
     FROM tenant_dialer_phone_numbers n
     LEFT JOIN users u ON u.id = n.assigned_user_id AND u.tenant_id = n.tenant_id AND u.is_deleted = 0
     WHERE n.id = ? AND n.tenant_id = ? AND n.deleted_at IS NULL`,
    [nid, tid]
  );
  return row;
}
