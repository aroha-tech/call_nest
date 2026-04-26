import * as dialerPublicService from '../../services/public/dialerPublicService.js';
import * as eventOutboxService from '../../services/public/eventOutboxService.js';
import * as zohoAdapterService from '../../services/public/providers/zohoAdapterService.js';

export async function upsertContacts(req, res, next) {
  try {
    const data = await dialerPublicService.upsertContactsFromCrm(req.publicIntegrationApp, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function clickToCall(req, res, next) {
  try {
    const data = await dialerPublicService.clickToCall(req.publicIntegrationApp, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function lifecycle(req, res, next) {
  try {
    const data = await dialerPublicService.upsertCallLifecycle(req.publicIntegrationApp, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function writeActivity(req, res, next) {
  try {
    const data = await dialerPublicService.writeActivity(req.publicIntegrationApp, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function processOutbox(req, res, next) {
  try {
    const tenantId = Number(req.publicIntegrationApp.tenant_id);
    const data = await eventOutboxService.processOutboxBatch({ tenantId, limit: req.body?.limit || 25 });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listDeliveries(req, res, next) {
  try {
    const appId = Number(req.publicIntegrationApp.id);
    const tenantId = Number(req.publicIntegrationApp.tenant_id);
    const data = await eventOutboxService.listDeliveryLogs(tenantId, appId, { limit: req.query?.limit || 50 });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function replayDelivery(req, res, next) {
  try {
    const appId = Number(req.publicIntegrationApp.id);
    const tenantId = Number(req.publicIntegrationApp.tenant_id);
    await eventOutboxService.replayOutboxEvent(tenantId, appId, req.params.outboxId, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function zohoSync(req, res, next) {
  try {
    const data = await zohoAdapterService.syncZohoContacts(req.publicIntegrationApp, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function zohoClickToCall(req, res, next) {
  try {
    const data = await zohoAdapterService.zohoClickToCall(req.publicIntegrationApp, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function zohoWriteback(req, res, next) {
  try {
    const data = await zohoAdapterService.zohoWriteback(req.publicIntegrationApp, req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
