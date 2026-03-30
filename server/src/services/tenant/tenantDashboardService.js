import { query } from '../../config/db.js';
import { sqlDateBetweenInclusive } from '../../utils/dateRangeQuery.js';

/**
 * Tenant dashboard aggregates. Admin: full tenant. Manager: team-scoped. Agent: lightweight.
 * @param {number} tenantId
 * @param {object} actingUser
 * @param {{ fromDate: string, toDate: string } | null} dateRange - optional inclusive calendar range on created_at
 */
export async function getDashboardData(tenantId, actingUser, dateRange = null) {
  const role = actingUser?.role;
  const uid = actingUser?.id;

  if (role === 'admin') {
    return getAdminDashboard(tenantId, dateRange);
  }
  if (role === 'manager') {
    return getManagerDashboard(tenantId, uid, dateRange);
  }
  return getAgentDashboard(tenantId, uid, dateRange);
}

function drParams(range) {
  if (!range) return { clause: '', params: [] };
  const { clause, params } = sqlDateBetweenInclusive('created_at', range);
  return { clause, params };
}

function drParamsAlias(range, alias) {
  if (!range) return { clause: '', params: [] };
  const { clause, params } = sqlDateBetweenInclusive(`${alias}.created_at`, range);
  return { clause, params };
}

async function getAdminDashboard(tenantId, range) {
  const u = drParams(range);
  const c = drParamsAlias(range, 'c');

  const [userRow] = await query(
    `SELECT COUNT(*) AS total FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0${u.clause}`,
    [tenantId, ...u.params]
  );

  const roleRows = await query(
    `SELECT role, COUNT(*) AS count FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND role IS NOT NULL${u.clause}
     GROUP BY role`,
    [tenantId, ...u.params]
  );

  const usersByRole = roleRows.reduce((acc, row) => {
    acc[row.role] = Number(row.count);
    return acc;
  }, {});

  const [leadRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'lead'${c.clause}`,
    [tenantId, ...c.params]
  );

  const [contactRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'contact'${c.clause}`,
    [tenantId, ...c.params]
  );

  const camp = drParams(range);
  const [campaignRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL${camp.clause}`,
    [tenantId, ...camp.params]
  );

  const ru = drParamsAlias(range, 'u');
  const recentUsers = await query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at
     FROM users u
     WHERE u.tenant_id = ? AND u.is_deleted = 0 AND u.is_platform_admin = 0${ru.clause}
     ORDER BY u.created_at DESC
     LIMIT 5`,
    [tenantId, ...ru.params]
  );

  return {
    scope: 'tenant',
    headline: 'Organization overview',
    dateRange: range ? { from: range.fromDate, to: range.toDate } : null,
    usersTotal: Number(userRow?.total ?? 0),
    usersByRole: {
      admin: usersByRole.admin ?? 0,
      manager: usersByRole.manager ?? 0,
      agent: usersByRole.agent ?? 0,
    },
    leadsTotal: Number(leadRow?.total ?? 0),
    contactsTotal: Number(contactRow?.total ?? 0),
    campaignsTotal: Number(campaignRow?.total ?? 0),
    recentUsers: recentUsers.map(mapUserRow),
  };
}

async function getManagerDashboard(tenantId, managerId, range) {
  const u = drParams(range);
  const [teamAgentsRow] = await query(
    `SELECT COUNT(*) AS total FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND role = 'agent' AND manager_id = ?${u.clause}`,
    [tenantId, managerId, ...u.params]
  );

  const c = drParamsAlias(range, 'c');
  const [leadsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'lead'
     AND (
       c.manager_id = ?
       OR c.assigned_user_id = ?
       OR c.assigned_user_id IN (
         SELECT id FROM users u
         WHERE u.tenant_id = ? AND u.is_deleted = 0 AND u.role = 'agent' AND u.manager_id = ?
       )
     )${c.clause}`,
    [tenantId, managerId, managerId, tenantId, managerId, ...c.params]
  );

  const [contactsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'contact'
     AND (
       c.manager_id = ?
       OR c.assigned_user_id = ?
       OR c.assigned_user_id IN (
         SELECT id FROM users u
         WHERE u.tenant_id = ? AND u.is_deleted = 0 AND u.role = 'agent' AND u.manager_id = ?
       )
     )${c.clause}`,
    [tenantId, managerId, managerId, tenantId, managerId, ...c.params]
  );

  const camp = drParams(range);
  const [campaignsRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL
     AND (manager_id = ? OR manager_id IS NULL)${camp.clause}`,
    [tenantId, managerId, ...camp.params]
  );

  const ru = drParamsAlias(range, 'u');
  const recentUsers = await query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at
     FROM users u
     WHERE u.is_deleted = 0 AND u.tenant_id = ? AND u.is_platform_admin = 0
     AND u.role = 'agent' AND u.manager_id = ?${ru.clause}
     ORDER BY u.created_at DESC
     LIMIT 5`,
    [tenantId, managerId, ...ru.params]
  );

  const agentCount = Number(teamAgentsRow?.total ?? 0);

  return {
    scope: 'team',
    headline: 'Your team overview',
    dateRange: range ? { from: range.fromDate, to: range.toDate } : null,
    usersTotal: agentCount,
    usersByRole: {
      admin: 0,
      manager: 0,
      agent: agentCount,
    },
    leadsTotal: Number(leadsRow?.total ?? 0),
    contactsTotal: Number(contactsRow?.total ?? 0),
    campaignsTotal: Number(campaignsRow?.total ?? 0),
    recentUsers: recentUsers.map(mapUserRow),
  };
}

async function getAgentDashboard(tenantId, agentId, range) {
  const c = drParamsAlias(range, 'c');
  const [myLeadsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'lead'
     AND (c.assigned_user_id = ? OR c.created_by = ?)${c.clause}`,
    [tenantId, agentId, agentId, ...c.params]
  );

  const [myContactsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.type = 'contact'
     AND (c.assigned_user_id = ? OR c.created_by = ?)${c.clause}`,
    [tenantId, agentId, agentId, ...c.params]
  );

  return {
    scope: 'self',
    headline: 'Your workspace',
    dateRange: range ? { from: range.fromDate, to: range.toDate } : null,
    usersTotal: 0,
    usersByRole: { admin: 0, manager: 0, agent: 0 },
    leadsTotal: Number(myLeadsRow?.total ?? 0),
    contactsTotal: Number(myContactsRow?.total ?? 0),
    campaignsTotal: null,
    recentUsers: [],
  };
}

function mapUserRow(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}
