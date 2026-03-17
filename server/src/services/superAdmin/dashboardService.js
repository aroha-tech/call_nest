import { query } from '../../config/db.js';

/**
 * Stats for super admin dashboard: customer tenant count, tenant user count, users by role.
 * Excludes platform tenant (id=1) and super admin users so the picture is tenants + their users only.
 */
export async function getStats() {
  const [tenantsRow] = await query(
    'SELECT COUNT(*) AS total FROM tenants WHERE is_deleted = 0 AND id > 1'
  );

  const [usersRow] = await query(
    'SELECT COUNT(*) AS total FROM users WHERE is_deleted = 0 AND is_platform_admin = 0'
  );

  const roleRows = await query(
    `SELECT role, COUNT(*) AS count
     FROM users
     WHERE is_deleted = 0 AND is_platform_admin = 0 AND role IS NOT NULL
     GROUP BY role
     ORDER BY role`
  );

  const usersByRole = roleRows.reduce((acc, row) => {
    acc[row.role] = row.count;
    return acc;
  }, {});

  return {
    tenantsTotal: tenantsRow?.total ?? 0,
    usersTotal: usersRow?.total ?? 0,
    usersByRole: {
      admin: usersByRole.admin ?? 0,
      manager: usersByRole.manager ?? 0,
      agent: usersByRole.agent ?? 0,
    },
  };
}
