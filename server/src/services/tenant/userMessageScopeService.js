import { query } from '../../config/db.js';

/**
 * Shared scope for listing outbound messages (WhatsApp, email Sent, etc.) by sender (created_by).
 * - admin: null (no filter)
 * - agent: [self]
 * - manager: self + agents with manager_id = this user
 */
export async function getCreatedByUserIdsForScope(tenantId, user) {
  const role = user?.role;
  const userId = user?.id;
  if (userId == null) return [];
  if (role === 'admin') return null;

  if (role === 'agent') {
    return [Number(userId)];
  }

  if (role === 'manager') {
    const rows = await query(
      `SELECT id FROM users
       WHERE tenant_id = ? AND is_deleted = 0
         AND (id = ? OR (role = 'agent' AND manager_id = ?))`,
      [tenantId, userId, userId]
    );
    return rows.map((r) => Number(r.id));
  }

  return [Number(userId)];
}

/**
 * Whether the current user may see one outbound row keyed by created_by.
 */
export async function isOutboundRecordVisibleByCreatedBy(tenantId, user, createdBy) {
  if (user?.role === 'admin') return true;
  if (createdBy == null) return false;
  const n = Number(createdBy);
  const uid = Number(user?.id);
  if (user?.role === 'agent') return n === uid;
  if (user?.role === 'manager') {
    const ids = await getCreatedByUserIdsForScope(tenantId, user);
    if (ids == null) return true;
    return ids.includes(n);
  }
  return false;
}

/**
 * Call scripts: who may appear as script creator for list/get visibility.
 * - settings.manage (manageAllScripts): caller passes manageAllScripts true → null (no filter).
 * - tenant role admin: null (all scripts in tenant).
 * - agent: self, all tenant admins, and assigned manager (if any).
 * - manager: self, direct-report agents, and all tenant admins.
 */
export async function getCallScriptVisibleCreatedByUserIds(tenantId, user, manageAllScripts) {
  if (manageAllScripts) return null;
  const role = user?.role;
  const userId = user?.id;
  if (userId == null) return [];
  if (role === 'admin') return null;

  const adminRows = await query(
    `SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' AND is_deleted = 0`,
    [tenantId]
  );
  const adminIds = adminRows.map((r) => Number(r.id));

  if (role === 'agent') {
    const ids = new Set([Number(userId), ...adminIds]);
    const [row] = await query(
      'SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
      [userId, tenantId]
    );
    const mid = row?.manager_id != null ? Number(row.manager_id) : null;
    if (mid) ids.add(mid);
    return [...ids];
  }

  if (role === 'manager') {
    const teamRows = await query(
      `SELECT id FROM users WHERE tenant_id = ? AND is_deleted = 0
         AND (id = ? OR (role = 'agent' AND manager_id = ?))`,
      [tenantId, userId, userId]
    );
    const teamIds = teamRows.map((r) => Number(r.id));
    return [...new Set([...teamIds, ...adminIds])];
  }

  return [Number(userId)];
}

export async function isCallScriptVisibleByCreatedBy(tenantId, user, createdBy, manageAllScripts) {
  if (manageAllScripts) return true;
  if (user?.role === 'admin') return true;
  if (createdBy == null) return false;
  const ids = await getCallScriptVisibleCreatedByUserIds(tenantId, user, manageAllScripts);
  if (ids == null) return true;
  return ids.includes(Number(createdBy));
}
