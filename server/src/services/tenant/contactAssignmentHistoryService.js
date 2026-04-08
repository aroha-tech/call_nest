import { query } from '../../config/db.js';

/**
 * Append-only assignment history row.
 * Store both previous and next values so reports can compute daily flow.
 */
export async function recordChange(
  tenantId,
  {
    contact_id,
    changed_by_user_id = null,
    change_source = 'manual',
    change_reason = null,
    from_manager_id = null,
    to_manager_id = null,
    from_assigned_user_id = null,
    to_assigned_user_id = null,
    from_campaign_id = null,
    to_campaign_id = null,
  } = {}
) {
  if (!tenantId || !contact_id) return;

  await query(
    `INSERT INTO contact_assignment_history (
       tenant_id,
       contact_id,
       changed_by_user_id,
       change_source,
       change_reason,
       from_manager_id,
       to_manager_id,
       from_assigned_user_id,
       to_assigned_user_id,
       from_campaign_id,
       to_campaign_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      contact_id,
      changed_by_user_id,
      change_source,
      change_reason,
      from_manager_id,
      to_manager_id,
      from_assigned_user_id,
      to_assigned_user_id,
      from_campaign_id,
      to_campaign_id,
    ]
  );
}

