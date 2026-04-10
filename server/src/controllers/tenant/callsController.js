import * as callsService from '../../services/tenant/callsService.js';
import * as dialerSessionsService from '../../services/tenant/dialerSessionsService.js';

export async function start(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await callsService.startCallForContact(tenantId, req.user, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function startBulk(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await callsService.startCallsBulk(tenantId, req.user, req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { page = '1', limit = '20', contact_id } = req.query;
    const data = await callsService.listCallAttempts(tenantId, req.user, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      contact_id: contact_id ? Number(contact_id) : undefined,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function setDisposition(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { attempt, next_action } = await callsService.setAttemptDisposition(
      tenantId,
      req.user,
      req.params.id,
      req.body || {}
    );
    if (!attempt) return res.status(404).json({ error: 'Call attempt not found' });

    let session = null;
    let dialer = null;
    if (String(next_action || '').toLowerCase() === 'next_number') {
      dialer = await dialerSessionsService.handleNextNumberDisposition(tenantId, req.user, req.params.id);
      session = dialer?.session ?? null;
    }

    res.json({ ok: true, data: attempt, next_action, session, dialer });
  } catch (err) {
    next(err);
  }
}

