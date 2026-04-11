import { query } from '../../config/db.js';

/**
 * Append-only assignment history rows in one round-trip (bulk assign / unassign).
 */
export async function recordChangesBulk(tenantId, rows) {
  if (!tenantId || !Array.isArray(rows) || rows.length === 0) return;

  const normalized = rows
    .filter((r) => r && r.contact_id)
    .map((r) => ({
      contact_id: r.contact_id,
      changed_by_user_id: r.changed_by_user_id ?? null,
      change_source: r.change_source ?? 'manual',
      change_reason: r.change_reason ?? null,
      from_manager_id: r.from_manager_id ?? null,
      to_manager_id: r.to_manager_id ?? null,
      from_assigned_user_id: r.from_assigned_user_id ?? null,
      to_assigned_user_id: r.to_assigned_user_id ?? null,
      from_campaign_id: r.from_campaign_id ?? null,
      to_campaign_id: r.to_campaign_id ?? null,
    }));

  if (normalized.length === 0) return;

  const placeholders = normalized.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = normalized.flatMap((r) => [
    tenantId,
    r.contact_id,
    r.changed_by_user_id,
    r.change_source,
    r.change_reason,
    r.from_manager_id,
    r.to_manager_id,
    r.from_assigned_user_id,
    r.to_assigned_user_id,
    r.from_campaign_id,
    r.to_campaign_id,
  ]);

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
     ) VALUES ${placeholders}`,
    params
  );
}

/**
 * Append-only assignment history row.
 * Store both previous and next values so reports can compute daily flow.
 */
export async function recordChange(tenantId, payload = {}) {
  if (!tenantId || !payload.contact_id) return;
  await recordChangesBulk(tenantId, [payload]);
}

