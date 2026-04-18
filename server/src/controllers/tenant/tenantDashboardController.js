import * as tenantDashboardService from '../../services/tenant/tenantDashboardService.js';
import { listTenantActivityFeedPaginated } from '../../services/tenant/tenantActivityLogService.js';
import { parseInclusiveDateRange } from '../../utils/dateRangeQuery.js';

export async function getDashboard(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const hasFrom = req.query.from != null && String(req.query.from).trim() !== '';
    const hasTo = req.query.to != null && String(req.query.to).trim() !== '';
    if (hasFrom !== hasTo) {
      return res.status(400).json({ error: 'Provide both from and to as YYYY-MM-DD, or omit both for all-time totals' });
    }
    const range = hasFrom ? parseInclusiveDateRange(req.query.from, req.query.to) : null;
    if (hasFrom && !range) {
      return res.status(400).json({ error: 'Invalid date range: from and to must be YYYY-MM-DD with from <= to' });
    }
    const data = await tenantDashboardService.getDashboardData(tenantId, req.user, range);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** Paginated workspace activity log (role-scoped the same way as the dashboard strip). */
export async function getActivityFeed(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 20));
    const search = req.query.q != null ? String(req.query.q) : req.query.search != null ? String(req.query.search) : '';
    const tab = req.query.tab != null ? String(req.query.tab) : 'all';
    const result = await listTenantActivityFeedPaginated(tenantId, req.user, { page, limit, search, tab });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
