import * as tenantDialerWorkspaceConfigService from '../../services/tenant/tenantDialerWorkspaceConfigService.js';

export async function get(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const data = await tenantDialerWorkspaceConfigService.getMergedForTenant(tenantId);
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export async function put(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const data = await tenantDialerWorkspaceConfigService.updateForTenant(
      tenantId,
      req.user?.id ?? null,
      req.body || {}
    );
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
