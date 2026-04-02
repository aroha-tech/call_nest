import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';

/**
 * Clone default dialing sets and dispositions to a tenant
 * Called during tenant registration
 * 
 * Logic:
 * 1. Try to find dialing sets for the specific industry
 * 2. If none found, fallback to "All Industries" (industry_id IS NULL)
 * 3. Clone all dispositions linked to those dialing sets
 * 4. Clone the dialing set -> disposition mappings
 * 5. Actions are copied via default_dispositions.actions JSON into dispositions.actions
 * 6. Mark the first dialing set with is_default = 1 as default, or first one if none marked
 */
export async function cloneDefaultsForTenant(tenantId, industryId, createdBy = null) {
  // Step 1: Find dialing sets for the specific industry
  let dialingSets = await query(
    `SELECT * FROM default_dialing_sets 
     WHERE industry_id = ? AND is_active = 1
     ORDER BY is_default DESC, created_at ASC`,
    [industryId]
  );

  // Step 2: If no industry-specific dialing sets, fallback to "All Industries"
  if (dialingSets.length === 0) {
    dialingSets = await query(
      `SELECT * FROM default_dialing_sets 
       WHERE industry_id IS NULL AND is_active = 1
       ORDER BY is_default DESC, created_at ASC`,
      []
    );
  }

  // If still no dialing sets found, nothing to clone
  if (dialingSets.length === 0) {
    console.log(`No default dialing sets found for tenant ${tenantId}, industry ${industryId}`);
    return { dialingSetsCloned: 0, dispositionsCloned: 0 };
  }

  // Get the industry_id that we're actually using (for dispositions)
  const sourceIndustryId = dialingSets[0].industry_id;

  // Step 3: Find all dispositions for the same industry (or all industries)
  let defaultDispositions;
  if (sourceIndustryId) {
    defaultDispositions = await query(
      `SELECT * FROM default_dispositions 
       WHERE industry_id = ? AND is_active = 1`,
      [sourceIndustryId]
    );
  } else {
    defaultDispositions = await query(
      `SELECT * FROM default_dispositions 
       WHERE industry_id IS NULL AND is_active = 1`,
      []
    );
  }

  // Create a map of default_disposition_id -> new tenant disposition_id
  const dispositionIdMap = new Map();

  // Step 4: Clone all dispositions (including actions JSON and is_connected).
  // contact_status_id and contact_temperature_id are nullable in dispositions; pass through as-is.
  for (const defaultDispo of defaultDispositions) {
    const newDispoId = uuidv4();
    const actionsJson =
      defaultDispo.actions == null
        ? null
        : typeof defaultDispo.actions === 'string'
          ? defaultDispo.actions
          : JSON.stringify(defaultDispo.actions);
    const isConnected = defaultDispo.is_connected === 1 || defaultDispo.is_connected === true ? 1 : 0;

    await query(
      `INSERT INTO dispositions 
       (id, tenant_id, dispo_type_id, contact_status_id, contact_temperature_id, 
        name, code, next_action, is_connected, actions, created_from_default_id, is_active, is_system_generated, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [
        newDispoId,
        tenantId,
        defaultDispo.dispo_type_id,
        defaultDispo.contact_status_id ?? null,
        defaultDispo.contact_temperature_id ?? null,
        defaultDispo.name,
        defaultDispo.code,
        defaultDispo.next_action ?? null,
        isConnected,
        actionsJson,
        defaultDispo.id,
        createdBy
      ]
    );

    dispositionIdMap.set(defaultDispo.id, newDispoId);
  }

  // Step 5: Clone dialing sets and their disposition mappings (tenant has no team-wide default; agents use users.default_dialing_set_id)
  for (const dialingSet of dialingSets) {
    const newDialingSetId = uuidv4();

    await query(
      `INSERT INTO dialing_sets 
       (id, tenant_id, name, description, is_default, is_active, is_system_generated, created_from_default_id, created_by)
       VALUES (?, ?, ?, ?, 0, 1, 1, ?, ?)`,
      [
        newDialingSetId,
        tenantId,
        dialingSet.name,
        dialingSet.description,
        dialingSet.id,
        createdBy
      ]
    );

    // Clone dialing set dispositions mappings
    const dialingSetDispositions = await query(
      `SELECT * FROM default_dialing_set_dispositions 
       WHERE default_dialing_set_id = ?
       ORDER BY order_index ASC`,
      [dialingSet.id]
    );

    for (const dsd of dialingSetDispositions) {
      const newDispoId = dispositionIdMap.get(dsd.default_disposition_id);
      if (newDispoId) {
        await query(
          `INSERT INTO dialing_set_dispositions 
           (id, tenant_id, dialing_set_id, disposition_id, order_index)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), tenantId, newDialingSetId, newDispoId, dsd.order_index]
        );
      }
    }
  }

  return {
    dialingSetsCloned: dialingSets.length,
    dispositionsCloned: dispositionIdMap.size,
  };
}
