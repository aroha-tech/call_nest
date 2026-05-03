import { query } from '../../config/db.js';
import {
  dateOnly,
  buildUserScope,
  buildManagerTeamFilter,
  PERF_REPORTS_AGENT_ROLE_SQL,
} from '../../modules/reports/reportsScope.js';
import { buildNestInsights } from '../../modules/reports/ai/index.js';
import * as taskManagerService from './taskManagerService.js';

function num(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Resolve date range from preset or explicit from/to (YYYY-MM-DD).
 */
export function resolveReportingPeriod(query, now = new Date()) {
  let preset = String(query.preset || '').trim().toLowerCase();
  const compare =
    String(query.compare || '') === '1' ||
    String(query.compare || '').toLowerCase() === 'true' ||
    String(query.compare || '') === 'yes';

  let fromQ = dateOnly(query.from);
  let toQ = dateOnly(query.to);
  const fmt = (d) => dateOnly(d);

  if (!preset || preset === 'custom') {
    const end = startOfDay(now);
    const defaultFrom = new Date(end.getFullYear(), end.getMonth(), 1);
    return {
      preset: 'custom',
      from: fromQ || fmt(defaultFrom),
      to: toQ || fmt(end),
      compare,
      compareFrom: null,
      compareTo: null,
    };
  }

  let start;
  let end = startOfDay(now);

  switch (preset) {
    case 'last_7_days':
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      break;
    case 'last_30_days':
      start = new Date(end);
      start.setDate(start.getDate() - 29);
      break;
    case 'last_90_days':
      start = new Date(end);
      start.setDate(start.getDate() - 89);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'last_6_months':
      start = new Date(end);
      start.setMonth(start.getMonth() - 6);
      start.setDate(start.getDate() + 1);
      break;
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    case 'last_year':
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31);
      break;
    default:
      preset = 'this_month';
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const from = fmt(start);
  const to = fmt(end);

  let compareFrom = null;
  let compareTo = null;
  if (compare && from && to) {
    const startMs = new Date(from).getTime();
    const endMs = new Date(to).getTime();
    const days = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    const prevEnd = new Date(from);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    compareFrom = fmt(prevStart);
    compareTo = fmt(prevEnd);
  }

  return { preset, from, to, compare, compareFrom, compareTo };
}

async function aggregateKpi(tenantId, actingUser, from, to, managerId) {
  const us = buildUserScope(actingUser);
  const mgr = buildManagerTeamFilter(actingUser, managerId);
  const fromD = dateOnly(from);
  const toD = dateOnly(to);
  if (!fromD || !toD) {
    return {};
  }
  const baseParams = [tenantId, fromD, toD, ...us.params, ...mgr.params];
  const scopeSql = `${us.sql}${mgr.sql}${PERF_REPORTS_AGENT_ROLE_SQL}`;

  const [dialRows, sessionRows, meetingStatusRows, attendanceRows, fuRows, taskRows, oppRows] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS dial_attempts,
           SUM(CASE WHEN cca.is_connected = 1 THEN 1 ELSE 0 END) AS dial_connected
         FROM contact_call_attempts cca
         INNER JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id AND u.is_deleted = 0
         WHERE cca.tenant_id = ?
           AND cca.agent_user_id IS NOT NULL
           AND DATE(cca.created_at) >= ? AND DATE(cca.created_at) <= ?
           ${scopeSql}`,
        baseParams
      ),
      query(
        `SELECT COUNT(*) AS dialer_sessions
         FROM dialer_sessions ds
         INNER JOIN users u ON u.id = ds.created_by_user_id AND u.tenant_id = ds.tenant_id AND u.is_deleted = 0
         WHERE ds.tenant_id = ?
           AND ds.created_by_user_id IS NOT NULL
           AND DATE(ds.created_at) >= ? AND DATE(ds.created_at) <= ?
           ${scopeSql}`,
        baseParams
      ),
      query(
        `SELECT tm.meeting_status AS meeting_status, COUNT(*) AS cnt
         FROM tenant_meetings tm
         INNER JOIN users u ON u.tenant_id = tm.tenant_id AND u.is_deleted = 0
           AND u.id = COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id)
         WHERE tm.tenant_id = ?
           AND tm.deleted_at IS NULL
           AND COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id) IS NOT NULL
           AND DATE(tm.start_at) >= ? AND DATE(tm.start_at) <= ?
           ${scopeSql}
         GROUP BY tm.meeting_status`,
        baseParams
      ),
      query(
        `SELECT tm.attendance_status AS attendance_status, COUNT(*) AS cnt
         FROM tenant_meetings tm
         INNER JOIN users u ON u.tenant_id = tm.tenant_id AND u.is_deleted = 0
           AND u.id = COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id)
         WHERE tm.tenant_id = ?
           AND tm.deleted_at IS NULL
           AND COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id) IS NOT NULL
           AND DATE(tm.start_at) >= ? AND DATE(tm.start_at) <= ?
           ${scopeSql}
         GROUP BY tm.attendance_status`,
        baseParams
      ),
      query(
        `SELECT
           SUM(CASE WHEN sc.status = 'pending' THEN 1 ELSE 0 END) AS follow_ups_pending,
           SUM(CASE WHEN sc.status = 'completed' AND DATE(sc.completed_at) >= ? AND DATE(sc.completed_at) <= ? THEN 1 ELSE 0 END) AS follow_ups_completed_in_period,
           SUM(CASE WHEN sc.status = 'cancelled' THEN 1 ELSE 0 END) AS follow_ups_cancelled,
           COUNT(*) AS follow_ups_touched
         FROM scheduled_callbacks sc
         INNER JOIN users u ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
         WHERE sc.tenant_id = ?
           AND sc.deleted_at IS NULL
           AND sc.status IN ('pending', 'completed', 'cancelled')
           AND DATE(sc.scheduled_at) >= ? AND DATE(sc.scheduled_at) <= ?
           ${scopeSql}`,
        [tenantId, fromD, toD, fromD, toD, ...us.params, ...mgr.params]
      ),
      query(
        `SELECT
           SUM(l.achieved_calls) AS sum_achieved_calls,
           SUM(l.achieved_meetings) AS sum_achieved_meetings,
           SUM(l.achieved_deals) AS sum_achieved_deals,
           AVG(l.score) AS avg_task_score
         FROM daily_task_logs l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
         WHERE l.tenant_id = ?
           AND l.deleted_at IS NULL
           AND l.task_date >= ? AND l.task_date <= ?
           ${scopeSql}`,
        baseParams
      ),
      query(
        `SELECT
           COUNT(*) AS opportunities_created,
           COALESCE(SUM(COALESCE(o.amount, o.expected_revenue, 0)), 0) AS opportunities_amount
         FROM opportunities o
         INNER JOIN users u ON u.tenant_id = o.tenant_id AND u.is_deleted = 0
           AND u.id = COALESCE(o.owner_id, o.created_by)
         WHERE o.tenant_id = ?
           AND o.deleted_at IS NULL
           AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
           ${scopeSql}`,
        baseParams
      ),
    ]);

  const dialRow = dialRows[0] || {};
  const sessionRow = sessionRows[0] || {};
  const fuRow = fuRows[0] || {};
  const taskRow = taskRows[0] || {};
  const oppRow = oppRows[0] || {};

  const meetingsByStatus = {};
  for (const r of meetingStatusRows || []) {
    meetingsByStatus[r.meeting_status] = num(r.cnt);
  }
  const attendanceByStatus = {};
  for (const r of attendanceRows || []) {
    attendanceByStatus[r.attendance_status] = num(r.cnt);
  }

  const attempts = num(dialRow?.dial_attempts);
  const connected = num(dialRow?.dial_connected);

  return {
    dial_attempts: attempts,
    dial_connected: connected,
    connect_rate: attempts > 0 ? Number((connected / attempts).toFixed(4)) : 0,
    dialer_sessions: num(sessionRow?.dialer_sessions),
    meetings_scheduled: num(meetingsByStatus.scheduled),
    meetings_completed: num(meetingsByStatus.completed),
    meetings_cancelled: num(meetingsByStatus.cancelled),
    meetings_rescheduled: num(meetingsByStatus.rescheduled),
    attendance: attendanceByStatus,
    follow_ups_pending: num(fuRow?.follow_ups_pending),
    follow_ups_completed_in_period: num(fuRow?.follow_ups_completed_in_period),
    follow_ups_cancelled: num(fuRow?.follow_ups_cancelled),
    follow_ups_touched: num(fuRow?.follow_ups_touched),
    task_achieved_calls: num(taskRow?.sum_achieved_calls),
    task_achieved_meetings: num(taskRow?.sum_achieved_meetings),
    task_achieved_deals: num(taskRow?.sum_achieved_deals),
    task_avg_score: taskRow?.avg_task_score != null ? Number(Number(taskRow.avg_task_score).toFixed(2)) : 0,
    opportunities_created: num(oppRow?.opportunities_created),
    opportunities_amount: oppRow?.opportunities_amount != null ? Number(Number(oppRow.opportunities_amount).toFixed(2)) : 0,
  };
}

export async function getReportsContext(tenantId, actingUser, queryParams) {
  const period = resolveReportingPeriod(queryParams || {});
  const role = String(actingUser?.role || 'agent').toLowerCase();
  return {
    tenant_id: tenantId,
    role,
    period: {
      preset: period.preset,
      from: period.from,
      to: period.to,
      compare: period.compare,
      compareFrom: period.compareFrom,
      compareTo: period.compareTo,
    },
  };
}

export async function getKpiSummary(tenantId, actingUser, queryParams) {
  const period = resolveReportingPeriod(queryParams || {});
  const managerId = queryParams.manager_id ?? queryParams.managerId;
  const current = await aggregateKpi(tenantId, actingUser, period.from, period.to, managerId);
  let previous = null;
  if (period.compare && period.compareFrom && period.compareTo) {
    previous = await aggregateKpi(tenantId, actingUser, period.compareFrom, period.compareTo, managerId);
  }
  return {
    period: {
      preset: period.preset,
      from: period.from,
      to: period.to,
      compare: period.compare,
      compareFrom: period.compareFrom,
      compareTo: period.compareTo,
    },
    current,
    previous,
  };
}

function rollupTeamFromSummary(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.manager_id != null ? String(r.manager_id) : '_none';
    const label = (r.manager_name && String(r.manager_name).trim()) || 'No manager assigned';
    if (!map.has(key)) {
      map.set(key, {
        manager_id: r.manager_id,
        manager_name: label,
        agent_count: 0,
        sum_avg_score: 0,
        sum_achieved_calls: 0,
        sum_achieved_meetings: 0,
        sum_achieved_deals: 0,
        crm_total_calls: 0,
        crm_opportunities_amount: 0,
      });
    }
    const b = map.get(key);
    b.agent_count += 1;
    b.sum_avg_score += num(r.avg_score);
    b.sum_achieved_calls += num(r.achieved_calls);
    b.sum_achieved_meetings += num(r.achieved_meetings);
    b.sum_achieved_deals += num(r.achieved_deals);
    b.crm_total_calls += num(r.crm_total_calls);
    b.crm_opportunities_amount += num(r.crm_opportunities_amount);
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      avg_score: t.agent_count > 0 ? Number((t.sum_avg_score / t.agent_count).toFixed(2)) : 0,
    }))
    .sort((a, b) => (a.manager_name || '').localeCompare(b.manager_name || ''));
}

export async function getTeamsRollup(tenantId, actingUser, queryParams) {
  const period = resolveReportingPeriod(queryParams || {});
  const managerId = queryParams.manager_id ?? queryParams.managerId;
  const rows = await taskManagerService.getRolewiseSummary(tenantId, actingUser, {
    from: period.from,
    to: period.to,
    managerId,
  });
  return {
    period: { from: period.from, to: period.to },
    teams: rollupTeamFromSummary(rows),
  };
}

const LEADERBOARD_METRICS = {
  avg_score: 'avg_score',
  crm_total_calls: 'crm_total_calls',
  achieved_calls: 'achieved_calls',
  achieved_meetings: 'achieved_meetings',
  achieved_deals: 'achieved_deals',
  crm_opportunities_amount: 'crm_opportunities_amount',
  consistency_score: 'consistency_score',
};

export async function getLeaderboard(tenantId, actingUser, queryParams) {
  const period = resolveReportingPeriod(queryParams || {});
  const managerId = queryParams.manager_id ?? queryParams.managerId;
  const metric = LEADERBOARD_METRICS[String(queryParams.metric || '').toLowerCase()] || 'avg_score';
  const limit = Math.min(50, Math.max(5, num(queryParams.limit, 15)));
  const rows = await taskManagerService.getRolewiseSummary(tenantId, actingUser, {
    from: period.from,
    to: period.to,
    managerId,
  });
  const sorted = [...rows].sort((a, b) => num(b[metric]) - num(a[metric]));
  return {
    period: { from: period.from, to: period.to },
    metric,
    rows: sorted.slice(0, limit).map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      user_name: r.user_name,
      manager_name: r.manager_name,
      value: num(r[metric]),
    })),
  };
}

export async function getNestInsightsBundle(tenantId, actingUser, queryParams) {
  const period = resolveReportingPeriod(queryParams || {});
  const managerId = queryParams.manager_id ?? queryParams.managerId;
  const cfg = await taskManagerService.getScoringSettings(tenantId);
  const thresholds = {
    connect_rate_floor: 0.12,
    follow_up_completion_floor: 0.35,
    min_dial_samples: 40,
    coaching_missed_days: num(cfg?.coaching_missed_days_threshold, 3),
    coaching_consistency: num(cfg?.coaching_consistency_threshold, 60),
    medium_score: num(cfg?.medium_performance_threshold, 75),
  };

  const [kpiCurrent, kpiPrevious, summaryRows] = await Promise.all([
    aggregateKpi(tenantId, actingUser, period.from, period.to, managerId),
    period.compare && period.compareFrom && period.compareTo
      ? aggregateKpi(tenantId, actingUser, period.compareFrom, period.compareTo, managerId)
      : Promise.resolve(null),
    taskManagerService.getRolewiseSummary(tenantId, actingUser, {
      from: period.from,
      to: period.to,
      managerId,
    }),
  ]);

  const role = String(actingUser?.role || 'agent').toLowerCase();
  const insights = buildNestInsights({
    role,
    kpiCurrent,
    kpiPrevious,
    summaryRows,
    thresholds,
  });

  return {
    period: {
      preset: period.preset,
      from: period.from,
      to: period.to,
      compare: period.compare,
      compareFrom: period.compareFrom,
      compareTo: period.compareTo,
    },
    kpi: { current: kpiCurrent, previous: kpiPrevious },
    nest_insights: insights,
  };
}
