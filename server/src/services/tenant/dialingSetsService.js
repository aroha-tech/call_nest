import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

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
  
  sql += ' ORDER BY ds.is_default DESC, ds.name ASC';
  
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
    is_default = 0,
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

  const [countRow] = await query(
    'SELECT COUNT(*) AS total FROM dialing_sets WHERE tenant_id = ? AND is_deleted = 0',
    [tenantId]
  );
  const [defaultRow] = await query(
    'SELECT id FROM dialing_sets WHERE tenant_id = ? AND is_deleted = 0 AND is_default = 1 LIMIT 1',
    [tenantId]
  );
  const shouldBeDefault = is_default || countRow.total === 0 || !defaultRow?.id;

  if (shouldBeDefault) {
    await query(
      'UPDATE dialing_sets SET is_default = 0 WHERE tenant_id = ? AND is_default = 1 AND is_deleted = 0',
      [tenantId]
    );
  }

  await query(
    `INSERT INTO dialing_sets 
     (id, tenant_id, name, description, is_default, is_active, is_system_generated, created_from_default_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, description, shouldBeDefault ? 1 : 0, is_active, is_system_generated, created_from_default_id, createdBy, createdBy]
  );
  
  return findById(tenantId, id);
}

export async function update(tenantId, id, data, updatedBy) {
  const dialingSet = await findById(tenantId, id);
  if (!dialingSet) {
    const err = new Error('Dialing set not found');
    err.status = 404;
    throw err;
  }

  const { name, description, is_default, is_active } = data;

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

  if (is_default === 1) {
    await query(
      'UPDATE dialing_sets SET is_default = 0 WHERE tenant_id = ? AND is_default = 1 AND id != ? AND is_deleted = 0',
      [tenantId, id]
    );
  }
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (is_default !== undefined) { updates.push('is_default = ?'); params.push(is_default); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);
  
  await query(`UPDATE dialing_sets SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const dialingSet = await findById(tenantId, id);
  if (!dialingSet) {
    const err = new Error('Dialing set not found');
    err.status = 404;
    throw err;
  }
  if (dialingSet.is_default === 1) {
    const err = new Error('Cannot delete: this dialing set is marked as default. Set another set as default first.');
    err.status = 409;
    throw err;
  }

  await query(
    'UPDATE dialing_sets SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}

export async function setDefault(tenantId, id) {
  const dialingSet = await findById(tenantId, id);
  if (!dialingSet) {
    const err = new Error('Dialing set not found');
    err.status = 404;
    throw err;
  }
  
  await query(
    'UPDATE dialing_sets SET is_default = 0 WHERE tenant_id = ? AND is_default = 1 AND is_deleted = 0',
    [tenantId]
  );
  
  await query(
    'UPDATE dialing_sets SET is_default = 1 WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  
  return findById(tenantId, id);
}
