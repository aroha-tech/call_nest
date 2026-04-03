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
