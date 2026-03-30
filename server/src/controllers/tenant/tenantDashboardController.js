import * as tenantDashboardService from '../../services/tenant/tenantDashboardService.js';
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
