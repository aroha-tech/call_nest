import * as tenantCompanyService from '../../services/tenant/tenantCompanyService.js';

export async function get(req, res, next) {
  try {
    const data = await tenantCompanyService.getDetailsForTenant(req.tenant.id);
    if (!data) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updated = await tenantCompanyService.updateForTenant(req.tenant.id, req.body ?? {});
    if (!updated) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    return res.json({ data: { tenant: updated } });
  } catch (err) {
    return next(err);
  }
}
