import * as leadIntegrationsService from '../../services/tenant/leadIntegrationsService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const data = await leadIntegrationsService.listIntegrations(tenantId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const integration = await leadIntegrationsService.getIntegrationById(tenantId, req.params.id);
    if (!integration) return res.status(404).json({ error: 'Integration not found' });

    res.json({ data: integration });
  } catch (err) {
    next(err);
  }
}

export async function upsert(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const payload = req.body || {};
    const integration = await leadIntegrationsService.upsertIntegration(tenantId, req.user, payload);
    res.json({ data: integration });
  } catch (err) {
    next(err);
  }
}

export async function syncNow(req, res, next) {
  try {
    // Framework endpoint (poll/receive) to be implemented per provider.
    res.status(501).json({ error: 'Sync not implemented for provider yet' });
  } catch (err) {
    next(err);
  }
}

