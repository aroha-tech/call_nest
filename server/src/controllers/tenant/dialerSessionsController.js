import * as dialerSessionsService from '../../services/tenant/dialerSessionsService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const {
      page = '1',
      limit = '20',
      q,
      status,
      provider,
      created_after,
      created_before,
    } = req.query;
    const data = await dialerSessionsService.listDialSessions(tenantId, req.user, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      q: q != null && String(q).trim() ? String(q).trim() : undefined,
      status: status !== undefined && status !== null && String(status).trim() !== '' ? status : undefined,
      provider: provider !== undefined && provider !== null && String(provider).trim() !== '' ? provider : undefined,
      created_after:
        created_after === undefined || created_after === null || String(created_after).trim() === ''
          ? undefined
          : String(created_after).trim(),
      created_before:
        created_before === undefined || created_before === null || String(created_before).trim() === ''
          ? undefined
          : String(created_before).trim(),
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

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

export async function patchItem(req, res, nextFn) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.updateSessionItemTargetPhone(
      tenantId,
      req.user,
      req.params.id,
      req.params.itemId,
      req.body || {}
    );
    res.json({ ok: true, data });
  } catch (err) {
    nextFn(err);
  }
}

