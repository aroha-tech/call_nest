/**
 * Call scripts are tenant-owned. Soft delete. Variable detection and validation on create/update.
 */

import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

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

  const result = await query(
    `INSERT INTO call_scripts (tenant_id, script_name, script_body, variables_used, status, is_default, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [tenantId, script_name.trim(), script_body, variablesUsedJson, status ? 1 : 0, createdBy, createdBy]
  );

  const row = await findById(tenantId, result.insertId);
  await safeLogTenantActivity(tenantId, createdBy, {
    event_category: 'call_script',
    event_type: 'call_script.created',
    summary: `Call script created: ${row?.script_name || script_name.trim()}`,
    entity_type: 'call_script',
    entity_id: result.insertId,
  });
  return row;
}

export async function update(tenantId, id, data, updatedBy) {
  const script = await findById(tenantId, id);
  if (!script) {
    const err = new Error('Call script not found');
    err.status = 404;
    throw err;
  }

  const { script_name, script_body, status } = data;

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

  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);

  await query(
    `UPDATE call_scripts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );

  const row = await findById(tenantId, id);
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'call_script',
    event_type: 'call_script.updated',
    summary: `Call script updated: ${row?.script_name || script.script_name}`,
    entity_type: 'call_script',
    entity_id: Number(id),
  });
  return row;
}

/**
 * @param {{ userId?: number }} [options] - if userId set, block delete when that user’s personal default is this script
 */
export async function remove(tenantId, id, options = {}) {
  const { userId } = options;
  const script = await findById(tenantId, id);
  if (!script) {
    const err = new Error('Call script not found');
    err.status = 404;
    throw err;
  }

  if (userId != null) {
    const [u] = await query(
      'SELECT default_call_script_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
      [userId, tenantId]
    );
    if (u && Number(u.default_call_script_id) === Number(id)) {
      const err = new Error(
        'This script is your personal default. Choose another script as your default before deleting it.'
      );
      err.status = 400;
      err.code = 'PERSONAL_DEFAULT_SCRIPT_CANNOT_DELETE';
      throw err;
    }
  }

  await query(
    'UPDATE call_scripts SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  const actorId = options?.userId != null ? Number(options.userId) : null;
  await safeLogTenantActivity(tenantId, actorId, {
    event_category: 'call_script',
    event_type: 'call_script.deleted',
    summary: `Call script deleted: ${script.script_name}`,
    entity_type: 'call_script',
    entity_id: Number(id),
  });
  return { success: true };
}
