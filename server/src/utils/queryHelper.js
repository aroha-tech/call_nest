/**
 * Reusable query helpers with tenant filtering
 * Never allow raw SQL without tenant filter
 */

import { query } from '../config/db.js';

/**
 * Execute query with automatic tenant filtering and soft delete filter
 * @param {string} sql - SQL query with WHERE clause
 * @param {number|null} tenantId - Tenant ID (null for super admin bypass)
 * @param {Array} params - Additional query parameters
 * @param {boolean} includeDeleted - If true, include deleted records (default: false)
 * @returns {Promise<Array>}
 */
export async function queryWithTenant(sql, tenantId, params = [], includeDeleted = false) {
  const sqlUpper = sql.toUpperCase();
  let modifiedSql = sql;
  let modifiedParams = [...params];
  
  // Add soft delete filter (is_deleted = 0) unless includeDeleted is true
  if (!includeDeleted) {
    if (sqlUpper.includes('WHERE')) {
      const whereIndex = sqlUpper.indexOf('WHERE');
      const beforeWhere = sql.substring(0, whereIndex + 5);
      const afterWhere = sql.substring(whereIndex + 5);
      modifiedSql = `${beforeWhere} is_deleted = 0 AND ${afterWhere}`;
    } else {
      modifiedSql = `${sql} WHERE is_deleted = 0`;
    }
  }
  
  // Super admin (tenant_id = 1) can bypass tenant filter
  if (tenantId === 1) {
    return query(modifiedSql, modifiedParams);
  }
  
  // Add tenant filter
  const modifiedSqlUpper = modifiedSql.toUpperCase();
  if (modifiedSqlUpper.includes('WHERE')) {
    const whereIndex = modifiedSqlUpper.indexOf('WHERE');
    const beforeWhere = modifiedSql.substring(0, whereIndex + 5);
    const afterWhere = modifiedSql.substring(whereIndex + 5);
    modifiedSql = `${beforeWhere} tenant_id = ? AND ${afterWhere}`;
    modifiedParams = [tenantId, ...modifiedParams];
  } else {
    modifiedSql = `${modifiedSql} WHERE tenant_id = ?`;
    modifiedParams = [...modifiedParams, tenantId];
  }
  
  return query(modifiedSql, modifiedParams);
}

/**
 * Get one row with tenant filter
 */
export async function findOne(sql, tenantId, params = []) {
  const rows = await queryWithTenant(sql, tenantId, params);
  return rows[0] || null;
}

/**
 * Get all rows with tenant filter
 */
export async function findAll(sql, tenantId, params = []) {
  return queryWithTenant(sql, tenantId, params);
}

/**
 * Insert with tenant_id
 */
export async function insert(table, data, tenantId) {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const placeholders = fields.map(() => '?').join(', ');
  const fieldNames = fields.join(', ');
  
  const sql = `INSERT INTO ${table} (tenant_id, ${fieldNames}) VALUES (?, ${placeholders})`;
  const result = await query(sql, [tenantId, ...values]);
  return result.insertId;
}

/**
 * Update with tenant filter
 */
export async function update(table, id, data, tenantId) {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ? AND tenant_id = ?`;
  const result = await query(sql, [...values, id, tenantId]);
  return result.affectedRows > 0;
}

/**
 * Soft delete with tenant filter
 * Sets both is_deleted = 1 and deleted_at = NOW()
 */
export async function softDelete(table, id, tenantId) {
  const sql = `UPDATE ${table} SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ? AND is_deleted = 0`;
  const result = await query(sql, [id, tenantId]);
  return result.affectedRows > 0;
}
