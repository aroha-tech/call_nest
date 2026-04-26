import { query } from '../../config/db.js';

export async function upsertEntityMapping(
  tenantId,
  appId,
  {
    external_crm,
    entity_type,
    external_id,
    internal_id,
    metadata_json = null,
  },
  userId = null
) {
  const externalCrm = String(external_crm || '').trim().toLowerCase();
  const entityType = String(entity_type || '').trim().toLowerCase();
  const externalId = String(external_id || '').trim();
  const internalId = Number(internal_id);
  if (!externalCrm || !entityType || !externalId || !Number.isFinite(internalId) || internalId <= 0) {
    const err = new Error('Invalid mapping payload');
    err.status = 400;
    throw err;
  }

  await query(
    `INSERT INTO integration_entity_mappings (
      tenant_id, integration_app_id, external_crm, entity_type, external_id, internal_id, metadata_json, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      internal_id = VALUES(internal_id),
      metadata_json = VALUES(metadata_json),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP`,
    [tenantId, appId, externalCrm, entityType, externalId, internalId, metadata_json ? JSON.stringify(metadata_json) : null, userId, userId]
  );
}

export async function getInternalId(tenantId, appId, externalCrm, entityType, externalId) {
  const [row] = await query(
    `SELECT internal_id
     FROM integration_entity_mappings
     WHERE tenant_id = ?
       AND integration_app_id = ?
       AND external_crm = ?
       AND entity_type = ?
       AND external_id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, appId, String(externalCrm || '').trim().toLowerCase(), String(entityType || '').trim().toLowerCase(), String(externalId || '').trim()]
  );
  return row?.internal_id ? Number(row.internal_id) : null;
}

export async function getExternalId(tenantId, appId, externalCrm, entityType, internalId) {
  const [row] = await query(
    `SELECT external_id
     FROM integration_entity_mappings
     WHERE tenant_id = ?
       AND integration_app_id = ?
       AND external_crm = ?
       AND entity_type = ?
       AND internal_id = ?
       AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [tenantId, appId, String(externalCrm || '').trim().toLowerCase(), String(entityType || '').trim().toLowerCase(), Number(internalId)]
  );
  return row?.external_id || null;
}
