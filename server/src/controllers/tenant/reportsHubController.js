import * as reportsHubService from '../../services/tenant/reportsHubService.js';

function getTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return tenantId;
}

export async function context(req, res, next) {
  try {
    const data = await reportsHubService.getReportsContext(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function kpiSummary(req, res, next) {
  try {
    const data = await reportsHubService.getKpiSummary(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function teamsRollup(req, res, next) {
  try {
    const data = await reportsHubService.getTeamsRollup(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function leaderboard(req, res, next) {
  try {
    const data = await reportsHubService.getLeaderboard(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function xInsights(req, res, next) {
  try {
    const data = await reportsHubService.getXInsightsBundle(getTenantId(req), req.user, req.query || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
