import { query } from '../../config/db.js';
import { env } from '../../config/env.js';

/**
 * Resolve Exotel CallerId + From (agent leg) for a user:
 * user profile override → assigned inventory row → shared pool (unassigned rows) → env.
 */
export async function resolveExotelDisplayNumbers(tenantId, userId) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  if (!tid || !uid) {
    return {
      callerId: String(env.telephony.exotelCallerId || '').trim() || null,
      agentLeg: String(env.telephony.exotelAgentLeg || '').trim() || null,
    };
  }

  const [u] = await query(
    `SELECT telephony_caller_id_e164, telephony_agent_leg_e164
     FROM users
     WHERE id = ? AND tenant_id = ? AND is_deleted = 0
     LIMIT 1`,
    [uid, tid]
  );

  const [inv] = await query(
    `SELECT caller_id_e164, agent_leg_e164
     FROM tenant_dialer_phone_numbers
     WHERE tenant_id = ?
       AND assigned_user_id = ?
       AND is_active = 1
       AND deleted_at IS NULL
     LIMIT 1`,
    [tid, uid]
  );

  const [pool] = await query(
    `SELECT caller_id_e164, agent_leg_e164
     FROM tenant_dialer_phone_numbers
     WHERE tenant_id = ?
       AND assigned_user_id IS NULL
       AND is_active = 1
       AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [tid]
  );

  const pick = (userVal, inventoryVal, poolVal, envVal) => {
    const a = userVal != null && String(userVal).trim() ? String(userVal).trim() : '';
    if (a) return a;
    const i = inventoryVal != null && String(inventoryVal).trim() ? String(inventoryVal).trim() : '';
    if (i) return i;
    const p = poolVal != null && String(poolVal).trim() ? String(poolVal).trim() : '';
    if (p) return p;
    const c = envVal != null && String(envVal).trim() ? String(envVal).trim() : '';
    return c || null;
  };

  return {
    callerId: pick(
      u?.telephony_caller_id_e164,
      inv?.caller_id_e164,
      pool?.caller_id_e164,
      env.telephony.exotelCallerId
    ),
    agentLeg: pick(
      u?.telephony_agent_leg_e164,
      inv?.agent_leg_e164,
      pool?.agent_leg_e164,
      env.telephony.exotelAgentLeg
    ),
  };
}
