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
    const {
      page = '1',
      limit = '20',
      q,
      contact_id,
      disposition_id,
      agent_user_id,
      direction,
      status,
      is_connected,
      started_after,
      started_before,
      today_only,
      meaningful_only,
      sort_by,
      sort_dir,
    } = req.query;
    const meaningfulOnly =
      meaningful_only === '1' || String(meaningful_only || '').toLowerCase() === 'true';
    const todayOnly = today_only === '1' || String(today_only || '').toLowerCase() === 'true';
    const isConnected =
      is_connected === undefined || is_connected === null || String(is_connected).trim() === ''
        ? undefined
        : String(is_connected).trim();
    const data = await callsService.listCallAttempts(tenantId, req.user, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      q: q != null && String(q).trim() ? String(q).trim() : undefined,
      contact_id: contact_id ? Number(contact_id) : undefined,
      disposition_id: disposition_id !== undefined && disposition_id !== '' ? disposition_id : undefined,
      agent_user_id: agent_user_id !== undefined && agent_user_id !== '' ? agent_user_id : undefined,
      direction: direction ? String(direction).trim() : undefined,
      status: status ? String(status).trim() : undefined,
      is_connected: isConnected,
      started_after:
        started_after === undefined || started_after === null || String(started_after).trim() === ''
          ? undefined
          : String(started_after).trim(),
      started_before:
        started_before === undefined || started_before === null || String(started_before).trim() === ''
          ? undefined
          : String(started_before).trim(),
      today_only: todayOnly,
      meaningful_only: meaningfulOnly,
      sort_by: sort_by ? String(sort_by).trim() : undefined,
      sort_dir: sort_dir ? String(sort_dir).trim() : undefined,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listIds(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const {
      q,
      contact_id,
      disposition_id,
      agent_user_id,
      direction,
      status,
      is_connected,
      started_after,
      started_before,
      today_only,
      meaningful_only,
    } = req.query;
    const meaningfulOnly =
      meaningful_only === '1' || String(meaningful_only || '').toLowerCase() === 'true';
    const todayOnly = today_only === '1' || String(today_only || '').toLowerCase() === 'true';
    const isConnected =
      is_connected === undefined || is_connected === null || String(is_connected).trim() === ''
        ? undefined
        : String(is_connected).trim();

    const data = await callsService.listCallAttemptIds(tenantId, req.user, {
      q: q != null && String(q).trim() ? String(q).trim() : undefined,
      contact_id: contact_id ? Number(contact_id) : undefined,
      disposition_id: disposition_id !== undefined && disposition_id !== '' ? disposition_id : undefined,
      agent_user_id: agent_user_id !== undefined && agent_user_id !== '' ? agent_user_id : undefined,
      direction: direction ? String(direction).trim() : undefined,
      status: status ? String(status).trim() : undefined,
      is_connected: isConnected,
      started_after:
        started_after === undefined || started_after === null || String(started_after).trim() === ''
          ? undefined
          : String(started_after).trim(),
      started_before:
        started_before === undefined || started_before === null || String(started_before).trim() === ''
          ? undefined
          : String(started_before).trim(),
      today_only: todayOnly,
      meaningful_only: meaningfulOnly,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function metrics(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const {
      q,
      contact_id,
      disposition_id,
      agent_user_id,
      direction,
      status,
      is_connected,
      started_after,
      started_before,
      today_only,
      meaningful_only,
    } = req.query;
    const meaningfulOnly =
      meaningful_only === '1' || String(meaningful_only || '').toLowerCase() === 'true';
    const todayOnly = today_only === '1' || String(today_only || '').toLowerCase() === 'true';
    const isConnected =
      is_connected === undefined || is_connected === null || String(is_connected).trim() === ''
        ? undefined
        : String(is_connected).trim();
    const data = await callsService.getCallAttemptMetrics(tenantId, req.user, {
      q: q != null && String(q).trim() ? String(q).trim() : undefined,
      contact_id: contact_id ? Number(contact_id) : undefined,
      disposition_id: disposition_id !== undefined && disposition_id !== '' ? disposition_id : undefined,
      agent_user_id: agent_user_id !== undefined && agent_user_id !== '' ? agent_user_id : undefined,
      direction: direction ? String(direction).trim() : undefined,
      status: status ? String(status).trim() : undefined,
      is_connected: isConnected,
      started_after:
        started_after === undefined || started_after === null || String(started_after).trim() === ''
          ? undefined
          : String(started_after).trim(),
      started_before:
        started_before === undefined || started_before === null || String(started_before).trim() === ''
          ? undefined
          : String(started_before).trim(),
      today_only: todayOnly,
      meaningful_only: meaningfulOnly,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchNotes(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { notes } = req.body || {};
    const row = await callsService.updateAttemptNotesOnly(tenantId, req.user, req.params.id, {
      notes: notes === undefined ? null : notes,
    });
    res.json({ ok: true, data: row });
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

