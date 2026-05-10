import * as tenantDialerPhoneNumbersService from '../../services/tenant/tenantDialerPhoneNumbersService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const rows = await tenantDialerPhoneNumbersService.listForTenant(tenantId);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const row = await tenantDialerPhoneNumbersService.updateRowForTenant(
      tenantId,
      req.user?.id ?? null,
      req.params.id,
      req.body || {}
    );
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}
