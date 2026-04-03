import { query } from '../config/db.js';
import { redis, isRedisAvailable } from '../config/redis.js';

const PERMISSION_CACHE_TTL = 15 * 60; // 15 minutes

/**
 * Redis key for user permissions cache
 */
export function userPermissionsKey(userId) {
  return `user_permissions:${userId}`;
}

/**
 * Get all permissions for a user by their role_id
 * Returns array of permission codes
 */
export async function getPermissionsByRoleId(roleId) {
  if (!roleId) return [];

  const rows = await query(
    `SELECT p.code
     FROM permissions p
     INNER JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [roleId]
  );

  return rows.map((row) => row.code);
}

/**
 * Get permissions for a user (with Redis caching)
 * Returns array of permission codes
 */
export async function getUserPermissions(userId, roleId) {
  // Platform admins have no role-based permissions (they bypass permission checks)
  if (!roleId) return [];

  // Try Redis cache first
  if (isRedisAvailable()) {
    try {
      const cacheKey = userPermissionsKey(userId);
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error('Redis error reading permissions cache:', err);
    }
  }

  // Fetch from database
  const permissions = await getPermissionsByRoleId(roleId);

  // Cache in Redis
  if (isRedisAvailable() && permissions.length > 0) {
    try {
      const cacheKey = userPermissionsKey(userId);
      await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(permissions));
    } catch (err) {
      console.error('Redis error caching permissions:', err);
    }
  }

  return permissions;
}

/**
 * Invalidate user permissions cache
 * Call this when user's role or role's permissions change
 */
export async function invalidateUserPermissionsCache(userId) {
  if (isRedisAvailable()) {
    try {
      const cacheKey = userPermissionsKey(userId);
      await redis.del(cacheKey);
    } catch (err) {
      console.error('Redis error invalidating permissions cache:', err);
    }
  }
}

/**
 * Get token version for a user
 */
export async function getTokenVersion(userId) {
  const [row] = await query('SELECT token_version FROM users WHERE id = ?', [userId]);
  return row?.token_version ?? 1;
}

/**
 * Increment token version for a user
 * Forces re-login by invalidating existing JWTs
 */
export async function incrementTokenVersion(userId) {
  await query(
    'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
    [userId]
  );
  await invalidateUserPermissionsCache(userId);
}

/**
 * Get role by ID
 */
export async function getRoleById(roleId) {
  const [role] = await query(
    'SELECT id, tenant_id, name, description, is_system_role FROM roles WHERE id = ?',
    [roleId]
  );
  return role || null;
}

/**
 * Get role by tenant and name
 */
export async function getRoleByTenantAndName(tenantId, roleName) {
  const [role] = await query(
    'SELECT id, tenant_id, name, description, is_system_role FROM roles WHERE tenant_id = ? AND name = ?',
    [tenantId, roleName]
  );
  return role || null;
}

/**
 * Get all roles for a tenant
 */
export async function getTenantRoles(tenantId) {
  return query(
    'SELECT id, tenant_id, name, description, is_system_role FROM roles WHERE tenant_id = ? ORDER BY name',
    [tenantId]
  );
}

/**
 * Get all permissions (for admin UI)
 */
export async function getAllPermissions() {
  return query('SELECT id, code, description FROM permissions ORDER BY code');
}

/**
 * Get permissions for a role
 */
export async function getRolePermissions(roleId) {
  return query(
    `SELECT p.id, p.code, p.description
     FROM permissions p
     INNER JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.code`,
    [roleId]
  );
}

/**
 * Create system roles for a new tenant
 * Called during tenant registration
 */
export async function createSystemRolesForTenant(tenantId) {
  const systemRoles = [
    { name: 'admin', description: 'Full tenant administration access' },
    { name: 'manager', description: 'Team management and monitoring access' },
    { name: 'agent', description: 'Basic agent access for dialing and contact handling' },
  ];

  const createdRoles = [];

  for (const role of systemRoles) {
    const result = await query(
      'INSERT INTO roles (tenant_id, name, description, is_system_role) VALUES (?, ?, ?, 1)',
      [tenantId, role.name, role.description]
    );
    createdRoles.push({ id: result.insertId, ...role });
  }

  // Map permissions to roles
  await mapSystemRolePermissions(tenantId);

  return createdRoles;
}

/**
 * Map default permissions to system roles for a tenant
 */
async function mapSystemRolePermissions(tenantId) {
  const rolePermissionMap = {
    admin: [
      'dashboard.view',
      'contacts.read', 'contacts.create', 'contacts.update', 'contacts.delete',
      'leads.read', 'leads.create', 'leads.update', 'leads.delete',
      'dial.execute', 'dial.monitor',
      'reports.view',
      'users.manage',
      'pipelines.manage',
      'settings.manage',
      'dispositions.manage',
      'telephony.manage',
      'whatsapp.view',
      'whatsapp.send',
      'whatsapp.templates.manage',
      'whatsapp.accounts.manage',
      'whatsapp.logs.view',
      'email.view',
      'email.send',
      'email.templates.manage',
      'email.accounts.manage',
    ],
    manager: [
      'dashboard.view',
      'contacts.read',
      'leads.read', 'leads.create', 'leads.update',
      'dial.monitor',
      'reports.view',
      'users.team',
      'whatsapp.view',
      'whatsapp.send',
      'whatsapp.templates.manage',
      'whatsapp.logs.view',
      'email.view',
      'email.send',
      'email.templates.manage',
    ],
    agent: [
      'dashboard.view',
      'contacts.read',
      'leads.read', 'leads.create', 'leads.update',
      'dial.execute',
      'workflow.view',
      'scripts.self',
      'whatsapp.view',
      'whatsapp.send',
      'email.view',
      'email.send',
    ],
  };

  for (const [roleName, permissionCodes] of Object.entries(rolePermissionMap)) {
    const role = await getRoleByTenantAndName(tenantId, roleName);
    if (!role) continue;

    for (const code of permissionCodes) {
      const [permission] = await query('SELECT id FROM permissions WHERE code = ?', [code]);
      if (!permission) continue;

      await query(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [role.id, permission.id]
      );
    }
  }
}

/**
 * Assign role to user and increment token version
 */
export async function assignRoleToUser(userId, roleId) {
  await query('UPDATE users SET role_id = ? WHERE id = ?', [roleId, userId]);
  await incrementTokenVersion(userId);
}

/**
 * Update role permissions (for future custom roles feature)
 * Invalidates all users with this role
 */
export async function updateRolePermissions(roleId, permissionIds) {
  // Clear existing permissions
  await query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

  // Insert new permissions
  for (const permissionId of permissionIds) {
    await query(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
      [roleId, permissionId]
    );
  }

  // Invalidate token version for all users with this role
  const users = await query('SELECT id FROM users WHERE role_id = ?', [roleId]);
  for (const user of users) {
    await incrementTokenVersion(user.id);
  }
}
