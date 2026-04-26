import * as integrationAuthService from '../public/integrationAuthService.js';
import * as dialerIntegrationCoreService from '../public/dialerIntegrationCoreService.js';

async function getContext(tenantId, user) {
  const app = await integrationAuthService.ensureInternalCrmApp(tenantId, user);
  return {
    tenantId: Number(tenantId),
    appId: Number(app.id),
    providerCode: 'internal_crm',
    source: 'internal_crm_connector',
    user: {
      id: user?.id ?? null,
      tenantId: Number(tenantId),
      role: user?.role || 'admin',
    },
  };
}

export async function upsertContacts(tenantId, user, payload = {}) {
  return dialerIntegrationCoreService.upsertContacts(await getContext(tenantId, user), payload);
}

export async function clickToCall(tenantId, user, payload = {}) {
  return dialerIntegrationCoreService.clickToCall(await getContext(tenantId, user), payload);
}

export async function lifecycle(tenantId, user, payload = {}) {
  return dialerIntegrationCoreService.upsertCallLifecycle(await getContext(tenantId, user), payload);
}

export async function writeActivity(tenantId, user, payload = {}) {
  return dialerIntegrationCoreService.writeActivity(await getContext(tenantId, user), payload);
}
