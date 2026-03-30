import { query } from '../../config/db.js';

/**
 * Tenant dashboard aggregates. Admin: full tenant. Manager: team-scoped. Agent: lightweight.
 */
export async function getDashboardData(tenantId, actingUser) {
  const role = actingUser?.role;
  const uid = actingUser?.id;

  if (role === 'admin') {
    return getAdminDashboard(tenantId);
  }
  if (role === 'manager') {
    return getManagerDashboard(tenantId, uid);
  }
  return getAgentDashboard(tenantId, uid);
}

async function getAdminDashboard(tenantId) {
  const [userRow] = await query(
    `SELECT COUNT(*) AS total FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0`,
    [tenantId]
  );

  const roleRows = await query(
    `SELECT role, COUNT(*) AS count FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND role IS NOT NULL
     GROUP BY role`,
    [tenantId]
  );

  const usersByRole = roleRows.reduce((acc, row) => {
    acc[row.role] = Number(row.count);
    return acc;
  }, {});

  const [leadRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts
     WHERE tenant_id = ? AND deleted_at IS NULL AND type = 'lead'`,
    [tenantId]
  );

  const [contactRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts
     WHERE tenant_id = ? AND deleted_at IS NULL AND type = 'contact'`,
    [tenantId]
  );

  const [campaignRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tenantId]
  );

  const recentUsers = await query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at
     FROM users u
     WHERE u.tenant_id = ? AND u.is_deleted = 0 AND u.is_platform_admin = 0
     ORDER BY u.created_at DESC
     LIMIT 5`,
    [tenantId]
  );

  return {
    scope: 'tenant',
    headline: 'Organization overview',
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

async function getManagerDashboard(tenantId, managerId) {
  const [teamAgentsRow] = await query(
    `SELECT COUNT(*) AS total FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND role = 'agent' AND manager_id = ?`,
    [tenantId, managerId]
  );

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
     )`,
    [tenantId, managerId, managerId, tenantId, managerId]
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
     )`,
    [tenantId, managerId, managerId, tenantId, managerId]
  );

  const [campaignsRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL
     AND (manager_id = ? OR manager_id IS NULL)`,
    [tenantId, managerId]
  );

  const recentUsers = await query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at
     FROM users u
     WHERE u.is_deleted = 0 AND u.tenant_id = ? AND u.is_platform_admin = 0
     AND u.role = 'agent' AND u.manager_id = ?
     ORDER BY u.created_at DESC
     LIMIT 5`,
    [tenantId, managerId]
  );

  const agentCount = Number(teamAgentsRow?.total ?? 0);

  return {
    scope: 'team',
    headline: 'Your team overview',
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

async function getAgentDashboard(tenantId, agentId) {
  const [myLeadsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts
     WHERE tenant_id = ? AND deleted_at IS NULL AND type = 'lead'
     AND (assigned_user_id = ? OR created_by = ?)`,
    [tenantId, agentId, agentId]
  );

  const [myContactsRow] = await query(
    `SELECT COUNT(*) AS total FROM contacts
     WHERE tenant_id = ? AND deleted_at IS NULL AND type = 'contact'
     AND (assigned_user_id = ? OR created_by = ?)`,
    [tenantId, agentId, agentId]
  );

  return {
    scope: 'self',
    headline: 'Your workspace',
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
