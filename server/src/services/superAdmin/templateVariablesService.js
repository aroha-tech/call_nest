/**
 * Super Admin CRUD for template_variables (system-level, no tenant).
 */

import { query } from '../../config/db.js';

const MODULES = ['contact', 'agent', 'company', 'system', 'link'];

export async function findAll({ search = '', includeInactive = false, page = 1, limit = 20 } = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  const whereClauses = [];
  const params = [];

  if (!includeInactive) {
    whereClauses.push('is_active = 1');
  }

  if (search) {
    whereClauses.push('(variable_key LIKE ? OR variable_label LIKE ? OR module LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRows = await query(
    `SELECT COUNT(*) as total FROM template_variables ${whereSQL}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  // LIMIT/OFFSET must be literals (MySQL prepared statement quirk); safe - we use parseInt above
  const data = await query(
    `SELECT * FROM template_variables ${whereSQL} ORDER BY module, variable_key LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function findById(id) {
  const rows = await query('SELECT * FROM template_variables WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function findByKey(variableKey) {
  const rows = await query('SELECT * FROM template_variables WHERE variable_key = ?', [
    variableKey,
  ]);
  return rows[0] || null;
}

export function getModules() {
  return MODULES;
}

export async function create(data) {
  const {
    variable_key,
    variable_label,
    module,
    source_table = null,
    source_column = null,
    fallback_value = null,
    sample_value = null,
    description = null,
    is_active = 1,
  } = data;

  if (!variable_key || !variable_label || !module) {
    const err = new Error('variable_key, variable_label and module are required');
    err.status = 400;
    throw err;
  }

  if (!MODULES.includes(module)) {
    const err = new Error(`module must be one of: ${MODULES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const existing = await findByKey(variable_key);
  if (existing) {
    const err = new Error('Variable key already exists');
    err.status = 409;
    throw err;
  }

  const result = await query(
    `INSERT INTO template_variables (variable_key, variable_label, module, source_table, source_column, fallback_value, sample_value, description, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      variable_key.trim(),
      variable_label.trim(),
      module,
      source_table || null,
      source_column || null,
      fallback_value || null,
      sample_value != null && sample_value !== '' ? String(sample_value).trim() : null,
      description || null,
      is_active ? 1 : 0,
    ]
  );

  return findById(result.insertId);
}

export async function update(id, data) {
  const row = await findById(id);
  if (!row) {
    const err = new Error('Template variable not found');
    err.status = 404;
    throw err;
  }

  const {
    variable_label,
    module,
    source_table,
    source_column,
    fallback_value,
    sample_value,
    description,
    is_active,
  } = data;

  const updates = [];
  const params = [];

  if (variable_label !== undefined) {
    updates.push('variable_label = ?');
    params.push(variable_label.trim());
  }
  if (module !== undefined) {
    if (!MODULES.includes(module)) {
      const err = new Error(`module must be one of: ${MODULES.join(', ')}`);
      err.status = 400;
      throw err;
    }
    updates.push('module = ?');
    params.push(module);
  }
  if (source_table !== undefined) {
    updates.push('source_table = ?');
    params.push(source_table || null);
  }
  if (source_column !== undefined) {
    updates.push('source_column = ?');
    params.push(source_column || null);
  }
  if (fallback_value !== undefined) {
    updates.push('fallback_value = ?');
    params.push(fallback_value || null);
  }
  if (sample_value !== undefined) {
    updates.push('sample_value = ?');
    params.push(sample_value != null && sample_value !== '' ? String(sample_value).trim() : null);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description || null);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) return row;

  params.push(id);
  await query(`UPDATE template_variables SET ${updates.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export async function toggleActive(id) {
  const row = await findById(id);
  if (!row) {
    const err = new Error('Template variable not found');
    err.status = 404;
    throw err;
  }
  const newStatus = row.is_active === 1 ? 0 : 1;
  await query('UPDATE template_variables SET is_active = ? WHERE id = ?', [newStatus, id]);
  return findById(id);
}

export async function remove(id) {
  const row = await findById(id);
  if (!row) {
    const err = new Error('Template variable not found');
    err.status = 404;
    throw err;
  }
  await query('DELETE FROM template_variables WHERE id = ?', [id]);
  return { success: true };
}
