import { query } from '../../config/db.js';

export async function getAgentDeletePolicy(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return null;
  const [row] = await query(
    `SELECT agents_can_delete_leads, agents_can_delete_contacts
     FROM tenants
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [tid]
  );
  if (!row) return null;
  return {
    agents_can_delete_leads: !!row.agents_can_delete_leads,
    agents_can_delete_contacts: !!row.agents_can_delete_contacts,
  };
}

/**
 * @param {number} tenantId
 * @param {{ agents_can_delete_leads?: boolean, agents_can_delete_contacts?: boolean }} payload
 */
export async function updateAgentDeletePolicy(tenantId, payload) {
  const tid = Number(tenantId);
  if (!tid || tid === 1) {
    const err = new Error('Cannot update this workspace');
    err.status = 403;
    throw err;
  }

  const { agents_can_delete_leads, agents_can_delete_contacts } = payload || {};
  const updates = [];
  const params = [];

  if (agents_can_delete_leads !== undefined) {
    updates.push('agents_can_delete_leads = ?');
    params.push(agents_can_delete_leads ? 1 : 0);
  }
  if (agents_can_delete_contacts !== undefined) {
    updates.push('agents_can_delete_contacts = ?');
    params.push(agents_can_delete_contacts ? 1 : 0);
  }

  if (updates.length === 0) {
    return getAgentDeletePolicy(tid);
  }

  params.push(tid);
  await query(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ? AND is_deleted = 0`, params);
  return getAgentDeletePolicy(tid);
}
