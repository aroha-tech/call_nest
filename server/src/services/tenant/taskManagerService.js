import { query } from '../../config/db.js';
import { createAndDispatchNotification } from './notificationService.js';

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
  const tw = n(cfg.calls_weight) + n(cfg.meetings_weight) + n(cfg.deals_weight);
  const cw = tw > 0 ? n(cfg.calls_weight) / tw : 0.3333;
  const mw = tw > 0 ? n(cfg.meetings_weight) / tw : 0.3333;
  const dw = tw > 0 ? n(cfg.deals_weight) / tw : 0.3333;
  const cr = targets.calls > 0 ? Math.min(1, achieved.calls / targets.calls) : 1;
  const mr = targets.meetings > 0 ? Math.min(1, achieved.meetings / targets.meetings) : 1;
  const dr = targets.deals > 0 ? Math.min(1, achieved.deals / targets.deals) : 1;
  return Number(((cr * cw + mr * mw + dr * dw) * 100).toFixed(2));
}

function completionPercent(targets, achieved) {
  const t = n(targets.calls) + n(targets.meetings) + n(targets.deals);
  const a = n(achieved.calls) + n(achieved.meetings) + n(achieved.deals);
  if (t <= 0) return a > 0 ? 100 : 0;
  return Number(((a / t) * 100).toFixed(2));
}

function logStatus(targets, achieved) {
  const totalTarget = n(targets.calls) + n(targets.meetings) + n(targets.deals);
  const totalAch = n(achieved.calls) + n(achieved.meetings) + n(achieved.deals);
  if (totalTarget === 0) return 'no_task';
  // Missed status is handled by scheduled cron after day close.
  // Runtime recompute should keep untouched/zero-achievement logs as pending.
  if (totalAch <= 0) return 'pending';
  if (totalAch >= totalTarget) return 'achieved';
  return 'in_progress';
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

async function findDailyLogConflicts(tenantId, assignedToUserId, startDate, endDate) {
  const rows = await query(
    `SELECT l.task_date, l.assignment_id, a.title AS assignment_title
     FROM daily_task_logs l
     LEFT JOIN task_assignments a
       ON a.id = l.assignment_id
      AND a.tenant_id = l.tenant_id
      AND a.deleted_at IS NULL
     WHERE l.tenant_id = ?
       AND l.user_id = ?
       AND l.deleted_at IS NULL
       AND l.task_date BETWEEN ? AND ?
     ORDER BY l.task_date ASC
     LIMIT 20`,
    [tenantId, assignedToUserId, startDate, endDate]
  );
  return rows || [];
}

function throwDailyConflictError(conflicts) {
  const days = [...new Set((conflicts || []).map((r) => dateOnly(r.task_date)).filter(Boolean))];
  const sample = days.slice(0, 5).join(', ');
  const more = days.length > 5 ? ` (+${days.length - 5} more)` : '';
  const err = new Error(
    `This agent already has a task assigned on: ${sample}${more}. ` +
      `Only one task per day is allowed. Remove the existing assignment(s) or choose different dates.`
  );
  err.status = 409;
  throw err;
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
    try {
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
    } catch (e) {
      // Race-condition safety: if unique per-day constraint rejects the insert, surface a friendly 409.
      if (String(e?.code || '') === 'ER_DUP_ENTRY') {
        const conflicts = await findDailyLogConflicts(tenantId, assignment.assigned_to_user_id, ymd, ymd);
        throwDailyConflictError(conflicts.length ? conflicts : [{ task_date: ymd }]);
      }
      throw e;
    }
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
  if (!assignee || String(assignee.role || '').toLowerCase() !== 'agent') {
    const err = new Error('Assignment can only be made to agent');
    err.status = 400;
    throw err;
  }
  const actorRole = String(actingUser?.role || '').toLowerCase();
  if (actorRole === 'manager' && Number(assignee.manager_id) !== Number(actingUser.id)) {
    const err = new Error('Managers can only assign tasks to agents on their team');
    err.status = 403;
    throw err;
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

  // Hard rule: only one task per agent per calendar day (regardless of time windows).
  const conflicts = await findDailyLogConflicts(tenantId, assignedTo, startDate, endDate);
  if (conflicts.length) throwDailyConflictError(conflicts);

  await assertNoOverlappingAssignment(tenantId, assignedTo, startDate, endDate, startAt, endAt);
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
  const result = await query(
    `INSERT INTO task_assignments (
      tenant_id, template_id, title, description, assigned_to_user_id, assigned_by_user_id, schedule_type, recurring_pattern,
      start_date, end_date, start_at, end_at, target_calls, target_meetings, target_deals, status, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      template?.id || null,
      title,
      payload?.description ? String(payload.description).trim() : template?.description || null,
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
      Math.max(0, n(payload?.target_calls, template?.target_calls || 0)),
      Math.max(0, n(payload?.target_meetings, template?.target_meetings || 0)),
      Math.max(0, n(payload?.target_deals, template?.target_deals || 0)),
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
    entityType: 'task_assignment',
    entityId: row?.id,
    ctaPath: '/task-manager',
    eventHash: `task:assigned:${tenantId}:${row?.id}`,
  });
  return row;
}

/**
 * Block creating a second active/paused assignment for the same agent when date ranges overlap (inclusive).
 */
async function assertNoOverlappingAssignment(tenantId, assignedToUserId, startDate, endDate, startAt, endAt) {
  const s = mysqlDateTime(startAt) || `${dateOnly(startDate)} 00:00:00`;
  const e = mysqlDateTime(endAt) || `${dateOnly(endDate)} 23:59:59`;
  const overlaps = await query(
    `SELECT id, title, start_date, end_date, start_at, end_at, status
     FROM task_assignments
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND assigned_to_user_id = ?
       AND status IN ('active', 'paused')
       AND COALESCE(start_at, CONCAT(start_date, ' 00:00:00')) <= ?
       AND COALESCE(end_at, CONCAT(end_date, ' 23:59:59')) >= ?`,
    [tenantId, assignedToUserId, e, s]
  );
  if (!overlaps.length) return;
  const parts = overlaps.slice(0, 3).map((r) => {
    const sd = String(r.start_at || r.start_date || '').replace('T', ' ').slice(0, 16);
    const ed = String(r.end_at || r.end_date || '').replace('T', ' ').slice(0, 16);
    return `"${String(r.title || '').trim() || 'Task'}" (${sd} → ${ed})`;
  });
  const more = overlaps.length > 3 ? ` (+${overlaps.length - 3} more)` : '';
  const err = new Error(
    `This agent already has a task overlapping these dates: ${parts.join('; ')}${more}. ` +
      `Delete or change the existing assignment first, or pick dates that do not overlap.`
  );
  err.status = 409;
  throw err;
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
  if (!assignee || String(assignee.role || '').toLowerCase() !== 'agent') {
    const err = new Error('Invalid assignee');
    err.status = 400;
    throw err;
  }
  const actorRole = String(actingUser?.role || '').toLowerCase();
  if (actorRole === 'manager' && Number(assignee.manager_id) !== Number(actingUser.id)) {
    const err = new Error('Managers can only delete tasks for agents on their team');
    err.status = 403;
    throw err;
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

  // Business rule for manual sync:
  // mark previous-day pending logs as missed for the same scoped users.
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
    `SELECT l.id, l.user_id, l.task_date, l.target_calls, l.target_meetings, l.target_deals, l.is_locked
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}`,
    [...params, ...us.params]
  );
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
    const status = logStatus(targets, achieved);
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
  }
  return { updated: logs.length };
}

export async function listDailyLogs(
  tenantId,
  actingUser,
  { from, to, userId, page = 1, limit = 20, sort = 'desc' } = {}
) {
  await backfillDailyLogsInRange(tenantId, actingUser, { from, to, userId });
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
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const offset = (pg - 1) * lim;
  const orderDir = String(sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderSecondary = orderDir === 'ASC' ? 'ASC' : 'DESC';
  const [countRow] = await query(
    `SELECT COUNT(*) AS c
     FROM daily_task_logs l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = l.tenant_id AND u.is_deleted = 0
     WHERE ${where.join(' AND ')} ${us.sql}`,
    [...params, ...us.params]
  );
  const rows = await query(
    `SELECT l.*, u.name AS user_name, u.role AS user_role, a.title AS assignment_title,
            a.start_at AS assignment_start_at, a.end_at AS assignment_end_at
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
    `SELECT h.id, h.note_type, h.note_text, h.created_at, u.name AS author_name
     FROM task_note_history h
     LEFT JOIN users u ON u.id = h.created_by AND u.tenant_id = h.tenant_id
     WHERE h.tenant_id = ? AND h.daily_task_log_id = ? AND h.deleted_at IS NULL
     ORDER BY h.created_at DESC, h.id DESC`,
    [tenantId, id]
  );
  return rows;
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
     WHERE ${where.join(' AND ')} ${us.sql}
     GROUP BY u.id, u.name, u.role
     ORDER BY avg_score DESC, u.name ASC`,
    [...params, ...us.params]
  );
  return rows.map((r) => {
    const assignedDays = Number(r.assigned_days || 0);
    const achievedDays = Number(r.achieved_days || 0);
    const consistency = assignedDays > 0 ? (achievedDays / assignedDays) * 100 : 0;
    const callsToMeeting =
      Number(r.achieved_calls || 0) > 0 ? (Number(r.achieved_meetings || 0) / Number(r.achieved_calls || 0)) * 100 : 0;
    const meetingToDeal =
      Number(r.achieved_meetings || 0) > 0 ? (Number(r.achieved_deals || 0) / Number(r.achieved_meetings || 0)) * 100 : 0;
    return {
      ...r,
      consistency_score: Number(consistency.toFixed(2)),
      calls_to_meeting_conversion: Number(callsToMeeting.toFixed(2)),
      meeting_to_deal_conversion: Number(meetingToDeal.toFixed(2)),
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
     WHERE ${where.join(' AND ')} ${us.sql}
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
     WHERE ${where.join(' AND ')} ${us.sql}
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
