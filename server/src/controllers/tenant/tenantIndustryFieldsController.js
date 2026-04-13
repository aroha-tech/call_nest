import * as tenantIndustryFieldsService from '../../services/tenant/tenantIndustryFieldsService.js';

export async function getDefinitions(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const definitions = await tenantIndustryFieldsService.getEffectiveFieldDefinitions(tenantId);
    res.json({ data: definitions });
  } catch (err) {
    next(err);
  }
}

export async function getOptionalSettings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const result = await tenantIndustryFieldsService.getOptionalFieldsWithSettings(tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function putOptionalSettings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { enabled_field_ids } = req.body || {};
    const result = await tenantIndustryFieldsService.updateOptionalFieldSettings(
      tenantId,
      Array.isArray(enabled_field_ids) ? enabled_field_ids : []
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
