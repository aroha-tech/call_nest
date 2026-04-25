import * as taskManagerService from '../../services/tenant/taskManagerService.js';

function getTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return tenantId;
}

export async function listTemplates(req, res, next) {
  try {
    const data = await taskManagerService.listTemplates(getTenantId(req), {
      includeInactive: String(req.query.include_inactive || '').toLowerCase() === 'true',
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const data = await taskManagerService.createTemplate(getTenantId(req), req.user, req.body || {});
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createAssignment(req, res, next) {
  try {
    const data = await taskManagerService.createAssignment(getTenantId(req), req.user, req.body || {});
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function deleteAssignment(req, res, next) {
  try {
    const data = await taskManagerService.deleteAssignment(getTenantId(req), req.user, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listAssignments(req, res, next) {
  try {
    const data = await taskManagerService.listAssignments(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listDailyLogs(req, res, next) {
  try {
    const result = await taskManagerService.listDailyLogs(getTenantId(req), req.user, req.query || {});
    res.json({
      data: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function recomputeLogs(req, res, next) {
  try {
    const merged = { ...(req.query || {}), ...(req.body || {}) };
    const filters = req.params?.id ? { ...merged, logId: req.params.id } : merged;
    const data = await taskManagerService.recomputeLogs(getTenantId(req), req.user, filters || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateAgentNote(req, res, next) {
  try {
    const data = await taskManagerService.updateLogNote(getTenantId(req), req.user, req.params.id, 'agent', req.body?.note);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateManagerNote(req, res, next) {
  try {
    const data = await taskManagerService.updateLogNote(getTenantId(req), req.user, req.params.id, 'manager', req.body?.note);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listNoteHistory(req, res, next) {
  try {
    const data = await taskManagerService.listNoteHistory(getTenantId(req), req.user, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function addAssignmentComment(req, res, next) {
  try {
    const data = await taskManagerService.addAssignmentComment(
      getTenantId(req),
      req.user,
      req.params.id,
      req.body?.comment
    );
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listAssignmentComments(req, res, next) {
  try {
    const data = await taskManagerService.listAssignmentComments(getTenantId(req), req.user, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function rolewiseSummary(req, res, next) {
  try {
    const data = await taskManagerService.getRolewiseSummary(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function calendar(req, res, next) {
  try {
    const data = await taskManagerService.getCalendarData(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function trend(req, res, next) {
  try {
    const data = await taskManagerService.getTrend(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function coachingInsights(req, res, next) {
  try {
    const data = await taskManagerService.getCoachingInsights(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exportSummaryCsv(req, res, next) {
  try {
    const csv = await taskManagerService.exportRolewiseCsv(getTenantId(req), req.user, req.query || {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="performance-report.csv"');
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

export async function getScoring(req, res, next) {
  try {
    const data = await taskManagerService.getScoringSettings(getTenantId(req));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateScoring(req, res, next) {
  try {
    const data = await taskManagerService.updateScoringSettings(getTenantId(req), req.user, req.body || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
