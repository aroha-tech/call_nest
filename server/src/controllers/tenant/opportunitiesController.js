import * as opportunitiesService from '../../services/tenant/opportunitiesService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const contactId = req.query?.contact_id;
    if (!contactId) {
      return res.status(400).json({ error: 'contact_id query parameter is required' });
    }

    const rows = await opportunitiesService.listOpportunitiesForContact(tenantId, req.user, contactId);
    if (rows === null) return res.status(404).json({ error: 'Contact not found' });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await opportunitiesService.createOpportunity(tenantId, req.user, req.body || {});
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await opportunitiesService.updateOpportunity(tenantId, req.user, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Opportunity not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const result = await opportunitiesService.softDeleteOpportunity(tenantId, req.user, req.params.id);
    if (!result) return res.status(404).json({ error: 'Opportunity not found' });
    res.json({ data: result, message: 'Opportunity removed' });
  } catch (err) {
    next(err);
  }
}
