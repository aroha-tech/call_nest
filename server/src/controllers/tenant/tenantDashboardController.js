import * as tenantDashboardService from '../../services/tenant/tenantDashboardService.js';

export async function getDashboard(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const data = await tenantDashboardService.getDashboardData(tenantId, req.user);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
