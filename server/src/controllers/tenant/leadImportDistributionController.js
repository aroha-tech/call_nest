import * as leadImportDistributionService from '../../services/tenant/leadImportDistributionService.js';

export async function get(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await leadImportDistributionService.getLeadImportDistributionForApi(tenantId, req.user);
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

export async function put(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await leadImportDistributionService.updateLeadImportDistributionForApi(
      tenantId,
      req.user,
      req.body ?? {}
    );
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}
