import bcrypt from 'bcryptjs';
import { query } from '../../config/db.js';
import { registerUser } from '../authService.js';
import { getRoleByTenantAndName } from '../rbacService.js';

/**
 * List users for the current tenant only (company admin).
 */
export async function findAll(tenantId, { search = '', includeDisabled = false, page = 1, limit = 20 } = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;

  const whereClauses = ['u.is_deleted = 0', 'u.tenant_id = ?', 'u.is_platform_admin = 0'];
  const params = [tenantId];

  if (!includeDisabled) {
    whereClauses.push('u.is_enabled = 1');
  }

  if (search) {
    whereClauses.push('(u.email LIKE ? OR u.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM users u ${whereSQL}`,
    params
  );
  const total = countRow.total;

  const data = await query(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.role_id, u.is_enabled, u.created_at, u.last_login_at
     FROM users u
     ${whereSQL}
     ORDER BY u.role ASC, u.email ASC
     LIMIT ${limitInt} OFFSET ${offsetInt}`,
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

export async function findById(id, tenantId) {
  const [row] = await query(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.role_id, u.is_enabled, u.created_at, u.last_login_at
     FROM users u
     WHERE u.id = ? AND u.tenant_id = ? AND u.is_deleted = 0 AND u.is_platform_admin = 0`,
    [id, tenantId]
  );
  return row || null;
}

/**
 * Create user in the current tenant (admin, manager, or agent). Only tenant admin/manager can call.
 */
export async function create(tenantId, { email, password, name, role }) {
  const user = await registerUser(email, password, name, tenantId, role);
  return findById(user.id, tenantId);
}

/**
 * Update user. User must belong to tenant. Accepts: name, role, is_enabled, password.
 */
export async function update(id, tenantId, payload) {
  const existing = await findById(id, tenantId);
  if (!existing) return null;

  const { name, role, is_enabled, password } = payload;

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }

  if (is_enabled !== undefined) {
    updates.push('is_enabled = ?');
    params.push(is_enabled ? 1 : 0);
  }

  if (role !== undefined) {
    const roleRecord = await getRoleByTenantAndName(tenantId, role);
    const roleId = roleRecord?.id ?? null;
    updates.push('role = ?, role_id = ?');
    params.push(role, roleId);
  }

  if (password && String(password).trim()) {
    const passwordHash = await bcrypt.hash(String(password).trim(), 10);
    updates.push('password_hash = ?, password_changed_at = NOW(), token_version = COALESCE(token_version, 1) + 1');
    params.push(passwordHash);
  }

  if (updates.length === 0) return existing;
  params.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  return findById(id, tenantId);
}
