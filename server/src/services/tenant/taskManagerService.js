import { query } from '../../config/db.js';
import { createAndDispatchNotification } from './notificationService.js';

const TASK_TYPE_VALUES = new Set(['todo', 'meeting', 'call', 'deal']);
const PRIORITY_VALUES = new Set(['low', 'medium', 'high']);

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mysqlDateTime(v) {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const normalized = raw.replace('T', ' ').replace(/\.\d+$/, '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
  return null;
}

function normalizeTaskType(v) {
  const x = String(v || '').trim().toLowerCase();
  return TASK_TYPE_VALUES.has(x) ? x : 'todo';
}

function normalizePriority(v) {
  const x = String(v || '').trim().toLowerCase();
  return PRIORITY_VALUES.has(x) ? x : 'medium';
}

function normalizeIdArray(v) {
  if (v == null) return [];
  let arr = v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      arr = JSON.parse(s);
    } catch {
      arr = s.split(',').map((x) => x.trim());
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    const id = Number(x);
    if (Number.isFinite(id) && id > 0) out.push(Math.floor(id));
  }
  return [...new Set(out)];
}

function assertCanManageTasks(user) {
  const role = String(user?.role || '').toLowerCase();
  const perms = user?.permissions || [];
  if (role === 'admin') return true;
  if (role === 'manager' && perms.includes('tasks.manage')) return true;
  const err = new Error('Permission denied');
  err.status = 403;
  throw err;
}

function buildUserScope(actingUser) {
  const role = String(actingUser?.role || '').toLowerCase();
  if (role === 'admin') return { sql: '', params: [] };
  if (role === 'manager') return { sql: ' AND (u.manager_id = ? OR u.id = ?) ', params: [actingUser.id, actingUser.id] };
  return { sql: ' AND u.id = ? ', params: [actingUser.id] };
}

/** Performance reports (summary, trend, calendar, CRM rollups, dials-by-hour): agents only — not tenant admins/managers. */
const PERF_REPORTS_AGENT_ROLE_SQL = ` AND LOWER(TRIM(COALESCE(u.role, ''))) = 'agent' `;

async function getScoringConfig(tenantId) {
  const [row] = await query(
    `SELECT calls_weight, meetings_weight, deals_weight, low_performance_threshold, medium_performance_threshold,
            coaching_missed_days_threshold, coaching_consistency_threshold
     FROM task_scoring_config
     WHERE tenant_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId]
  );
  return (
    row || {
      calls_weight: 30,
      meetings_weight: 30,
      deals_weight: 40,
      low_performance_threshold: 50,
      medium_performance_threshold: 75,
      coaching_missed_days_threshold: 3,
      coaching_consistency_threshold: 60,
    }
  );
}

function scoreFromWeights(targets, achieved, cfg) {
  const callsWeight = Math.max(0, n(cfg.calls_weight));
  const meetingsWeight = Math.max(0, n(cfg.meetings_weight));
  const dealsWeight = Math.max(0, n(cfg.deals_weight));
  const weightedParts = [];

  if (n(targets.calls) > 0) {
    weightedParts.push({
      weight: callsWeight,
      ratio: Math.min(1, n(achieved.calls) / Math.max(1, n(targets.calls))),
    });
  }
  if (n(targets.meetings) > 0) {
    weightedParts.push({
      weight: meetingsWeight,
      ratio: Math.min(1, n(achieved.meetings) / Math.max(1, n(targets.meetings))),
    });
  }
  if (n(targets.deals) > 0) {
    weightedParts.push({
      weight: dealsWeight,
      ratio: Math.min(1, n(achieved.deals) / Math.max(1, n(targets.deals))),
    });
  }

  if (weightedParts.length === 0) return 0;

  let totalWeight = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) totalWeight = weightedParts.length;

  const weightedScore = weightedParts.reduce((sum, part) => {
    const normalizedWeight = part.weight > 0 ? part.weight / totalWeight : 1 / totalWeight;
    return sum + part.ratio * normalizedWeight;
  }, 0);

  return Number((weightedScore * 100).toFixed(2));
}

function completionPercent(targets, achieved) {
  const dims = [
    [n(targets.calls), n(achieved.calls)],
    [n(targets.meetings), n(achieved.meetings)],
    [n(targets.deals), n(achieved.deals)],
  ];
  const parts = [];
  for (const [t, a] of dims) {
    if (t <= 0) continue;
    parts.push(Math.min(100, (n(a) / Math.max(1, t)) * 100));
  }
  if (!parts.length) {
    const anyAch = dims.some(([, a]) => n(a) > 0);
    return anyAch ? 100 : 0;
  }
  return Number((parts.reduce((s, p) => s + p, 0) / parts.length).toFixed(2));
}

/** Pending / in_progress / achieved use per-dimension targets (not summed). */
function logStatus(targets, achieved) {
  const dims = [
    [n(targets.calls), n(achieved.calls)],
    [n(targets.meetings), n(achieved.meetings)],
    [n(targets.deals), n(achieved.deals)],
  ];
  const active = dims.filter(([t]) => t > 0);
  if (!active.length) return 'no_task';
  const allMet = active.every(([t, a]) => n(a) >= t);
  if (allMet) return 'achieved';
  const anyProgress = active.some(([, a]) => n(a) > 0);
  if (!anyProgress) return 'pending';
  return 'in_progress';
}

function finalizedLogStatus(targets, achieved, taskDateYmd, todayYmd) {
  let status = logStatus(targets, achieved);
  if (taskDateYmd && todayYmd && taskDateYmd < todayYmd && status !== 'achieved' && status !== 'no_task') {
    status = 'missed';
  }
  return status;
}

export async function listTemplates(tenantId, { includeInactive = false } = {}) {
  const rows = await query(
    `SELECT id, tenant_id, name, description, target_calls, target_meetings, target_deals, is_active, created_at, updated_at
     FROM task_templates
     WHERE tenant_id = ? AND deleted_at IS NULL ${includeInactive ? '' : 'AND is_active = 1'}
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function createTemplate(tenantId, actingUser, payload) {
  assertCanManageTasks(actingUser);
  const name = String(payload?.name || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const result = await query(
    `INSERT INTO task_templates (
      tenant_id, name, description, target_calls, target_meetings, target_deals, is_active, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      payload?.description ? String(payload.description).trim() : null,
      Math.max(0, n(payload?.target_calls)),
      Math.max(0, n(payload?.target_meetings)),
      Math.max(0, n(payload?.target_deals)),
      payload?.is_active === false ? 0 : 1,
      actingUser?.id ?? null,
      actingUser?.id ?? null,
    ]
  );
  const [row] = await query(
    `SELECT id, tenant_id, name, description, target_calls, target_meetings, target_deals, is_active, created_at, updated_at
     FROM task_templates WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, result.insertId]
  );
  return row;
}

function eachDate(from, to, cb) {
  const d = new Date(`${from}T00:00:00`);
  const e = new Date(`${to}T00:00:00`);
  while (d <= e) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    cb(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
}

function shouldCreateForDate(pattern, ymd) {
  if (!pattern || typeof pattern !== 'object') return true;
  if (!Array.isArray(pattern.weekdays) || pattern.weekdays.length < 1) return true;
  const d = new Date(`${ymd}T00:00:00`);
  const wd = d.getDay();
  return pattern.weekdays.map((x) => Number(x)).includes(wd);
}

async function createDailyLogsForAssignment(tenantId, assignment, actingUserId) {
  const cfg = await getScoringConfig(tenantId);
  const patt = assignment.recurring_pattern ? JSON.parse(assignment.recurring_pattern) : null;
  const startDate = dateOnly(assignment.start_date);
  const endDate = dateOnly(assignment.end_date);
  if (!startDate || !endDate || startDate > endDate) return;
  const dates = [];
  eachDate(startDate, endDate, (ymd) => {
    if (assignment.schedule_type === 'recurring') {
      if (shouldCreateForDate(patt, ymd)) dates.push(ymd);
    } else {
      dates.push(ymd);
    }
  });
  for (const ymd of dates) {
    const targets = {
      calls: n(assignment.target_calls),
      meetings: n(assignment.target_meetings),
      deals: n(assignment.target_deals),
    };
    const achieved = { calls: 0, meetings: 0, deals: 0 };
    const completion = completionPercent(targets, achieved);
    const score = scoreFromWeights(targets, achieved, cfg);
    const status = logStatus(targets, achieved);
    await query(
      `INSERT INTO daily_task_logs (
        tenant_id, assignment_id, user_id, task_date, target_calls, target_meetings, target_deals,
        achieved_calls, achieved_meetings, achieved_deals, completion_percent, score, status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        target_calls = VALUES(target_calls),
        target_meetings = VALUES(target_meetings),
        target_deals = VALUES(target_deals),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP`,
      [
        tenantId,
        assignment.id,
        assignment.assigned_to_user_id,
        ymd,
        targets.calls,
        targets.meetings,
        targets.deals,
        achieved.calls,
        achieved.meetings,
        achieved.deals,
        completion,
        score,
        status,
        actingUserId ?? null,
        actingUserId ?? null,
      ]
    );
  }
}

async function backfillDailyLogsInRange(tenantId, actingUser, { from, to, userId } = {}) {
  const fromDate = dateOnly(from);
  const toDate = dateOnly(to);
  if (!fromDate || !toDate) return;
  const us = buildUserScope(actingUser);
  const where = [
    'a.tenant_id = ?',
    'a.deleted_at IS NULL',
    "a.status IN ('active', 'paused')",
    "COALESCE(DATE(a.end_at), a.end_date) >= ?",
    "COALESCE(DATE(a.start_at), a.start_date) <= ?",
  ];
  const params = [tenantId, fromDate, toDate];
  if (userId) {
    where.push('a.assigned_to_user_id = ?');
    params.push(Number(userId));
  }
  const assignments = await query(
    `SELECT a.id, a.assigned_to_user_id, a.schedule_type, a.recurring_pattern,
            COALESCE(DATE(a.start_at), a.start_date) AS start_ymd,
            COALESCE(DATE(a.end_at), a.end_date) AS end_ymd,
            a.start_date, a.end_date, a.start_at, a.end_at,
            a.target_calls, a.target_meetings, a.target_deals
     FROM task_assignments a
     INNER JOIN users u ON u.id = a.assigned_to_user_id AND u.tenant_id = a.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}`,
    [...params, ...us.params]
  );
  if (!assignments.length) return;
  for (const assignment of assignments) {
    const patt = assignment.recurring_pattern ? JSON.parse(assignment.recurring_pattern) : null;
    const assignmentStart = dateOnly(assignment.start_ymd || assignment.start_date);
    const assignmentEnd = dateOnly(assignment.end_ymd || assignment.end_date);
    if (!assignmentStart || !assignmentEnd) continue;
    const fromYmd = assignmentStart > fromDate ? assignmentStart : fromDate;
    const toYmd = assignmentEnd < toDate ? assignmentEnd : toDate;
    if (fromYmd > toYmd) continue;
    const dates = [];
    eachDate(fromYmd, toYmd, (ymd) => {
      dates.push(ymd);
    });
    for (const ymd of dates) {
      if (assignment.schedule_type === 'recurring' && !shouldCreateForDate(patt, ymd)) continue;
      await query(
        `INSERT INTO daily_task_logs (
          tenant_id, assignment_id, user_id, task_date, target_calls, target_meetings, target_deals,
          achieved_calls, achieved_meetings, achieved_deals, completion_percent, score, status, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'pending', ?, ?)
        ON DUPLICATE KEY UPDATE
          target_calls = VALUES(target_calls),
          target_meetings = VALUES(target_meetings),
          target_deals = VALUES(target_deals),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [
          tenantId,
          assignment.id,
          assignment.assigned_to_user_id,
          ymd,
          Math.max(0, n(assignment.target_calls)),
          Math.max(0, n(assignment.target_meetings)),
          Math.max(0, n(assignment.target_deals)),
          actingUser?.id ?? null,
          actingUser?.id ?? null,
        ]
      );
    }
  }
}

export async function createAssignment(tenantId, actingUser, payload) {
  assertCanManageTasks(actingUser);
  const assignedTo = Number(payload?.assigned_to_user_id);
  if (!Number.isFinite(assignedTo) || assignedTo <= 0) {
    const err = new Error('assigned_to_user_id is required');
    err.status = 400;
    throw err;
  }
  const [assignee] = await query(
    `SELECT id, role, manager_id FROM users WHERE tenant_id = ? AND id = ? AND is_deleted = 0 LIMIT 1`,
    [tenantId, assignedTo]
  );
  if (!assignee || !['agent', 'manager', 'admin'].includes(String(assignee.role || '').toLowerCase())) {
    const err = new Error('Invalid assignee');
    err.status = 400;
    throw err;
  }
  const actorRole = String(actingUser?.role || '').toLowerCase();
  const assigneeRole = String(assignee.role || '').toLowerCase();
  if (actorRole === 'manager') {
    const isSelf = Number(assignee.id) === Number(actingUser.id);
    const isOwnAgent = assigneeRole === 'agent' && Number(assignee.manager_id) === Number(actingUser.id);
    if (!(isSelf || isOwnAgent)) {
      const err = new Error('Managers can assign only to self or their agents');
      err.status = 403;
      throw err;
    }
  }
  const startDate = dateOnly(payload?.start_date);
  const endDate = dateOnly(payload?.end_date || payload?.start_date);
  const startAt =
    mysqlDateTime(payload?.start_at) || (startDate ? `${startDate} 00:00:00` : null);
  const endAt = mysqlDateTime(payload?.end_at) || (endDate ? `${endDate} 23:59:59` : null);
  if (!startDate || !endDate || startDate > endDate) {
    const err = new Error('Invalid start_date/end_date');
    err.status = 400;
    throw err;
  }

  let template = null;
  if (payload?.template_id) {
    const [tmp] = await query(
      `SELECT id, name, description, target_calls, target_meetings, target_deals
       FROM task_templates WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId, Number(payload.template_id)]
    );
    template = tmp || null;
  }
  const title = String(payload?.title || template?.name || '').trim();
  if (!title) {
    const err = new Error('title is required');
    err.status = 400;
    throw err;
  }
  const taskType = normalizeTaskType(payload?.task_type);
  const priority = normalizePriority(payload?.priority);
  const duePreset = payload?.due_preset ? String(payload.due_preset).trim().slice(0, 40) : null;
  const associatedMeetingId = Number(payload?.associated_meeting_id);
  const meetingId = Number.isFinite(associatedMeetingId) && associatedMeetingId > 0 ? associatedMeetingId : null;
  const reminderAt = mysqlDateTime(payload?.reminder_at);
  const repeatEnabled = payload?.repeat_enabled === true ? 1 : 0;
  const suggestionCampaignIds = taskType === 'todo' || taskType === 'call' ? normalizeIdArray(payload?.suggestion_campaign_ids) : [];
  const suggestionTagIds = taskType === 'todo' || taskType === 'call' ? normalizeIdArray(payload?.suggestion_tag_ids) : [];
  const suggestionEmailAccountIds =
    taskType === 'todo' || taskType === 'meeting' ? normalizeIdArray(payload?.suggestion_email_account_ids) : [];
  const repeatIntervalDaysRaw = Number(payload?.repeat_interval_days);
  const repeatIntervalDays =
    repeatEnabled && Number.isFinite(repeatIntervalDaysRaw) && repeatIntervalDaysRaw > 0
      ? Math.min(365, Math.floor(repeatIntervalDaysRaw))
      : null;

  if (meetingId) {
    const [meeting] = await query(
      `SELECT id
       FROM tenant_meetings
       WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId, meetingId]
    );
    if (!meeting) {
      const err = new Error('Associated meeting not found');
      err.status = 404;
      throw err;
    }
  }

  const inputCalls = Math.max(0, n(payload?.target_calls, template?.target_calls || 0));
  let inputMeetings = Math.max(0, n(payload?.target_meetings, template?.target_meetings || 0));
  const inputDeals = Math.max(0, n(payload?.target_deals, template?.target_deals || 0));
  if (taskType === 'meeting' && meetingId) inputMeetings = Math.max(1, inputMeetings);
  const targetCalls = taskType === 'call' || taskType === 'todo' ? inputCalls : 0;
  const targetMeetings = taskType === 'meeting' || taskType === 'todo' ? inputMeetings : 0;
  const targetDeals = taskType === 'deal' || taskType === 'todo' ? inputDeals : 0;
  if (taskType === 'meeting' && targetMeetings <= 0) {
    const err = new Error('target_meetings must be greater than 0 for meeting tasks');
    err.status = 400;
    throw err;
  }
  if (taskType === 'call' && targetCalls <= 0) {
    const err = new Error('target_calls must be greater than 0 for call tasks');
    err.status = 400;
    throw err;
  }
  if (taskType === 'deal' && targetDeals <= 0) {
    const err = new Error('target_deals must be greater than 0 for deal tasks');
    err.status = 400;
    throw err;
  }
  if (taskType === 'todo' && targetCalls <= 0 && targetMeetings <= 0 && targetDeals <= 0) {
    const err = new Error('At least one target must be greater than 0');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO task_assignments (
      tenant_id, template_id, title, description, task_type, priority, due_preset, associated_meeting_id, reminder_at,
      suggestion_campaign_ids, suggestion_tag_ids, suggestion_email_account_ids, repeat_enabled, repeat_interval_days, assigned_to_user_id, assigned_by_user_id, schedule_type, recurring_pattern,
      start_date, end_date, start_at, end_at, target_calls, target_meetings, target_deals, status, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      template?.id || null,
      title,
      payload?.description ? String(payload.description).trim() : template?.description || null,
      taskType,
      priority,
      duePreset,
      meetingId,
      reminderAt,
      JSON.stringify(suggestionCampaignIds),
      JSON.stringify(suggestionTagIds),
      JSON.stringify(suggestionEmailAccountIds),
      repeatEnabled,
      repeatIntervalDays,
      assignedTo,
      actingUser.id,
      ['one_time', 'date_range', 'recurring'].includes(payload?.schedule_type) ? payload.schedule_type : 'one_time',
      payload?.schedule_type === 'recurring' && payload?.recurring_pattern
        ? JSON.stringify(payload.recurring_pattern)
        : null,
      startDate,
      endDate,
      startAt,
      endAt,
      targetCalls,
      targetMeetings,
      targetDeals,
      'active',
      actingUser.id,
      actingUser.id,
    ]
  );
  const [row] = await query(
    `SELECT * FROM task_assignments WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, result.insertId]
  );
  await createDailyLogsForAssignment(tenantId, row, actingUser.id);
  await createAndDispatchNotification(tenantId, actingUser.id, {
    moduleKey: 'tasks',
    eventType: 'task_assigned',
    severity: 'high',
    title: `New task assigned: ${row?.title || 'Task'}`,
    body: row?.start_date ? `From ${row.start_date} to ${row.end_date}` : '',
    assignedUserId: row?.assigned_to_user_id,
    recipientUserIds: row?.assigned_to_user_id ? [Number(row.assigned_to_user_id)] : [],
    entityType: 'task_assignment',
    entityId: row?.id,
    ctaPath: '/task-manager',
    eventHash: `task:assigned:${tenantId}:${row?.id}`,
  });
  if (reminderAt) {
    await createAndDispatchNotification(tenantId, actingUser.id, {
      moduleKey: 'tasks',
      eventType: 'task_reminder_scheduled',
      severity: 'normal',
      title: `Reminder set for task: ${row?.title || 'Task'}`,
      body: `Reminder at ${reminderAt}`,
      assignedUserId: row?.assigned_to_user_id,
      recipientUserIds: row?.assigned_to_user_id ? [Number(row.assigned_to_user_id)] : [],
      entityType: 'task_assignment',
      entityId: row?.id,
      ctaPath: '/task-manager',
      eventHash: `task:reminder:scheduled:${tenantId}:${row?.id}:${reminderAt}`,
    });
  }
  return row;
}

export async function deleteAssignment(tenantId, actingUser, assignmentId) {
  assertCanManageTasks(actingUser);
  const id = Number(assignmentId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid assignment id');
    err.status = 400;
    throw err;
  }
  const [row] = await query(
    `SELECT id, assigned_to_user_id, title FROM task_assignments
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, id]
  );
  if (!row) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }
  const [assignee] = await query(
    `SELECT id, role, manager_id FROM users WHERE tenant_id = ? AND id = ? AND is_deleted = 0 LIMIT 1`,
    [tenantId, row.assigned_to_user_id]
  );
  if (!assignee || !['agent', 'manager', 'admin'].includes(String(assignee.role || '').toLowerCase())) {
    const err = new Error('Invalid assignee');
    err.status = 400;
    throw err;
  }
  const actorRole = String(actingUser?.role || '').toLowerCase();
  const assigneeRole = String(assignee.role || '').toLowerCase();
  if (actorRole === 'manager') {
    const isSelf = Number(assignee.id) === Number(actingUser.id);
    const isOwnAgent = assigneeRole === 'agent' && Number(assignee.manager_id) === Number(actingUser.id);
    if (!(isSelf || isOwnAgent)) {
      const err = new Error('Managers can only delete tasks for self or agents on their team');
      err.status = 403;
      throw err;
    }
  }
  const uid = actingUser?.id ?? null;
  await query(
    `UPDATE task_assignments
     SET deleted_at = NOW(), deleted_by = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, id]
  );
  await query(
    `UPDATE daily_task_logs
     SET deleted_at = NOW(), active_row = 0, deleted_by = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND assignment_id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, id]
  );
  return { id, title: row.title };
}

export async function listAssignments(tenantId, actingUser, { from, to, userId, status, limit = 300 } = {}) {
  const us = buildUserScope(actingUser);
  const where = ['a.tenant_id = ?', 'a.deleted_at IS NULL'];
  const params = [tenantId];
  if (from) {
    where.push('a.end_date >= ?');
    params.push(dateOnly(from));
  }
  if (to) {
    where.push('a.start_date <= ?');
    params.push(dateOnly(to));
  }
  if (status) {
    where.push('a.status = ?');
    params.push(String(status));
  }
  if (userId) {
    where.push('a.assigned_to_user_id = ?');
    params.push(Number(userId));
  }
  const lim = Math.max(1, Math.min(500, Number(limit) || 300));
  const rows = await query(
    `SELECT a.*, u.name AS assigned_to_name, u.role AS assigned_to_role, ub.name AS assigned_by_name
     FROM task_assignments a
     INNER JOIN users u ON u.id = a.assigned_to_user_id AND u.tenant_id = a.tenant_id AND u.is_deleted = 0
     LEFT JOIN users ub ON ub.id = a.assigned_by_user_id AND ub.tenant_id = a.tenant_id
     WHERE ${where.join(' AND ')} ${us.sql}
     ORDER BY COALESCE(a.start_at, CONCAT(a.start_date, ' 00:00:00')) DESC, a.id DESC
     LIMIT ${lim}`,
    [...params, ...us.params]
  );
  return rows;
}

async function computeAchievementForDay(tenantId, userId, ymd) {
  const [calls] = await query(
    `SELECT COUNT(*) AS c FROM contact_call_attempts
     WHERE tenant_id = ? AND agent_user_id = ? AND DATE(COALESCE(started_at, created_at)) = ?`,
    [tenantId, userId, ymd]
  );
  const [meetings] = await query(
    `SELECT COUNT(*) AS c FROM tenant_meetings
     WHERE tenant_id = ? AND assigned_user_id = ? AND deleted_at IS NULL AND DATE(start_at) = ?`,
    [tenantId, userId, ymd]
  );
  const [deals] = await query(
    `SELECT COUNT(*) AS c FROM opportunities
     WHERE tenant_id = ? AND owner_id = ? AND deleted_at IS NULL AND DATE(updated_at) = ?`,
    [tenantId, userId, ymd]
  );
  return {
    calls: Number(calls?.c || 0),
    meetings: Number(meetings?.c || 0),
    deals: Number(deals?.c || 0),
  };
}

export async function recomputeLogs(tenantId, actingUser, { from, to, userId, logId } = {}) {
  const cfg = await getScoringConfig(tenantId);
  const us = buildUserScope(actingUser);
  const todayYmd = dateOnly(new Date());

  // Fast path: stale pending rows on past dates (loop below still corrects status from live metrics).
  if (todayYmd) {
    const overdueWhere = ['l.tenant_id = ?', 'l.deleted_at IS NULL', "l.status = 'pending'", 'l.task_date < ?'];
    const overdueParams = [tenantId, todayYmd];
    if (userId) {
      overdueWhere.push('l.user_id = ?');
      overdueParams.push(Number(userId));
    }
    await query(
      `UPDATE daily_task_logs l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
       SET l.status = 'missed', l.updated_by = ?, l.updated_at = CURRENT_TIMESTAMP
       WHERE ${overdueWhere.join(' AND ')} ${us.sql}`,
      [actingUser?.id ?? null, ...overdueParams, ...us.params]
    );
  }

  const where = ['l.tenant_id = ?', 'l.deleted_at IS NULL'];
  const params = [tenantId];
  if (logId) {
    where.push('l.id = ?');
    params.push(Number(logId));
  } else {
    if (from) {
      where.push('l.task_date >= ?');
      params.push(dateOnly(from));
    }
    if (to) {
      where.push('l.task_date <= ?');
      params.push(dateOnly(to));
    }
    if (userId) {
      where.push('l.user_id = ?');
      params.push(Number(userId));
    }
  }
  const logs = await query(
    `SELECT l.id, l.assignment_id, l.user_id, l.task_date, l.target_calls, l.target_meetings, l.target_deals, l.is_locked, l.status
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}`,
    [...params, ...us.params]
  );
  const nowYmd = dateOnly(new Date());
  for (const log of logs) {
    if (Number(log.is_locked) === 1) continue;
    const achieved = await computeAchievementForDay(tenantId, log.user_id, dateOnly(log.task_date));
    const targets = {
      calls: Number(log.target_calls || 0),
      meetings: Number(log.target_meetings || 0),
      deals: Number(log.target_deals || 0),
    };
    const completion = completionPercent(targets, achieved);
    const score = scoreFromWeights(targets, achieved, cfg);
    const taskDate = dateOnly(log.task_date);
    const status = finalizedLogStatus(targets, achieved, taskDate, nowYmd);
    const oldStatus = String(log.status || '').toLowerCase();
    await query(
      `UPDATE daily_task_logs
       SET achieved_calls = ?, achieved_meetings = ?, achieved_deals = ?, completion_percent = ?, score = ?, status = ?, updated_by = ?
       WHERE tenant_id = ? AND id = ?`,
      [
        achieved.calls,
        achieved.meetings,
        achieved.deals,
        completion,
        score,
        status,
        actingUser?.id ?? null,
        tenantId,
        log.id,
      ]
    );
    if (taskDate && oldStatus !== status && taskDate <= nowYmd && (status === 'achieved' || status === 'missed')) {
      await createAndDispatchNotification(tenantId, actingUser?.id, {
        moduleKey: 'tasks',
        eventType: status === 'achieved' ? 'task_completed' : 'task_missed',
        severity: status === 'achieved' ? 'normal' : 'high',
        title: status === 'achieved' ? 'Task completed' : 'Task missed',
        body: `Task date ${taskDate}`,
        assignedUserId: log.user_id,
        recipientUserIds: log.user_id ? [Number(log.user_id)] : [],
        entityType: 'daily_task_log',
        entityId: log.id,
        ctaPath: '/task-manager',
        eventHash: `task:${status}:${tenantId}:${log.id}:${taskDate}`,
      });
    }
  }
  const reminderRows = await query(
    `SELECT id, title, assigned_to_user_id, reminder_at
     FROM task_assignments
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND status IN ('active', 'paused')
       AND reminder_at IS NOT NULL
       AND reminder_sent_at IS NULL
       AND reminder_at <= NOW()`,
    [tenantId]
  );
  for (const row of reminderRows) {
    await createAndDispatchNotification(tenantId, actingUser?.id, {
      moduleKey: 'tasks',
      eventType: 'task_reminder',
      severity: 'normal',
      title: `Task reminder: ${row.title || 'Task'}`,
      body: row.reminder_at ? `Reminder at ${String(row.reminder_at).replace('T', ' ').slice(0, 16)}` : null,
      assignedUserId: row.assigned_to_user_id,
      recipientUserIds: row.assigned_to_user_id ? [Number(row.assigned_to_user_id)] : [],
      entityType: 'task_assignment',
      entityId: row.id,
      ctaPath: '/task-manager',
      eventHash: `task:reminder:${tenantId}:${row.id}:${String(row.reminder_at || '').slice(0, 16)}`,
    });
    await query(
      `UPDATE task_assignments
       SET reminder_sent_at = NOW(), updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ? AND reminder_sent_at IS NULL`,
      [actingUser?.id ?? null, tenantId, row.id]
    );
  }
  const actorRole = String(actingUser?.role || '').toLowerCase();
  if (!['admin', 'manager'].includes(actorRole)) return { updated: logs.length };
  const repeatCandidates = await query(
    `SELECT id, title, description, task_type, priority, due_preset, associated_meeting_id, assigned_to_user_id,
            assigned_by_user_id, schedule_type, recurring_pattern, end_date, target_calls, target_meetings, target_deals,
            repeat_interval_days
     FROM task_assignments
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND status = 'active'
       AND repeat_enabled = 1
       AND repeat_interval_days IS NOT NULL
       AND end_date < CURDATE()`,
    [tenantId]
  );
  for (const src of repeatCandidates) {
    const [dup] = await query(
      `SELECT id
       FROM task_assignments
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND assigned_to_user_id = ?
         AND title = ?
         AND start_date = DATE_ADD(?, INTERVAL ? DAY)
       LIMIT 1`,
      [tenantId, src.assigned_to_user_id, src.title, src.end_date, Number(src.repeat_interval_days)]
    );
    if (dup?.id) continue;
    const nextStart = dateOnly(
      new Date(new Date(`${dateOnly(src.end_date)}T12:00:00`).getTime() + Number(src.repeat_interval_days) * 86400000)
    );
    if (!nextStart) continue;
    const payload = {
      template_id: null,
      title: src.title,
      description: src.description,
      task_type: src.task_type,
      priority: src.priority,
      due_preset: src.due_preset,
      associated_meeting_id: src.associated_meeting_id,
      assigned_to_user_id: src.assigned_to_user_id,
      schedule_type: 'one_time',
      start_date: nextStart,
      end_date: nextStart,
      target_calls: src.target_calls,
      target_meetings: src.target_meetings,
      target_deals: src.target_deals,
      repeat_enabled: true,
      repeat_interval_days: src.repeat_interval_days,
    };
    await createAssignment(tenantId, { ...actingUser, id: src.assigned_by_user_id || actingUser?.id }, payload);
  }
  return { updated: logs.length };
}

export async function listDailyLogs(
  tenantId,
  actingUser,
  { from, to, userId, page = 1, limit = 20, sort = 'desc', view, as_of, asOf } = {}
) {
  await backfillDailyLogsInRange(tenantId, actingUser, { from, to, userId });
  const us = buildUserScope(actingUser);
  const todayYmd = dateOnly(new Date());
  const currentAnchorYmd = dateOnly(as_of || asOf) || todayYmd;
  const viewMode = String(view || '').toLowerCase();
  const where = ['l.tenant_id = ?', 'l.deleted_at IS NULL'];
  const params = [tenantId];
  if (from) {
    where.push('l.task_date >= ?');
    params.push(dateOnly(from));
  }
  if (to) {
    where.push('l.task_date <= ?');
    params.push(dateOnly(to));
  }
  if (userId) {
    where.push('l.user_id = ?');
    params.push(Number(userId));
  }
  if (viewMode === 'current' && currentAnchorYmd) {
    where.push('l.task_date = ?');
    where.push('COALESCE(DATE(a.start_at), a.start_date) <= ?');
    where.push('COALESCE(DATE(a.end_at), a.end_date) >= ?');
    params.push(currentAnchorYmd, currentAnchorYmd, currentAnchorYmd);
  } else if (viewMode === 'upcoming' && todayYmd) {
    where.push('COALESCE(DATE(a.start_at), a.start_date) > ?');
    params.push(todayYmd);
    where.push(
      'l.task_date = (SELECT MIN(l2.task_date) FROM daily_task_logs l2 WHERE l2.tenant_id = l.tenant_id AND l2.assignment_id = l.assignment_id AND l2.user_id = l.user_id AND l2.deleted_at IS NULL)'
    );
  } else if (viewMode === 'history' && todayYmd) {
    where.push('l.task_date < ?');
    params.push(todayYmd);
    where.push('(a.id IS NULL OR l.task_date = DATE(COALESCE(a.end_at, a.end_date)))');
  }
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const offset = (pg - 1) * lim;
  const orderDir = String(sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderSecondary = orderDir === 'ASC' ? 'ASC' : 'DESC';
  const [countRow] = await query(
    `SELECT COUNT(*) AS c
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     LEFT JOIN task_assignments a ON a.id = l.assignment_id AND a.tenant_id = l.tenant_id AND a.deleted_at IS NULL
     WHERE ${where.join(' AND ')} ${us.sql}`,
    [...params, ...us.params]
  );
  const rows = await query(
    `SELECT l.*, u.name AS user_name, u.role AS user_role, a.title AS assignment_title,
            a.priority AS assignment_priority,
            a.start_date AS assignment_start_date, a.end_date AS assignment_end_date,
            a.start_at AS assignment_start_at, a.end_at AS assignment_end_at,
            CASE
              WHEN COALESCE(DATE(a.start_at), a.start_date) > CURDATE() THEN 'upcoming'
              WHEN l.task_date < CURDATE() THEN 'history'
              ELSE 'current'
            END AS window_status
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     LEFT JOIN task_assignments a ON a.id = l.assignment_id AND a.tenant_id = l.tenant_id AND a.deleted_at IS NULL
     WHERE ${where.join(' AND ')} ${us.sql}
     ORDER BY l.task_date ${orderDir}, l.id ${orderSecondary}
     LIMIT ${lim} OFFSET ${offset}`,
    [...params, ...us.params]
  );
  return {
    rows,
    total: Number(countRow?.c || 0),
    page: pg,
    limit: lim,
    totalPages: Math.max(1, Math.ceil(Number(countRow?.c || 0) / lim)),
  };
}

export async function updateLogNote(tenantId, actingUser, logId, noteType, text) {
  const id = Number(logId);
  const isAgent = noteType === 'agent';
  const role = String(actingUser?.role || '').toLowerCase();
  if (isAgent && role !== 'agent') {
    const err = new Error('Only agents can update agent notes');
    err.status = 403;
    throw err;
  }
  if (!isAgent && !['manager', 'admin'].includes(role)) {
    const err = new Error('Only manager/admin can update manager notes');
    err.status = 403;
    throw err;
  }
  const [row] = await query(
    `SELECT id, user_id, is_locked FROM daily_task_logs
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, id]
  );
  if (!row) {
    const err = new Error('Task log not found');
    err.status = 404;
    throw err;
  }
  if (Number(row.is_locked) === 1) {
    const err = new Error('Task log is locked');
    err.status = 400;
    throw err;
  }
  if (isAgent && Number(row.user_id) !== Number(actingUser.id)) {
    const err = new Error('Cannot edit another user note');
    err.status = 403;
    throw err;
  }
  const note = String(text || '').trim();
  await query(
    `UPDATE daily_task_logs SET ${isAgent ? 'agent_note' : 'manager_note'} = ?, updated_by = ? WHERE tenant_id = ? AND id = ?`,
    [note || null, actingUser.id, tenantId, id]
  );
  await query(
    `INSERT INTO task_note_history (tenant_id, daily_task_log_id, note_type, note_text, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, id, noteType, note || '', actingUser.id, actingUser.id]
  );
  const [updated] = await query(`SELECT * FROM daily_task_logs WHERE tenant_id = ? AND id = ? LIMIT 1`, [tenantId, id]);
  return updated;
}

export async function listNoteHistory(tenantId, actingUser, logId) {
  const id = Number(logId);
  const [log] = await query(
    `SELECT id, user_id FROM daily_task_logs WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, id]
  );
  if (!log) return [];
  if (String(actingUser?.role || '').toLowerCase() === 'agent' && Number(log.user_id) !== Number(actingUser.id)) {
    return [];
  }
  const rows = await query(
    `SELECT h.id, h.note_type, h.note_text, h.created_at, h.created_by, u.name AS author_name, u.role AS author_role
     FROM task_note_history h
     LEFT JOIN users u ON u.id = h.created_by AND u.tenant_id = h.tenant_id
     WHERE h.tenant_id = ? AND h.daily_task_log_id = ? AND h.deleted_at IS NULL
     ORDER BY h.created_at DESC, h.id DESC`,
    [tenantId, id]
  );
  return rows;
}

export async function addAssignmentComment(tenantId, actingUser, assignmentId, commentText) {
  const id = Number(assignmentId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid assignment id');
    err.status = 400;
    throw err;
  }
  const text = String(commentText || '').trim();
  if (!text) {
    const err = new Error('comment is required');
    err.status = 400;
    throw err;
  }
  const [assignment] = await query(
    `SELECT id, title, assigned_to_user_id
     FROM task_assignments
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, id]
  );
  if (!assignment) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }
  await query(
    `INSERT INTO task_assignment_comments (tenant_id, assignment_id, comment_text, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, id, text, actingUser?.id ?? null, actingUser?.id ?? null]
  );
  await createAndDispatchNotification(tenantId, actingUser?.id, {
    moduleKey: 'tasks',
    eventType: 'task_comment_added',
    severity: 'normal',
    title: `New comment on task: ${assignment.title || 'Task'}`,
    body: text.slice(0, 180),
    assignedUserId: assignment.assigned_to_user_id,
    recipientUserIds: assignment.assigned_to_user_id ? [Number(assignment.assigned_to_user_id)] : [],
    entityType: 'task_assignment',
    entityId: assignment.id,
    ctaPath: '/task-manager',
    eventHash: `task:comment:${tenantId}:${assignment.id}:${Date.now()}`,
  });
  return { ok: true };
}

export async function listAssignmentComments(tenantId, actingUser, assignmentId) {
  const id = Number(assignmentId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid assignment id');
    err.status = 400;
    throw err;
  }
  const [assignment] = await query(
    `SELECT id, assigned_to_user_id
     FROM task_assignments
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, id]
  );
  if (!assignment) return [];
  const role = String(actingUser?.role || '').toLowerCase();
  if (role === 'agent' && Number(assignment.assigned_to_user_id) !== Number(actingUser?.id)) {
    return [];
  }
  return query(
    `SELECT c.id, c.comment_text, c.created_at, c.created_by, u.name AS author_name, u.role AS author_role
     FROM task_assignment_comments c
     LEFT JOIN users u ON u.id = c.created_by AND u.tenant_id = c.tenant_id
     WHERE c.tenant_id = ? AND c.assignment_id = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC, c.id DESC`,
    [tenantId, id]
  );
}

async function getAgentCrmRollups(tenantId, actingUser, from, to) {
  const us = buildUserScope(actingUser);
  const fromD = dateOnly(from);
  const toD = dateOnly(to);
  if (!fromD || !toD) {
    return new Map();
  }
  const scopeParams = [...us.params];
  const p = [tenantId, fromD, toD, ...scopeParams];

  const [callsRows, followUpRows, meetingRows, oppRows] = await Promise.all([
    query(
      `SELECT u.id AS user_id, COUNT(*) AS crm_total_calls
       FROM contact_call_attempts cca
       INNER JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id AND u.is_deleted = 0
       WHERE cca.tenant_id = ?
         AND cca.agent_user_id IS NOT NULL
         AND DATE(cca.created_at) >= ? AND DATE(cca.created_at) <= ?
         ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
       GROUP BY u.id`,
      p
    ),
    query(
      `SELECT u.id AS user_id,
              COUNT(*) AS crm_scheduled_follow_ups,
              SUM(CASE WHEN sc.follow_up_type = 'callback' THEN 1 ELSE 0 END) AS crm_follow_up_phone,
              SUM(CASE WHEN sc.follow_up_type = 'email' THEN 1 ELSE 0 END) AS crm_follow_up_email,
              SUM(CASE WHEN sc.follow_up_type = 'meeting' THEN 1 ELSE 0 END) AS crm_follow_up_meeting,
              SUM(CASE WHEN sc.follow_up_type = 'other' THEN 1 ELSE 0 END) AS crm_follow_up_other
       FROM scheduled_callbacks sc
       INNER JOIN users u ON u.id = sc.assigned_user_id AND u.tenant_id = sc.tenant_id AND u.is_deleted = 0
       WHERE sc.tenant_id = ?
         AND sc.deleted_at IS NULL
         AND sc.status IN ('pending', 'completed')
         AND DATE(sc.scheduled_at) >= ? AND DATE(sc.scheduled_at) <= ?
         ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
       GROUP BY u.id`,
      p
    ),
    query(
      `SELECT u.id AS user_id, COUNT(*) AS crm_calendar_meetings
       FROM tenant_meetings tm
       INNER JOIN users u ON u.tenant_id = tm.tenant_id AND u.is_deleted = 0
         AND u.id = COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id)
       WHERE tm.tenant_id = ?
         AND tm.deleted_at IS NULL
         AND COALESCE(tm.assigned_user_id, tm.meeting_owner_user_id) IS NOT NULL
         AND DATE(tm.start_at) >= ? AND DATE(tm.start_at) <= ?
         ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
       GROUP BY u.id`,
      p
    ),
    query(
      `SELECT u.id AS user_id,
              COUNT(*) AS crm_opportunities_count,
              COALESCE(SUM(COALESCE(o.amount, o.expected_revenue, 0)), 0) AS crm_opportunities_amount
       FROM opportunities o
       INNER JOIN users u ON u.tenant_id = o.tenant_id AND u.is_deleted = 0
         AND u.id = COALESCE(o.owner_id, o.created_by)
       WHERE o.tenant_id = ?
         AND o.deleted_at IS NULL
         AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
         ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
       GROUP BY u.id`,
      p
    ),
  ]);

  const map = new Map();
  function ingest(rows, pick) {
    for (const r of rows) {
      const id = Number(r.user_id);
      if (!Number.isFinite(id)) continue;
      const cur = map.get(id) || {};
      map.set(id, { ...cur, ...pick(r) });
    }
  }
  ingest(callsRows, (r) => ({ crm_total_calls: Number(r.crm_total_calls || 0) }));
  ingest(followUpRows, (r) => ({
    crm_scheduled_follow_ups: Number(r.crm_scheduled_follow_ups || 0),
    crm_follow_up_phone: Number(r.crm_follow_up_phone || 0),
    crm_follow_up_email: Number(r.crm_follow_up_email || 0),
    crm_follow_up_meeting: Number(r.crm_follow_up_meeting || 0),
    crm_follow_up_other: Number(r.crm_follow_up_other || 0),
  }));
  ingest(meetingRows, (r) => ({ crm_calendar_meetings: Number(r.crm_calendar_meetings || 0) }));
  ingest(oppRows, (r) => ({
    crm_opportunities_count: Number(r.crm_opportunities_count || 0),
    crm_opportunities_amount: Number(r.crm_opportunities_amount || 0),
  }));
  return map;
}

/**
 * Dial attempts aggregated by clock hour (0–23) for the date range, server local time.
 * Scoped like other performance reports (agent / manager / admin).
 */
export async function getDialsByHour(tenantId, actingUser, { from, to, userId } = {}) {
  const us = buildUserScope(actingUser);
  const where = ['cca.tenant_id = ?', 'cca.agent_user_id IS NOT NULL'];
  const params = [tenantId];
  if (from) {
    where.push('DATE(cca.created_at) >= ?');
    params.push(dateOnly(from));
  }
  if (to) {
    where.push('DATE(cca.created_at) <= ?');
    params.push(dateOnly(to));
  }
  if (userId) {
    where.push('cca.agent_user_id = ?');
    params.push(Number(userId));
  }
  const rows = await query(
    `SELECT HOUR(cca.created_at) AS hour_of_day, COUNT(*) AS dials
     FROM contact_call_attempts cca
     INNER JOIN users u ON u.id = cca.agent_user_id AND u.tenant_id = cca.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
     GROUP BY HOUR(cca.created_at)
     ORDER BY hour_of_day ASC`,
    [...params, ...us.params]
  );
  return rows.map((r) => ({
    hour_of_day: Number(r.hour_of_day),
    dials: Number(r.dials || 0),
  }));
}

export async function getRolewiseSummary(tenantId, actingUser, { from, to, userId } = {}) {
  const us = buildUserScope(actingUser);
  const where = ['l.tenant_id = ?', 'l.deleted_at IS NULL'];
  const params = [tenantId];
  if (from) {
    where.push('l.task_date >= ?');
    params.push(dateOnly(from));
  }
  if (to) {
    where.push('l.task_date <= ?');
    params.push(dateOnly(to));
  }
  if (userId) {
    where.push('l.user_id = ?');
    params.push(Number(userId));
  }
  const rows = await query(
    `SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.role,
      u.manager_id,
      mgr.name AS manager_name,
      COUNT(*) AS assigned_days,
      SUM(CASE WHEN l.status = 'achieved' THEN 1 ELSE 0 END) AS achieved_days,
      SUM(CASE WHEN l.status = 'missed' THEN 1 ELSE 0 END) AS missed_days,
      AVG(l.completion_percent) AS avg_completion_percent,
      AVG(l.score) AS avg_score,
      SUM(l.target_calls) AS target_calls,
      SUM(l.achieved_calls) AS achieved_calls,
      SUM(l.target_meetings) AS target_meetings,
      SUM(l.achieved_meetings) AS achieved_meetings,
      SUM(l.target_deals) AS target_deals,
      SUM(l.achieved_deals) AS achieved_deals
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     LEFT JOIN users mgr ON mgr.id = u.manager_id AND mgr.tenant_id = u.tenant_id AND mgr.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
     GROUP BY u.id, u.name, u.role, u.manager_id, mgr.name
     ORDER BY avg_score DESC, u.name ASC`,
    [...params, ...us.params]
  );
  const crmByUser = await getAgentCrmRollups(tenantId, actingUser, from, to);
  return rows.map((r) => {
    const assignedDays = Number(r.assigned_days || 0);
    const achievedDays = Number(r.achieved_days || 0);
    const consistency = assignedDays > 0 ? (achievedDays / assignedDays) * 100 : 0;
    const callsToMeeting =
      Number(r.achieved_calls || 0) > 0 ? (Number(r.achieved_meetings || 0) / Number(r.achieved_calls || 0)) * 100 : 0;
    const meetingToDeal =
      Number(r.achieved_meetings || 0) > 0 ? (Number(r.achieved_deals || 0) / Number(r.achieved_meetings || 0)) * 100 : 0;
    const crm = crmByUser.get(Number(r.user_id)) || {};
    return {
      ...r,
      consistency_score: Number(consistency.toFixed(2)),
      calls_to_meeting_conversion: Number(callsToMeeting.toFixed(2)),
      meeting_to_deal_conversion: Number(meetingToDeal.toFixed(2)),
      crm_total_calls: Number(crm.crm_total_calls || 0),
      crm_scheduled_follow_ups: Number(crm.crm_scheduled_follow_ups || 0),
      crm_follow_up_phone: Number(crm.crm_follow_up_phone || 0),
      crm_follow_up_email: Number(crm.crm_follow_up_email || 0),
      crm_follow_up_meeting: Number(crm.crm_follow_up_meeting || 0),
      crm_follow_up_other: Number(crm.crm_follow_up_other || 0),
      crm_calendar_meetings: Number(crm.crm_calendar_meetings || 0),
      crm_opportunities_count: Number(crm.crm_opportunities_count || 0),
      crm_opportunities_amount: Number(Number(crm.crm_opportunities_amount || 0).toFixed(2)),
    };
  });
}

export async function getCalendarData(tenantId, actingUser, { userId, month }) {
  const us = buildUserScope(actingUser);
  const first = `${String(month).slice(0, 7)}-01`;
  const where = ['l.tenant_id = ?', 'l.deleted_at IS NULL', 'l.task_date >= ?', 'l.task_date < DATE_ADD(?, INTERVAL 1 MONTH)'];
  const params = [tenantId, first, first];
  if (userId) {
    where.push('l.user_id = ?');
    params.push(Number(userId));
  }
  const rows = await query(
    `SELECT l.task_date, l.status, COUNT(*) AS logs_count, AVG(l.completion_percent) AS completion_percent
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
     GROUP BY l.task_date, l.status
     ORDER BY l.task_date ASC`,
    [...params, ...us.params]
  );
  return rows;
}

export async function getTrend(tenantId, actingUser, { from, to, groupBy = 'week' } = {}) {
  const us = buildUserScope(actingUser);
  const where = ['l.tenant_id = ?', 'l.deleted_at IS NULL'];
  const params = [tenantId];
  if (from) {
    where.push('l.task_date >= ?');
    params.push(dateOnly(from));
  }
  if (to) {
    where.push('l.task_date <= ?');
    params.push(dateOnly(to));
  }
  const bucket =
    groupBy === 'month'
      ? "DATE_FORMAT(l.task_date, '%Y-%m')"
      : groupBy === 'day'
        ? "DATE_FORMAT(l.task_date, '%Y-%m-%d')"
        : "DATE_FORMAT(DATE_SUB(l.task_date, INTERVAL WEEKDAY(l.task_date) DAY), '%Y-%m-%d')";
  const rows = await query(
    `SELECT ${bucket} AS bucket, AVG(l.completion_percent) AS avg_completion, AVG(l.score) AS avg_score, COUNT(*) AS logs_count
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}${PERF_REPORTS_AGENT_ROLE_SQL}
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [...params, ...us.params]
  );
  return rows;
}

export async function getCoachingInsights(tenantId, actingUser, { from, to } = {}) {
  const cfg = await getScoringConfig(tenantId);
  const rows = await getRolewiseSummary(tenantId, actingUser, { from, to });
  const lowScore = Number(cfg.medium_performance_threshold || 75);
  const maxMissed = Number(cfg.coaching_missed_days_threshold || 3);
  const minConsistency = Number(cfg.coaching_consistency_threshold || 60);
  return rows
    .filter(
      (r) =>
        Number(r.avg_score || 0) < lowScore ||
        Number(r.missed_days || 0) >= maxMissed ||
        Number(r.consistency_score || 0) < minConsistency
    )
    .map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      role: r.role,
      manager_name: r.manager_name || null,
      avg_score: Number(Number(r.avg_score || 0).toFixed(2)),
      consistency_score: Number(r.consistency_score || 0),
      missed_days: Number(r.missed_days || 0),
      recommendation:
        Number(r.missed_days || 0) >= maxMissed
          ? 'Review blockers and create daily follow-up plan'
          : Number(r.consistency_score || 0) < minConsistency
            ? 'Set micro-goals and weekly coaching checkpoints'
            : 'Run conversion coaching for meetings-to-deals',
    }));
}

export async function exportRolewiseCsv(tenantId, actingUser, filters) {
  const rows = await getRolewiseSummary(tenantId, actingUser, filters);
  const header = [
    'User',
    'Role',
    'Manager',
    'Assigned Days',
    'Achieved Days',
    'Missed Days',
    'Avg Completion %',
    'Avg Score',
    'Target Calls',
    'Achieved Calls',
    'Target Meetings',
    'Achieved Meetings',
    'Target Deals',
    'Achieved Deals',
    'CRM Dial Attempts',
    'Follow-ups (total)',
    'Follow-ups · Phone',
    'Follow-ups · Email',
    'Follow-ups · Meeting',
    'Follow-ups · Other',
    'Calendar Meetings',
    'New Opportunities',
    'Opportunity Amount (sum)',
    'Consistency %',
    'Calls->Meetings %',
    'Meetings->Deals %',
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['\uFEFF' + header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.user_name,
        r.role,
        r.manager_name || '',
        r.assigned_days,
        r.achieved_days,
        r.missed_days,
        Number(Number(r.avg_completion_percent || 0).toFixed(2)),
        Number(Number(r.avg_score || 0).toFixed(2)),
        r.target_calls,
        r.achieved_calls,
        r.target_meetings,
        r.achieved_meetings,
        r.target_deals,
        r.achieved_deals,
        r.crm_total_calls,
        r.crm_scheduled_follow_ups,
        r.crm_follow_up_phone,
        r.crm_follow_up_email,
        r.crm_follow_up_meeting,
        r.crm_follow_up_other,
        r.crm_calendar_meetings,
        r.crm_opportunities_count,
        r.crm_opportunities_amount,
        r.consistency_score,
        r.calls_to_meeting_conversion,
        r.meeting_to_deal_conversion,
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

export async function getScoringSettings(tenantId) {
  return getScoringConfig(tenantId);
}

export async function updateScoringSettings(tenantId, actingUser, payload) {
  assertCanManageTasks(actingUser);
  await query(
    `INSERT INTO task_scoring_config (
      tenant_id, calls_weight, meetings_weight, deals_weight, low_performance_threshold, medium_performance_threshold,
      coaching_missed_days_threshold, coaching_consistency_threshold, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      calls_weight = VALUES(calls_weight),
      meetings_weight = VALUES(meetings_weight),
      deals_weight = VALUES(deals_weight),
      low_performance_threshold = VALUES(low_performance_threshold),
      medium_performance_threshold = VALUES(medium_performance_threshold),
      coaching_missed_days_threshold = VALUES(coaching_missed_days_threshold),
      coaching_consistency_threshold = VALUES(coaching_consistency_threshold),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      Math.max(0, n(payload?.calls_weight, 30)),
      Math.max(0, n(payload?.meetings_weight, 30)),
      Math.max(0, n(payload?.deals_weight, 40)),
      Math.max(0, n(payload?.low_performance_threshold, 50)),
      Math.max(0, n(payload?.medium_performance_threshold, 75)),
      Math.max(1, n(payload?.coaching_missed_days_threshold, 3)),
      Math.max(0, n(payload?.coaching_consistency_threshold, 60)),
      actingUser.id,
      actingUser.id,
    ]
  );
  return getScoringConfig(tenantId);
}
