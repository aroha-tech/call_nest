import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT ds.*, dds.name as created_from_name
    FROM dialing_sets ds
    LEFT JOIN default_dialing_sets dds ON ds.created_from_default_id = dds.id
    WHERE ds.tenant_id = ? AND ds.is_deleted = 0
  `;
  const params = [tenantId];
  
  if (!includeInactive) {
    sql += ' AND ds.is_active = 1';
  }
  
  sql += ' ORDER BY ds.name ASC';
  
  return query(sql, params);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT ds.*, dds.name as created_from_name
     FROM dialing_sets ds
     LEFT JOIN default_dialing_sets dds ON ds.created_from_default_id = dds.id
     WHERE ds.id = ? AND ds.tenant_id = ? AND ds.is_deleted = 0`,
    [id, tenantId]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const id = generateUUID();
  const {
    name,
    description = null,
    is_active = 1,
    is_system_generated = 0,
    created_from_default_id = null
  } = data;

  const [existing] = await query(
    'SELECT id FROM dialing_sets WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_deleted = 0',
    [tenantId, name]
  );
  if (existing) {
    const err = new Error('A dialing set with this name already exists.');
    err.status = 409;
    throw err;
  }

  await query(
    `INSERT INTO dialing_sets 
     (id, tenant_id, name, description, is_default, is_active, is_system_generated, created_from_default_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, description, is_active, is_system_generated, created_from_default_id, createdBy, createdBy]
  );

  const row = await findById(tenantId, id);
  await safeLogTenantActivity(tenantId, createdBy, {
    event_category: 'dialing_set',
    event_type: 'dialing_set.created',
    summary: `Dialing set created: ${name}`,
    entity_type: 'dialing_set',
    payload_json: { dialing_set_id: id },
  });
  return row;
}

export async function update(tenantId, id, data, updatedBy) {
  const dialingSet = await findById(tenantId, id);
  if (!dialingSet) {
    const err = new Error('Dialing set not found');
    err.status = 404;
    throw err;
  }

  const { name, description, is_active } = data;

  if (name !== undefined && name !== dialingSet.name) {
    const [existing] = await query(
      'SELECT id FROM dialing_sets WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND is_deleted = 0',
      [tenantId, name, id]
    );
    if (existing) {
      const err = new Error('A dialing set with this name already exists.');
      err.status = 409;
      throw err;
    }
  }
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);
  
  await query(`UPDATE dialing_sets SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

  const row = await findById(tenantId, id);
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'dialing_set',
    event_type: 'dialing_set.updated',
    summary: `Dialing set updated: ${row?.name || dialingSet.name}`,
    entity_type: 'dialing_set',
    payload_json: { dialing_set_id: id },
  });
  return row;
}

/**
 * @param {{ userId?: number }} [options] - if userId set, block delete when that user’s personal default is this set
 */
export async function remove(tenantId, id, options = {}) {
  const { userId } = options;
  const dialingSet = await findById(tenantId, id);
  if (!dialingSet) {
    const err = new Error('Dialing set not found');
    err.status = 404;
    throw err;
  }

  if (userId != null) {
    const [u] = await query(
      'SELECT default_dialing_set_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
      [userId, tenantId]
    );
    if (u && String(u.default_dialing_set_id ?? '') === String(id ?? '')) {
      const err = new Error(
        'This dialing set is your personal default. Choose another set as your default before deleting it.'
      );
      err.status = 400;
      err.code = 'PERSONAL_DEFAULT_DIALING_SET_CANNOT_DELETE';
      throw err;
    }
  }

  await query(
    'UPDATE dialing_sets SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  const actorId = options?.userId != null ? Number(options.userId) : null;
  await safeLogTenantActivity(tenantId, actorId, {
    event_category: 'dialing_set',
    event_type: 'dialing_set.deleted',
    summary: `Dialing set deleted: ${dialingSet.name}`,
    entity_type: 'dialing_set',
    payload_json: { dialing_set_id: id },
  });
  return { success: true };
}
