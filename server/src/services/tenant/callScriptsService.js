/**
 * Call scripts are tenant-owned. Soft delete. Variable detection and validation on create/update.
 */

import { query } from '../../config/db.js';

function parseVariablesUsed(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
}
import { extractVariables } from '../templateEngine/variableDetector.js';
import * as variableValidator from '../templateEngine/variableValidator.js';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT id, tenant_id, script_name, script_body, variables_used, status, is_default, created_by, created_at, updated_by, updated_at
    FROM call_scripts
    WHERE tenant_id = ? AND is_deleted = 0
  `;
  const params = [tenantId];

  if (!includeInactive) {
    sql += ' AND status = 1';
  }

  sql += ' ORDER BY script_name ASC';

  const rows = await query(sql, params);
  return rows.map((row) => ({
    ...row,
    variables_used: parseVariablesUsed(row.variables_used),
  }));
}

/**
 * Paginated list with search (script_name) and includeInactive
 */
export async function findAllPaginated(tenantId, { search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereClauses = ['tenant_id = ?', 'is_deleted = 0'];
  const params = [tenantId];

  if (!includeInactive) {
    whereClauses.push('status = 1');
  }

  if (search && search.trim()) {
    whereClauses.push('script_name LIKE ?');
    params.push(`%${search.trim()}%`);
  }

  const whereSQL = whereClauses.join(' AND ');

  const [countRow] = await query(`SELECT COUNT(*) as total FROM call_scripts WHERE ${whereSQL}`, params);
  const total = countRow.total;

  const rows = await query(
    `SELECT id, tenant_id, script_name, script_body, variables_used, status, is_default, created_by, created_at, updated_by, updated_at
     FROM call_scripts
     WHERE ${whereSQL}
     ORDER BY script_name ASC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    data: rows.map((row) => ({
      ...row,
      variables_used: parseVariablesUsed(row.variables_used),
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function findById(tenantId, id) {
  const rows = await query(
    'SELECT * FROM call_scripts WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
    [id, tenantId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    variables_used: parseVariablesUsed(row.variables_used),
  };
}

/**
 * Detect variables in script_body, validate against template_variables, return { variables_used, validationError }.
 */
async function detectAndValidateVariables(scriptBody) {
  const keys = extractVariables(scriptBody || '');
  if (keys.length === 0) {
    return { variables_used: [], validationError: null };
  }
  const result = await variableValidator.validateVariables(keys);
  if (!result.valid) {
    return { variables_used: null, validationError: result.error };
  }
  return { variables_used: keys, validationError: null };
}

export async function create(tenantId, data, createdBy) {
  const { script_name, script_body, status = 1 } = data;

  if (!script_name || !script_body) {
    const err = new Error('script_name and script_body are required');
    err.status = 400;
    throw err;
  }

  const { variables_used, validationError } = await detectAndValidateVariables(script_body);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    err.invalidVariables = true;
    throw err;
  }

  const variablesUsedJson = JSON.stringify(variables_used || []);

  // One script per tenant is default: first created gets is_default=1; if none is default, new one becomes default
  const [countRow] = await query(
    'SELECT COUNT(*) AS total FROM call_scripts WHERE tenant_id = ? AND is_deleted = 0',
    [tenantId]
  );
  const [defaultRow] = await query(
    'SELECT id FROM call_scripts WHERE tenant_id = ? AND is_deleted = 0 AND is_default = 1 LIMIT 1',
    [tenantId]
  );
  const isDefault = countRow.total === 0 || !defaultRow?.id ? 1 : 0;

  const result = await query(
    `INSERT INTO call_scripts (tenant_id, script_name, script_body, variables_used, status, is_default, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, script_name.trim(), script_body, variablesUsedJson, status ? 1 : 0, isDefault, createdBy, createdBy]
  );

  return findById(tenantId, result.insertId);
}

export async function update(tenantId, id, data, updatedBy) {
  const script = await findById(tenantId, id);
  if (!script) {
    const err = new Error('Call script not found');
    err.status = 404;
    throw err;
  }

  const { script_name, script_body, status, is_default } = data;

  let variables_used = script.variables_used;
  if (script_body !== undefined) {
    const out = await detectAndValidateVariables(script_body);
    if (out.validationError) {
      const err = new Error(out.validationError);
      err.status = 400;
      err.invalidVariables = true;
      throw err;
    }
    variables_used = out.variables_used || [];
  }

  if (is_default === 1) {
    await query(
      'UPDATE call_scripts SET is_default = 0 WHERE tenant_id = ? AND is_deleted = 0',
      [tenantId]
    );
  }

  const updates = [];
  const params = [];

  if (script_name !== undefined) {
    updates.push('script_name = ?');
    params.push(script_name.trim());
  }
  if (script_body !== undefined) {
    updates.push('script_body = ?');
    params.push(script_body);
  }
  if (variables_used !== undefined) {
    updates.push('variables_used = ?');
    params.push(JSON.stringify(variables_used));
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status ? 1 : 0);
  }
  if (is_default !== undefined) {
    updates.push('is_default = ?');
    params.push(is_default ? 1 : 0);
  }

  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);

  await query(
    `UPDATE call_scripts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );

  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const script = await findById(tenantId, id);
  if (!script) {
    const err = new Error('Call script not found');
    err.status = 404;
    throw err;
  }

  if (script.is_default === 1) {
    const err = new Error('Default script cannot be deleted. Set another script as default first.');
    err.status = 400;
    err.code = 'DEFAULT_SCRIPT_CANNOT_DELETE';
    throw err;
  }

  await query(
    'UPDATE call_scripts SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}
