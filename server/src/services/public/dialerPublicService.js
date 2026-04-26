import * as dialerIntegrationCoreService from './dialerIntegrationCoreService.js';

export async function upsertContactsFromCrm(app, payload = {}) {
  return dialerIntegrationCoreService.upsertContacts(
    {
      tenantId: Number(app.tenant_id),
      appId: Number(app.id),
      providerCode: app.provider_code || 'custom',
      source: 'crm_public_api',
      user: { id: null, tenantId: Number(app.tenant_id), role: 'admin' },
    },
    payload
  );
}

export async function clickToCall(app, payload = {}) {
  return dialerIntegrationCoreService.clickToCall(
    {
      tenantId: Number(app.tenant_id),
      appId: Number(app.id),
      providerCode: app.provider_code || 'custom',
      source: 'crm_public_api',
      user: { id: null, tenantId: Number(app.tenant_id), role: 'admin' },
    },
    {
      ...payload,
      webhook_secret: app.webhook_secret || null,
    }
  );
}

export async function upsertCallLifecycle(app, payload = {}) {
  return dialerIntegrationCoreService.upsertCallLifecycle(
    {
      tenantId: Number(app.tenant_id),
      appId: Number(app.id),
      providerCode: app.provider_code || 'custom',
      source: 'crm_public_api',
      user: { id: null, tenantId: Number(app.tenant_id), role: 'admin' },
    },
    payload
  );
}

export async function writeActivity(app, payload = {}) {
  return dialerIntegrationCoreService.writeActivity(
    {
      tenantId: Number(app.tenant_id),
      appId: Number(app.id),
      providerCode: app.provider_code || 'custom',
      source: 'crm_public_api',
      user: { id: null, tenantId: Number(app.tenant_id), role: 'admin' },
    },
    payload
  );
}
