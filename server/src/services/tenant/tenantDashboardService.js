import { query } from '../../config/db.js';
import { sqlDateBetweenInclusive } from '../../utils/dateRangeQuery.js';
import { getCreatedByUserIdsForScope } from './userMessageScopeService.js';
import { listTenantActivityFeed } from './tenantActivityLogService.js';

async function buildActivityFeed(tenantId, actingUser) {
  return listTenantActivityFeed(tenantId, actingUser, { limit: 45 });
}

/**
 * Tenant dashboard aggregates. Admin: full tenant. Manager: team-scoped. Agent: lightweight.
 * @param {number} tenantId
 * @param {object} actingUser
 * @param {{ fromDate: string, toDate: string } | null} dateRange - optional inclusive calendar range on created_at
 */
export async function getDashboardData(tenantId, actingUser, dateRange = null) {
  const role = actingUser?.role;
  const dashboardPromise =
    role === 'admin'
      ? getAdminDashboard(tenantId, actingUser, dateRange)
      : role === 'manager'
        ? getManagerDashboard(tenantId, actingUser, dateRange)
        : getAgentDashboard(tenantId, actingUser, dateRange);
  const [data, activityFeed] = await Promise.all([
    dashboardPromise,
    buildActivityFeed(tenantId, actingUser),
  ]);
  return { ...data, activityFeed };
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

function meetingAgentScope(role, userId) {
  if (role !== 'agent') return { sql: '', params: [] };
  return {
    sql: ' AND (m.assigned_user_id = ? OR (m.assigned_user_id IS NULL AND m.created_by = ?)) ',
    params: [userId, userId],
  };
}

function callAttemptScope(role, userId) {
  if (role === 'agent') return { sql: ' AND cca.agent_user_id = ?', params: [userId] };
  if (role === 'manager') return { sql: ' AND cca.manager_id = ?', params: [userId] };
  return { sql: '', params: [] };
}

async function meetingsKpiCount(tenantId, actingUser, range) {
  const ms = meetingAgentScope(actingUser?.role, actingUser?.id);
  if (range) {
    const { clause, params } = sqlDateBetweenInclusive('m.start_at', range);
    const [row] = await query(
      `SELECT COUNT(*) AS c FROM tenant_meetings m
       WHERE m.tenant_id = ? AND m.deleted_at IS NULL ${clause}${ms.sql}`,
      [tenantId, ...params, ...ms.params]
    );
    return Number(row?.c ?? 0);
  }
  const [row] = await query(
    `SELECT COUNT(*) AS c FROM tenant_meetings m
     WHERE m.tenant_id = ? AND m.deleted_at IS NULL
     AND m.meeting_status IN ('scheduled','rescheduled')
     AND m.end_at > NOW()${ms.sql}`,
    [tenantId, ...ms.params]
  );
  return Number(row?.c ?? 0);
}

async function listUpcomingMeetings(tenantId, actingUser, limit = 6) {
  const ms = meetingAgentScope(actingUser?.role, actingUser?.id);
  const lim = Math.min(20, Math.max(1, limit));
  const rows = await query(
    `SELECT m.id, m.title, m.start_at, m.end_at, m.attendee_email, m.meeting_status, m.location
     FROM tenant_meetings m
     WHERE m.tenant_id = ? AND m.deleted_at IS NULL
     AND m.meeting_status IN ('scheduled','rescheduled')
     AND m.end_at > NOW()${ms.sql}
     ORDER BY m.start_at ASC
     LIMIT ${lim}`,
    [tenantId, ...ms.params]
  );
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    start_at: m.start_at,
    end_at: m.end_at,
    attendee_email: m.attendee_email,
    meeting_status: m.meeting_status,
    location: m.location,
  }));
}

async function listRecentConnectedCalls(tenantId, actingUser, limit = 8) {
  const cs = callAttemptScope(actingUser?.role, actingUser?.id);
  const lim = Math.min(30, Math.max(1, limit));
  const rows = await query(
    `SELECT cca.id, cca.contact_id, c.type AS contact_type, c.display_name,
            cca.duration_sec, d.name AS disposition_name, cca.started_at
     FROM contact_call_attempts cca
     LEFT JOIN contacts c ON c.id = cca.contact_id AND c.tenant_id = cca.tenant_id
     LEFT JOIN dispositions d ON d.id = cca.disposition_id AND d.tenant_id = cca.tenant_id AND d.is_deleted = 0
     WHERE cca.tenant_id = ? AND cca.is_connected = 1${cs.sql}
     ORDER BY cca.started_at DESC
     LIMIT ${lim}`,
    [tenantId, ...cs.params]
  );
  return rows.map((r) => ({
    id: r.id,
    contact_id: r.contact_id,
    contact_type: r.contact_type,
    display_name: r.display_name,
    duration_sec: r.duration_sec != null ? Number(r.duration_sec) : null,
    disposition_name: r.disposition_name,
    started_at: r.started_at,
  }));
}

async function getCallsTodayStats(tenantId, actingUser) {
  const cs = callAttemptScope(actingUser?.role, actingUser?.id);
  const [row] = await query(
    `SELECT COUNT(*) AS cnt, AVG(cca.duration_sec) AS avg_dur
     FROM contact_call_attempts cca
     WHERE cca.tenant_id = ?
     AND DATE(COALESCE(cca.started_at, cca.created_at)) = CURDATE()${cs.sql}`,
    [tenantId, ...cs.params]
  );
  return {
    count: Number(row?.cnt ?? 0),
    avgDurationSec: row?.avg_dur != null && !Number.isNaN(Number(row.avg_dur)) ? Number(row.avg_dur) : null,
  };
}

async function getOutboundSentEmailCount(tenantId, actingUser, range) {
  const date = range ? sqlDateBetweenInclusive('em.created_at', range) : { clause: '', params: [] };
  const params = [tenantId, ...date.params];
  let sql = `SELECT COUNT(*) AS total FROM email_messages em WHERE em.tenant_id = ? AND em.direction = 'outbound' AND em.status = 'sent'${date.clause}`;

  if (actingUser?.role !== 'admin') {
    const ids = await getCreatedByUserIdsForScope(tenantId, actingUser);
    if (!ids?.length) return 0;
    sql += ` AND em.created_by IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  const [row] = await query(sql, params);
  return Number(row?.total ?? 0);
}

async function getAdminDashboard(tenantId, actingUser, range) {
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

  const [activeCampaignRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'`,
    [tenantId]
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

  const [
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
    meetingsMetric,
  ] = await Promise.all([
    listUpcomingMeetings(tenantId, actingUser, 6),
    listRecentConnectedCalls(tenantId, actingUser, 8),
    getCallsTodayStats(tenantId, actingUser),
    getOutboundSentEmailCount(tenantId, actingUser, range),
    meetingsKpiCount(tenantId, actingUser, range),
  ]);

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
    campaignsActive: Number(activeCampaignRow?.total ?? 0),
    meetingsMetric,
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
    recentUsers: recentUsers.map(mapUserRow),
  };
}

async function getManagerDashboard(tenantId, actingUser, range) {
  const managerId = actingUser?.id;
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

  const [activeCampaignRow] = await query(
    `SELECT COUNT(*) AS total FROM campaigns
     WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'
     AND (manager_id = ? OR manager_id IS NULL)`,
    [tenantId, managerId]
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

  const [
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
    meetingsMetric,
  ] = await Promise.all([
    listUpcomingMeetings(tenantId, actingUser, 6),
    listRecentConnectedCalls(tenantId, actingUser, 8),
    getCallsTodayStats(tenantId, actingUser),
    getOutboundSentEmailCount(tenantId, actingUser, range),
    meetingsKpiCount(tenantId, actingUser, range),
  ]);

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
    campaignsActive: Number(activeCampaignRow?.total ?? 0),
    meetingsMetric,
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
    recentUsers: recentUsers.map(mapUserRow),
  };
}

async function getAgentDashboard(tenantId, actingUser, range) {
  const agentId = actingUser?.id;
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

  const [
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
    meetingsMetric,
  ] = await Promise.all([
    listUpcomingMeetings(tenantId, actingUser, 6),
    listRecentConnectedCalls(tenantId, actingUser, 8),
    getCallsTodayStats(tenantId, actingUser),
    getOutboundSentEmailCount(tenantId, actingUser, range),
    meetingsKpiCount(tenantId, actingUser, range),
  ]);

  return {
    scope: 'self',
    headline: 'Your workspace',
    dateRange: range ? { from: range.fromDate, to: range.toDate } : null,
    usersTotal: 0,
    usersByRole: { admin: 0, manager: 0, agent: 0 },
    leadsTotal: Number(myLeadsRow?.total ?? 0),
    contactsTotal: Number(myContactsRow?.total ?? 0),
    campaignsTotal: null,
    campaignsActive: null,
    meetingsMetric,
    upcomingMeetings,
    recentConnectedCalls,
    callsToday,
    emailsTotal,
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
