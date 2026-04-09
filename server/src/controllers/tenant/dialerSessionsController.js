import * as dialerSessionsService from '../../services/tenant/dialerSessionsService.js';

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.createSession(tenantId, req.user, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.getSession(tenantId, req.user, req.params.id);
    if (!data) return res.status(404).json({ error: 'Session not found' });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function next(req, res, nextFn) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.callNextInSession(tenantId, req.user, req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    nextFn(err);
  }
}

export async function pause(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.pauseSession(tenantId, req.user, req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resume(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.resumeSession(tenantId, req.user, req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.cancelSession(tenantId, req.user, req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

