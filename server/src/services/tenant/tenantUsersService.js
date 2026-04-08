import bcrypt from 'bcryptjs';
import { query } from '../../config/db.js';
import { registerUser } from '../authService.js';
import { getRoleByTenantAndName } from '../rbacService.js';
import { syncContactsManagerForAgent } from './contactsService.js';

const USER_SELECT = `u.id, u.tenant_id, u.email, u.name, u.role, u.role_id, u.manager_id,
            u.agent_can_delete_leads, u.agent_can_delete_contacts,
            u.is_enabled, u.created_at, u.last_login_at,
            mgr.name AS manager_name, mgr.email AS manager_email`;

const USER_JOIN = `FROM users u
     LEFT JOIN users mgr ON mgr.id = u.manager_id AND mgr.tenant_id = u.tenant_id AND mgr.is_deleted = 0`;

/**
 * Raw row from DB (no manager scope).
 */
async function fetchUserRowUnscoped(id, tenantId) {
  const [row] = await query(
    `SELECT ${USER_SELECT} ${USER_JOIN}
     WHERE u.id = ? AND u.tenant_id = ? AND u.is_deleted = 0 AND u.is_platform_admin = 0`,
    [id, tenantId]
  );
  return row || null;
}

/**
 * Manager may see: self and agents who report to them only (no unassigned pool).
 */
function managerCanSeeUserRow(actingUser, row) {
  if (!row || actingUser?.role !== 'manager') return true;
  if (Number(row.id) === Number(actingUser.id)) return true;
  if (row.role !== 'agent') return false;
  return Number(row.manager_id) === Number(actingUser.id);
}

/**
 * List users for the current tenant. Managers see a scoped list for team management.
 */
export async function findAll(
  tenantId,
  actingUser,
  { search = '', includeDisabled = false, page = 1, limit = 20, role: roleFilter, filterManagerId } = {}
) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;

  const whereClauses = ['u.is_deleted = 0', 'u.tenant_id = ?', 'u.is_platform_admin = 0'];
  const params = [tenantId];

  if (actingUser?.role === 'manager') {
    whereClauses.push('u.role = ? AND u.manager_id = ?');
    params.push('agent', actingUser.id);
  }

  if (!includeDisabled) {
    whereClauses.push('u.is_enabled = 1');
  }

  if (search) {
    whereClauses.push('(u.email LIKE ? OR u.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  /** Tenant admins only: narrow by role and/or agent reporting line. */
  if (actingUser?.role === 'admin') {
    const hasRoleFilter = roleFilter && ['admin', 'manager', 'agent'].includes(roleFilter);
    if (hasRoleFilter) {
      whereClauses.push('u.role = ?');
      params.push(roleFilter);
    }
    /**
     * manager_id only applies to agents. If role is admin or manager, ignore reports-to (else every
     * manager matched (role <> 'agent') and the filter looked broken).
     * - All roles: keep admins/managers visible, narrow agents by manager_id.
     * - Role agent only: strict match on manager_id.
     */
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
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(`SELECT COUNT(*) AS total FROM users u ${whereSQL}`, params);
  const total = countRow.total;

  const data = await query(
    `SELECT ${USER_SELECT} ${USER_JOIN}
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

export async function findById(id, tenantId, actingUser) {
  const row = await fetchUserRowUnscoped(id, tenantId);
  if (!row) return null;
  if (!managerCanSeeUserRow(actingUser, row)) return null;
  return row;
}

/**
 * Create user in the current tenant.
 */
export async function create(tenantId, actingUser, { email, password, name, role, manager_id = null }) {
  if (actingUser?.role === 'manager') {
    const err = new Error('Only an administrator can create users');
    err.status = 403;
    throw err;
  }

  const effectiveManagerId = manager_id;

  const user = await registerUser(email, password, name, tenantId, role);

  if (role === 'agent') {
    const mid = effectiveManagerId ? Number(effectiveManagerId) : null;
    if (mid) {
      const [managerRow] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0`,
        [mid, tenantId]
      );

      if (!managerRow) {
        const err = new Error('Invalid manager_id for this tenant');
        err.status = 400;
        throw err;
      }

      await query('UPDATE users SET manager_id = ? WHERE id = ? AND tenant_id = ?', [mid, user.id, tenantId]);
    }
  }

  return findById(user.id, tenantId, actingUser);
}

/**
 * Update user. Only administrators may change reporting manager (assign / unassign).
 */
export async function update(id, tenantId, actingUser, payload) {
  const existing = await findById(id, tenantId, actingUser);
  if (!existing) return null;

  const { name, role, is_enabled, password, manager_id, agent_can_delete_leads, agent_can_delete_contacts } =
    payload;

  if (actingUser?.role === 'manager') {
    if (manager_id !== undefined) {
      const err = new Error('Only an administrator can assign or change reporting manager');
      err.status = 403;
      throw err;
    }
    const isSelf = Number(existing.id) === Number(actingUser.id);
    if (isSelf) {
      if (role !== undefined) {
        const err = new Error('Managers cannot change their own role');
        err.status = 403;
        throw err;
      }
    } else if (existing.role === 'agent') {
      if (role !== undefined && role !== 'agent') {
        const err = new Error('Managers cannot change an agent into another role');
        err.status = 403;
        throw err;
      }
    } else {
      const err = new Error('Managers can only edit their own profile or agents on their team');
      err.status = 403;
      throw err;
    }
  }

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

  if (manager_id !== undefined) {
    const effectiveRole = role ?? existing.role;
    if (effectiveRole === 'agent') {
      if (manager_id === null || manager_id === '') {
        updates.push('manager_id = NULL');
      } else {
        const [managerRow] = await query(
          `SELECT id FROM users
           WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0`,
          [manager_id, tenantId]
        );

        if (!managerRow) {
          const err = new Error('Invalid manager_id for this tenant');
          err.status = 400;
          throw err;
        }

        updates.push('manager_id = ?');
        params.push(manager_id);
      }
    } else {
      updates.push('manager_id = NULL');
    }
  }

  if (password && String(password).trim()) {
    const passwordHash = await bcrypt.hash(String(password).trim(), 10);
    updates.push('password_hash = ?, password_changed_at = NOW(), token_version = COALESCE(token_version, 1) + 1');
    params.push(passwordHash);
  }

  const effectiveRole = role ?? existing.role;
  if (agent_can_delete_leads !== undefined) {
    if (effectiveRole !== 'agent') {
      updates.push('agent_can_delete_leads = 0');
    } else {
      updates.push('agent_can_delete_leads = ?');
      params.push(agent_can_delete_leads ? 1 : 0);
    }
  }
  if (agent_can_delete_contacts !== undefined) {
    if (effectiveRole !== 'agent') {
      updates.push('agent_can_delete_contacts = 0');
    } else {
      updates.push('agent_can_delete_contacts = ?');
      params.push(agent_can_delete_contacts ? 1 : 0);
    }
  }

  if (updates.length === 0) return existing;
  params.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

  const finalRole = role !== undefined ? role : existing.role;
  if (manager_id !== undefined && finalRole === 'agent') {
    const newMid =
      manager_id === null || manager_id === '' ? null : Number(manager_id);
    await syncContactsManagerForAgent(tenantId, id, newMid, actingUser?.id ?? null);
  }

  return findById(id, tenantId, actingUser);
}
