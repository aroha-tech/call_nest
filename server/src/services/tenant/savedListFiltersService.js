import { query } from '../../config/db.js';

const ENTITY_TYPES = new Set(['lead', 'contact', 'call_history']);

function assertEntityType(entityType) {
  const t = String(entityType || '').trim().toLowerCase();
  if (!ENTITY_TYPES.has(t)) {
    const err = new Error('Invalid entity_type');
    err.status = 400;
    throw err;
  }
  return t;
}

export async function listSavedFilters(tenantId, userId, entityType) {
  const et = assertEntityType(entityType);
  return query(
    `SELECT id, tenant_id, user_id, entity_type, name, filter_json, created_at, updated_at
     FROM tenant_saved_list_filters
     WHERE tenant_id = ? AND user_id = ? AND entity_type = ? AND deleted_at IS NULL
     ORDER BY name ASC, id ASC`,
    [tenantId, userId, et]
  );
}

export async function createSavedFilter(tenantId, user, { entity_type, name, filter_json } = {}) {
  const et = assertEntityType(entity_type);
  const n = String(name || '').trim();
  if (!n || n.length > 255) {
    const err = new Error('name is required (max 255 characters)');
    err.status = 400;
    throw err;
  }
  if (filter_json === undefined || filter_json === null || (typeof filter_json === 'object' && filter_json === null)) {
    const err = new Error('filter_json is required');
    err.status = 400;
    throw err;
  }
  const jsonStr = typeof filter_json === 'string' ? filter_json : JSON.stringify(filter_json);
  try {
    JSON.parse(jsonStr);
  } catch {
    const err = new Error('filter_json must be valid JSON');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO tenant_saved_list_filters
      (tenant_id, user_id, entity_type, name, filter_json, created_by, updated_by)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
    [tenantId, user.id, et, n, jsonStr, user.id, user.id]
  );

  const [row] = await query(
    `SELECT id, tenant_id, user_id, entity_type, name, filter_json, created_at, updated_at
     FROM tenant_saved_list_filters
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [result.insertId, tenantId]
  );
  return row;
}

export async function updateSavedFilter(tenantId, user, id, { name, filter_json } = {}) {
  const fid = parseInt(id, 10);
  if (!fid) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id, user_id FROM tenant_saved_list_filters
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [fid, tenantId]
  );
  if (!row) return null;
  if (Number(row.user_id) !== Number(user.id) && user.role !== 'admin') {
    const err = new Error('You can only update your own saved filters');
    err.status = 403;
    throw err;
  }

  const sets = [];
  const params = [];

  if (name !== undefined) {
    const n = String(name || '').trim();
    if (!n || n.length > 255) {
      const err = new Error('name must be 1–255 characters');
      err.status = 400;
      throw err;
    }
    sets.push('name = ?');
    params.push(n);
  }

  if (filter_json !== undefined) {
    const jsonStr = typeof filter_json === 'string' ? filter_json : JSON.stringify(filter_json);
    try {
      JSON.parse(jsonStr);
    } catch {
      const err = new Error('filter_json must be valid JSON');
      err.status = 400;
      throw err;
    }
    sets.push('filter_json = CAST(? AS JSON)');
    params.push(jsonStr);
  }

  if (sets.length === 0) {
    const err = new Error('Provide name and/or filter_json to update');
    err.status = 400;
    throw err;
  }

  sets.push('updated_by = ?');
  params.push(user.id);
  params.push(fid, tenantId);

  await query(
    `UPDATE tenant_saved_list_filters
     SET ${sets.join(', ')}
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    params
  );

  const [updated] = await query(
    `SELECT id, tenant_id, user_id, entity_type, name, filter_json, created_at, updated_at
     FROM tenant_saved_list_filters
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [fid, tenantId]
  );
  return updated;
}

export async function softDeleteSavedFilter(tenantId, user, id) {
  const fid = parseInt(id, 10);
  if (!fid) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id, user_id FROM tenant_saved_list_filters
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [fid, tenantId]
  );
  if (!row) return false;
  if (Number(row.user_id) !== Number(user.id) && user.role !== 'admin') {
    const err = new Error('You can only delete your own saved filters');
    err.status = 403;
    throw err;
  }
  await query(
    `UPDATE tenant_saved_list_filters
     SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [user.id, user.id, fid, tenantId]
  );
  return true;
}
