import * as leadIntegrationsService from '../services/tenant/leadIntegrationsService.js';
import * as contactsService from '../services/tenant/contactsService.js';

function pickLeadsArray(body) {
  if (Array.isArray(body?.leads)) return body.leads;
  if (Array.isArray(body?.data?.leads)) return body.data.leads;
  if (Array.isArray(body?.records)) return body.records;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

function normalizeProviderCode(providerCode) {
  return String(providerCode || '').trim().toLowerCase();
}

export async function receive(req, res, next) {
  try {
    const providerCode = normalizeProviderCode(req.params.provider);
    const integrationId = req.params.integrationId;

    const integration = await leadIntegrationsService.resolveIntegrationForWebhook(integrationId, providerCode);

    // Optional shared-secret verification. If webhook_secret is configured, require header match.
    // Providers can be adjusted later to use HMAC signatures.
    if (integration.webhook_secret) {
      const headerSecret = req.headers['x-webhook-secret'] || req.headers['x-webhook-token'] || req.headers['x-webhook-signature'];
      if (!headerSecret || String(headerSecret) !== String(integration.webhook_secret)) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const ownerUserId = integration.default_owner_user_id;
    if (!ownerUserId) {
      return res.status(400).json({ error: 'Integration default_owner_user_id is not set' });
    }

    const ownerUser = await leadIntegrationsService.getOwnerUser(integration.tenant_id, ownerUserId);
    if (!ownerUser) {
      return res.status(400).json({ error: 'Integration owner user not found' });
    }

    const leads = pickLeadsArray(req.body);
    if (leads.length === 0) {
      return res.json({ ok: true, processed: 0, created: 0, updated: 0, failed: 0 });
    }

    const integrationUser = {
      id: ownerUser.id,
      tenantId: ownerUser.tenant_id,
      role: ownerUser.role,
    };

    const result = await contactsService.upsertLeadsFromIntegration(integration.tenant_id, integrationUser, {
      leads,
      defaultCountryCode: integration.default_country_code || '+91',
      integrationCreatedSource: 'integration',
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

