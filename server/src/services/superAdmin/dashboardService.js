import { query } from '../../config/db.js';
import { sqlDateBetweenInclusive } from '../../utils/dateRangeQuery.js';
import { listPlatformActivityFeed } from './platformActivityLogService.js';

/**
 * Stats for super admin dashboard: customer tenant count, tenant user count, users by role.
 * Excludes platform tenant (id=1) and super admin users so the picture is tenants + their users only.
 * @param {{ fromDate: string, toDate: string } | null} dateRange - optional inclusive calendar range on created_at
 */
export async function getStats(dateRange = null) {
  let tenantSql =
    'SELECT COUNT(*) AS total FROM tenants WHERE is_deleted = 0 AND id > 1';
  let tenantParams = [];

  let userSql = `SELECT COUNT(*) AS total FROM users WHERE is_deleted = 0 AND is_platform_admin = 0`;
  let userParams = [];

  let roleSql = `SELECT role, COUNT(*) AS count
     FROM users
     WHERE is_deleted = 0 AND is_platform_admin = 0 AND role IS NOT NULL`;
  const roleParams = [];

  if (dateRange) {
    const t = sqlDateBetweenInclusive('created_at', dateRange);
    tenantSql += t.clause;
    tenantParams = [...t.params];

    const u = sqlDateBetweenInclusive('created_at', dateRange);
    userSql += u.clause;
    userParams = [...u.params];

    roleSql += u.clause;
    roleParams.push(...u.params);
  }

  roleSql += ' GROUP BY role ORDER BY role';

  const [[tenantsRow], [usersRow], roleRows, activityFeed] = await Promise.all([
    query(tenantSql, tenantParams),
    query(userSql, userParams),
    query(roleSql, roleParams),
    listPlatformActivityFeed({ limit: 32 }),
  ]);

  const usersByRole = roleRows.reduce((acc, row) => {
    acc[row.role] = row.count;
    return acc;
  }, {});

  return {
    dateRange: dateRange ? { from: dateRange.fromDate, to: dateRange.toDate } : null,
    tenantsTotal: tenantsRow?.total ?? 0,
    usersTotal: usersRow?.total ?? 0,
    usersByRole: {
      admin: usersByRole.admin ?? 0,
      manager: usersByRole.manager ?? 0,
      agent: usersByRole.agent ?? 0,
    },
    activityFeed,
  };
}
