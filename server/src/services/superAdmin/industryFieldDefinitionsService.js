import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

const ALLOWED_TYPES = new Set([
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'multiselect_dropdown',
]);

export async function listByIndustryId(industryId) {
  return query(
    `SELECT id, industry_id, field_key, label, type, options_json, sort_order,
            is_required, is_optional, is_active, created_at, updated_at
     FROM industry_field_definitions
     WHERE industry_id = ?
     ORDER BY sort_order ASC, label ASC`,
    [industryId]
  );
}

export async function findById(id) {
  const [row] = await query(
    `SELECT id, industry_id, field_key, label, type, options_json, sort_order,
            is_required, is_optional, is_active, created_at, updated_at
     FROM industry_field_definitions WHERE id = ?`,
    [id]
  );
  return row || null;
}

function normalizeFieldKey(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return s;
}

export async function create(industryId, data, userId) {
  const {
    field_key,
    label,
    type,
    options,
    sort_order = 0,
    is_required = 0,
    is_optional = 0,
    is_active = 1,
  } = data || {};

  const key = normalizeFieldKey(field_key);
  if (!key || key.length < 2) {
    const err = new Error('field_key must be at least 2 letters (a-z, 0-9, _)');
    err.status = 400;
    throw err;
  }
  if (!label || !String(label).trim()) {
    const err = new Error('label is required');
    err.status = 400;
    throw err;
  }
  if (!ALLOWED_TYPES.has(type)) {
    const err = new Error(`type must be one of: ${[...ALLOWED_TYPES].join(', ')}`);
    err.status = 400;
    throw err;
  }

  const [dup] = await query(
    `SELECT id FROM industry_field_definitions WHERE industry_id = ? AND field_key = ?`,
    [industryId, key]
  );
  if (dup) {
    const err = new Error('field_key already exists for this industry');
    err.status = 409;
    throw err;
  }

  const id = generateUUID();
  const optionsJson =
    type === 'select' || type === 'multiselect' || type === 'multiselect_dropdown'
      ? JSON.stringify(Array.isArray(options) ? options : [])
      : null;

  await query(
    `INSERT INTO industry_field_definitions (
       id, industry_id, field_key, label, type, options_json, sort_order,
       is_required, is_optional, is_active, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      industryId,
      key,
      String(label).trim(),
      type,
      optionsJson,
      Number(sort_order) || 0,
      is_required ? 1 : 0,
      is_optional ? 1 : 0,
      is_active ? 1 : 0,
      userId,
      userId,
    ]
  );

  return findById(id);
}

export async function update(id, data, userId) {
  const existing = await findById(id);
  if (!existing) {
    const err = new Error('Field definition not found');
    err.status = 404;
    throw err;
  }

  const {
    label,
    type,
    options,
    sort_order,
    is_required,
    is_optional,
    is_active,
  } = data || {};

  const updates = [];
  const params = [];

  if (label !== undefined) {
    updates.push('label = ?');
    params.push(String(label).trim());
  }
  if (type !== undefined) {
    if (!ALLOWED_TYPES.has(type)) {
      const err = new Error(`type must be one of: ${[...ALLOWED_TYPES].join(', ')}`);
      err.status = 400;
      throw err;
    }
    updates.push('type = ?');
    params.push(type);
  }
  if (options !== undefined) {
    updates.push('options_json = ?');
    params.push(JSON.stringify(Array.isArray(options) ? options : []));
  }
  if (sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(Number(sort_order) || 0);
  }
  if (is_required !== undefined) {
    updates.push('is_required = ?');
    params.push(is_required ? 1 : 0);
  }
  if (is_optional !== undefined) {
    updates.push('is_optional = ?');
    params.push(is_optional ? 1 : 0);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_by = ?');
  params.push(userId);
  params.push(id);

  await query(`UPDATE industry_field_definitions SET ${updates.join(', ')} WHERE id = ?`, params);

  const next = await findById(id);
  const t = next?.type;
  if (t && !['select', 'multiselect', 'multiselect_dropdown'].includes(t)) {
    await query(`UPDATE industry_field_definitions SET options_json = NULL WHERE id = ?`, [id]);
  }

  return findById(id);
}

export async function remove(id) {
  const existing = await findById(id);
  if (!existing) {
    const err = new Error('Field definition not found');
    err.status = 404;
    throw err;
  }
  await query(`DELETE FROM industry_field_definitions WHERE id = ?`, [id]);
  return { success: true };
}
