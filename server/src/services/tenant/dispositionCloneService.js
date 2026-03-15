import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

/**
 * Clone all default dispositions and dialing sets for an industry to a tenant
 * @param {number} tenantId - Target tenant ID
 * @param {string} industryId - Source industry ID
 * @param {number} createdBy - User ID creating the records
 * @param {boolean} includeDialingSets - Whether to also clone dialing sets
 * @returns {Object} Summary of cloned items
 */
export async function cloneDefaultsToTenant(tenantId, industryId, createdBy, includeDialingSets = true) {
  const defaultDispositions = await query(
    'SELECT * FROM default_dispositions WHERE industry_id = ? AND is_active = 1',
    [industryId]
  );
  
  if (defaultDispositions.length === 0) {
    const err = new Error('No default dispositions found for this industry');
    err.status = 404;
    throw err;
  }
  
  const dispositionIdMap = new Map();
  const clonedDispositions = [];
  
  for (const dd of defaultDispositions) {
    const existing = await query(
      'SELECT id FROM dispositions WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
      [tenantId, dd.code]
    );
    
    if (existing.length > 0) {
      dispositionIdMap.set(dd.id, existing[0].id);
      continue;
    }
    
    const newId = generateUUID();
    await query(
      `INSERT INTO dispositions 
       (id, tenant_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, created_from_default_id, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newId, tenantId, dd.dispo_type_id, dd.contact_status_id, dd.contact_temperature_id, dd.name, dd.code, dd.next_action, dd.id, createdBy, createdBy]
    );
    
    dispositionIdMap.set(dd.id, newId);
    clonedDispositions.push({ id: newId, name: dd.name, code: dd.code });
    
    const defaultActions = await query(
      'SELECT * FROM default_disposition_actions_map WHERE default_disposition_id = ? ORDER BY priority_order',
      [dd.id]
    );
    
    for (const action of defaultActions) {
      const actionId = generateUUID();
      await query(
        `INSERT INTO disposition_actions_map (id, tenant_id, disposition_id, action_id, priority_order)
         VALUES (?, ?, ?, ?, ?)`,
        [actionId, tenantId, newId, action.action_id, action.priority_order]
      );
    }
  }
  
  const result = {
    dispositions_cloned: clonedDispositions.length,
    dispositions: clonedDispositions,
    dialing_sets_cloned: 0,
    dialing_sets: []
  };
  
  if (includeDialingSets) {
    const defaultDialingSets = await query(
      'SELECT * FROM default_dialing_sets WHERE industry_id = ? AND is_active = 1',
      [industryId]
    );
    
    for (const dds of defaultDialingSets) {
      const newSetId = generateUUID();
      await query(
        `INSERT INTO dialing_sets 
         (id, tenant_id, name, description, is_default, is_active, is_system_generated, created_from_default_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
        [newSetId, tenantId, dds.name, dds.description, dds.is_default, dds.id, createdBy, createdBy]
      );
      
      result.dialing_sets.push({ id: newSetId, name: dds.name });
      result.dialing_sets_cloned++;
      
      const setDispositions = await query(
        'SELECT * FROM default_dialing_set_dispositions WHERE default_dialing_set_id = ? ORDER BY order_index',
        [dds.id]
      );
      
      for (const sd of setDispositions) {
        const tenantDispoId = dispositionIdMap.get(sd.default_disposition_id);
        if (tenantDispoId) {
          const mappingId = generateUUID();
          await query(
            `INSERT INTO dialing_set_dispositions (id, tenant_id, dialing_set_id, disposition_id, order_index)
             VALUES (?, ?, ?, ?, ?)`,
            [mappingId, tenantId, newSetId, tenantDispoId, sd.order_index]
          );
        }
      }
    }
  }
  
  return result;
}

/**
 * Clone a specific default dialing set to tenant
 * @param {number} tenantId - Target tenant ID
 * @param {string} defaultDialingSetId - Source default dialing set ID
 * @param {number} createdBy - User ID creating the records
 * @returns {Object} Cloned dialing set info
 */
export async function cloneDialingSet(tenantId, defaultDialingSetId, createdBy) {
  const [defaultSet] = await query(
    'SELECT * FROM default_dialing_sets WHERE id = ? AND is_active = 1',
    [defaultDialingSetId]
  );
  
  if (!defaultSet) {
    const err = new Error('Default dialing set not found');
    err.status = 404;
    throw err;
  }
  
  const newSetId = generateUUID();
  await query(
    `INSERT INTO dialing_sets 
     (id, tenant_id, name, description, is_default, is_active, is_system_generated, created_from_default_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?)`,
    [newSetId, tenantId, defaultSet.name, defaultSet.description, defaultSet.id, createdBy, createdBy]
  );
  
  const setDispositions = await query(
    `SELECT ddsd.*, dd.code as disposition_code
     FROM default_dialing_set_dispositions ddsd
     JOIN default_dispositions dd ON ddsd.default_disposition_id = dd.id
     WHERE ddsd.default_dialing_set_id = ?
     ORDER BY ddsd.order_index`,
    [defaultDialingSetId]
  );
  
  let linkedCount = 0;
  const missingDispositions = [];
  
  for (const sd of setDispositions) {
    const [tenantDispo] = await query(
      'SELECT id FROM dispositions WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
      [tenantId, sd.disposition_code]
    );
    
    if (tenantDispo) {
      const mappingId = generateUUID();
      await query(
        `INSERT INTO dialing_set_dispositions (id, tenant_id, dialing_set_id, disposition_id, order_index)
         VALUES (?, ?, ?, ?, ?)`,
        [mappingId, tenantId, newSetId, tenantDispo.id, sd.order_index]
      );
      linkedCount++;
    } else {
      missingDispositions.push(sd.disposition_code);
    }
  }
  
  const [clonedSet] = await query(
    'SELECT * FROM dialing_sets WHERE id = ?',
    [newSetId]
  );
  
  return {
    dialing_set: clonedSet,
    dispositions_linked: linkedCount,
    missing_dispositions: missingDispositions
  };
}

/**
 * Clone a specific default disposition to tenant
 * @param {number} tenantId - Target tenant ID
 * @param {string} defaultDispositionId - Source default disposition ID
 * @param {number} createdBy - User ID creating the records
 * @returns {Object} Cloned disposition info
 */
export async function cloneDisposition(tenantId, defaultDispositionId, createdBy) {
  const [defaultDispo] = await query(
    'SELECT * FROM default_dispositions WHERE id = ? AND is_active = 1',
    [defaultDispositionId]
  );
  
  if (!defaultDispo) {
    const err = new Error('Default disposition not found');
    err.status = 404;
    throw err;
  }
  
  const [existing] = await query(
    'SELECT id FROM dispositions WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
    [tenantId, defaultDispo.code]
  );
  
  if (existing) {
    const err = new Error('Disposition with this code already exists for this tenant');
    err.status = 409;
    throw err;
  }
  
  const newId = generateUUID();
  await query(
    `INSERT INTO dispositions 
     (id, tenant_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, created_from_default_id, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [newId, tenantId, defaultDispo.dispo_type_id, defaultDispo.contact_status_id, defaultDispo.contact_temperature_id, defaultDispo.name, defaultDispo.code, defaultDispo.next_action, defaultDispo.id, createdBy, createdBy]
  );
  
  const defaultActions = await query(
    'SELECT * FROM default_disposition_actions_map WHERE default_disposition_id = ? ORDER BY priority_order',
    [defaultDispositionId]
  );
  
  for (const action of defaultActions) {
    const actionId = generateUUID();
    await query(
      `INSERT INTO disposition_actions_map (id, tenant_id, disposition_id, action_id, priority_order)
       VALUES (?, ?, ?, ?, ?)`,
      [actionId, tenantId, newId, action.action_id, action.priority_order]
    );
  }
  
  const [clonedDispo] = await query(
    `SELECT d.*, 
            dt.name as dispo_type_name,
            cs.name as contact_status_name,
            ct.name as contact_temperature_name
     FROM dispositions d
     LEFT JOIN dispo_types_master dt ON d.dispo_type_id = dt.id
     LEFT JOIN contact_status_master cs ON d.contact_status_id = cs.id
     LEFT JOIN contact_temperature_master ct ON d.contact_temperature_id = ct.id
     WHERE d.id = ?`,
    [newId]
  );
  
  return {
    disposition: clonedDispo,
    actions_cloned: defaultActions.length
  };
}
