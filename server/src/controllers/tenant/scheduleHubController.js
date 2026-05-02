import * as scheduleHubService from '../../services/tenant/scheduleHubService.js';
import {
  getFollowUpMetrics,
  findFollowUpById,
  createFollowUp,
  updateFollowUp,
  removeFollowUp,
} from '../../services/tenant/scheduledFollowUpsService.js';

function normalizeYmd(v) {
  const t = String(v || '').trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function requireRange(req) {
  const from = normalizeYmd(req.query.from);
  const to = normalizeYmd(req.query.to);
  if (!from || !to) {
    const err = new Error('from and to are required (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  return { from, to };
}

export async function meta(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const members = await scheduleHubService.listTeamMembersInScope(tenantId, actingUser);
    res.json({ data: { teamMembers: members } });
  } catch (err) {
    next(err);
  }
}

export async function summary(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const { from, to } = requireRange(req);
    const assigned_user_id = req.query.assigned_user_id ?? null;
    const rows = await scheduleHubService.getSummaryByPerson(tenantId, actingUser, { from, to, assigned_user_id });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function meetings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const { from, to } = requireRange(req);
    const assigned_user_id = req.query.assigned_user_id ?? null;
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
    const status = req.query.status ?? null;
    const q = req.query.q ?? null;
    const time_flag = req.query.time_flag ?? null;
    const out = await scheduleHubService.listMeetingsPaged(tenantId, actingUser, {
      from,
      to,
      assigned_user_id,
      page,
      limit,
      status,
      q,
      time_flag,
    });
    res.json({
      data: out.rows,
      pagination: { total: out.total, page: out.page, limit: out.limit, totalPages: out.totalPages },
    });
  } catch (err) {
    next(err);
  }
}

export async function listFollowUps(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const { from, to } = requireRange(req);
    const assigned_user_id = req.query.assigned_user_id ?? null;
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
    const status = req.query.status ?? null;
    const q = req.query.q ?? null;
    const time_flag = req.query.time_flag ?? null;
    const follow_up_type = req.query.follow_up_type ?? null;
    const out = await scheduleHubService.listFollowUpsPaged(tenantId, actingUser, {
      from,
      to,
      assigned_user_id,
      page,
      limit,
      status,
      follow_up_type,
      q,
      time_flag,
    });
    res.json({
      data: out.rows,
      pagination: { total: out.total, page: out.page, limit: out.limit, totalPages: out.totalPages },
    });
  } catch (err) {
    next(err);
  }
}

export async function followUpsCalendar(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const { from, to } = requireRange(req);
    const assigned_user_id = req.query.assigned_user_id ?? null;
    const status = req.query.status ?? null;
    const follow_up_type = req.query.follow_up_type ?? null;
    const rows = await scheduleHubService.listFollowUpsInRange(tenantId, actingUser, {
      from,
      to,
      assigned_user_id,
      status,
      follow_up_type,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function followUpsMetrics(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actingUser = req.user;
    const assigned_user_id = req.query.assigned_user_id ?? null;
    const data = await getFollowUpMetrics(tenantId, actingUser, { assigned_user_id });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getFollowUp(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const row = await findFollowUpById(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Follow-up not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function createFollowUpRow(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const row = await createFollowUp(tenantId, req.user, req.body || {});
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function updateFollowUpRow(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const row = await updateFollowUp(tenantId, req.user, req.params.id, req.body || {});
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function deleteFollowUpRow(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    await removeFollowUp(tenantId, req.user, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

