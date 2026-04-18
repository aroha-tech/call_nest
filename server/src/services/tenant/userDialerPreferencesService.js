import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

export async function getForUser(userId, tenantId) {
  const [row] = await query(
    `SELECT u.default_dialing_set_id, u.default_call_script_id,
            ds.name AS default_dialing_set_name,
            cs.script_name AS default_call_script_name
     FROM users u
     LEFT JOIN dialing_sets ds ON ds.id = u.default_dialing_set_id AND ds.tenant_id = ? AND ds.is_deleted = 0
     LEFT JOIN call_scripts cs ON cs.id = u.default_call_script_id AND cs.tenant_id = ? AND cs.is_deleted = 0
     WHERE u.id = ? AND u.tenant_id = ? AND u.is_deleted = 0`,
    [tenantId, tenantId, userId, tenantId]
  );
  return row || null;
}

/**
 * Set this user's preferred default dialing set and/or call script (any tenant member with dial access).
 */
export async function updateForUser(userId, tenantId, payload) {
  const { default_dialing_set_id, default_call_script_id } = payload;

  if (default_dialing_set_id !== undefined && default_dialing_set_id !== null && default_dialing_set_id !== '') {
    const id = String(default_dialing_set_id).trim();
    const [ds] = await query(
      'SELECT id FROM dialing_sets WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
      [id, tenantId]
    );
    if (!ds) {
      const err = new Error('Dialing set not found');
      err.status = 400;
      throw err;
    }
  }

  if (default_call_script_id !== undefined && default_call_script_id !== null && default_call_script_id !== '') {
    const id = Number(default_call_script_id);
    const [cs] = await query(
      'SELECT id FROM call_scripts WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
      [id, tenantId]
    );
    if (!cs) {
      const err = new Error('Call script not found');
      err.status = 400;
      throw err;
    }
  }

  const updates = [];
  const params = [];

  if (default_dialing_set_id !== undefined) {
    updates.push('default_dialing_set_id = ?');
    params.push(
      default_dialing_set_id === null || default_dialing_set_id === ''
        ? null
        : String(default_dialing_set_id).trim()
    );
  }
  if (default_call_script_id !== undefined) {
    updates.push('default_call_script_id = ?');
    params.push(
      default_call_script_id === null || default_call_script_id === '' ? null : Number(default_call_script_id)
    );
  }

  if (updates.length === 0) {
    return getForUser(userId, tenantId);
  }

  params.push(userId, tenantId);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

  const parts = [];
  if (default_dialing_set_id !== undefined) parts.push('default dialing set');
  if (default_call_script_id !== undefined) parts.push('default call script');
  await safeLogTenantActivity(tenantId, userId, {
    event_category: 'dialer',
    event_type: 'dialer.preferences_updated',
    summary: `Dialer defaults updated (${parts.join(', ')})`,
    entity_type: 'user',
    entity_id: Number(userId),
  });

  return getForUser(userId, tenantId);
}
