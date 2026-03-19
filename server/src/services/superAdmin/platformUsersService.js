import bcrypt from 'bcryptjs';
import { query } from '../../config/db.js';
import { registerUser } from '../authService.js';
import { getRoleByTenantAndName } from '../rbacService.js';

/**
 * List users for platform admin (paginated).
 * Optional filter by tenant_id. Includes both platform admins (tenant_id NULL) and tenant users.
 */
export async function findAll({
  tenant_id,
  search = '',
  includeDisabled = false,
  page = 1,
  limit = 20,
  role: roleFilter,
  filterManagerId,
} = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;

  const whereClauses = ['u.is_deleted = 0', 'u.is_platform_admin = 0'];
  const params = [];

  if (tenant_id != null && tenant_id !== '') {
    whereClauses.push('u.tenant_id = ?');
    params.push(tenant_id);
  }

  if (!includeDisabled) {
    whereClauses.push('u.is_enabled = 1');
  }

  if (search) {
    whereClauses.push('(u.email LIKE ? OR u.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const hasRoleFilter = roleFilter && ['admin', 'manager', 'agent'].includes(roleFilter);
  if (hasRoleFilter) {
    whereClauses.push('u.role = ?');
    params.push(roleFilter);
  }

  const managerFilterActive =
    filterManagerId === 'unassigned' ||
    (filterManagerId != null && filterManagerId !== '' && filterManagerId !== '__all__');
  if (managerFilterActive && (!hasRoleFilter || roleFilter === 'agent')) {
    if (filterManagerId === 'unassigned') {
      if (!hasRoleFilter) {
        whereClauses.push('(u.role <> ? OR u.manager_id IS NULL)');
        params.push('agent');
      } else {
        whereClauses.push('u.manager_id IS NULL');
      }
    } else {
      const mid = Number(filterManagerId);
      if (!Number.isNaN(mid)) {
        if (!hasRoleFilter) {
          whereClauses.push('(u.role <> ? OR u.manager_id = ?)');
          params.push('agent', mid);
        } else {
          whereClauses.push('u.manager_id = ?');
          params.push(mid);
        }
      }
    }
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM users u ${whereSQL}`,
    params
  );
  const total = countRow.total;

  const data = await query(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.role_id, u.manager_id, u.is_enabled, u.is_platform_admin,
            u.created_at, u.last_login_at,
            t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id AND t.is_deleted = 0
     ${whereSQL}
     ORDER BY t.name ASC, u.email ASC
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

export async function findById(id) {
  const [row] = await query(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.role_id, u.is_enabled, u.is_platform_admin,
            u.created_at, u.last_login_at,
            t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id AND t.is_deleted = 0
     WHERE u.id = ? AND u.is_deleted = 0`,
    [id]
  );
  return row || null;
}

/**
 * Create user (tenant_id, email, password, name, role).
 * Role must be admin, manager, or agent. Super admin cannot be created via API.
 */
export async function create({ tenant_id, email, password, name, role }) {
  const user = await registerUser(email, password, name, tenant_id, role);
  return findById(user.id);
}

/**
 * Update user. Accepts: name, role, is_enabled, unlock (clear lock + failed attempts), password (reset password).
 */
export async function update(id, payload) {
  const existing = await findById(id);
  if (!existing) return null;

  const { name, role, is_enabled, unlock, password } = payload;

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

  if (role !== undefined && existing.tenant_id != null) {
    const roleRecord = await getRoleByTenantAndName(existing.tenant_id, role);
    const roleId = roleRecord?.id ?? null;
    updates.push('role = ?, role_id = ?');
    params.push(role, roleId);
  }

  if (password && String(password).trim()) {
    const passwordHash = await bcrypt.hash(String(password).trim(), 10);
    updates.push('password_hash = ?, password_changed_at = NOW(), token_version = COALESCE(token_version, 1) + 1');
    params.push(passwordHash);
  }

  if (updates.length === 0) return findById(id);
  params.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  return findById(id);
}
