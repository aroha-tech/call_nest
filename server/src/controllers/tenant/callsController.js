import * as callsService from '../../services/tenant/callsService.js';
import * as dialerSessionsService from '../../services/tenant/dialerSessionsService.js';

function pickMergedBodyQuery(req, key) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const q = req.query || {};
  if (b[key] !== undefined && b[key] !== null && b[key] !== '') return b[key];
  if (q[key] !== undefined && q[key] !== null && q[key] !== '') return q[key];
  return undefined;
}

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

/** POST body: export_scope, columns, selected_ids; filters on query (same as GET /) or merged from body. */
export async function exportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const q = pickMergedBodyQuery(req, 'q');
    const contact_id = pickMergedBodyQuery(req, 'contact_id');
    const disposition_id = pickMergedBodyQuery(req, 'disposition_id');
    const agent_user_id = pickMergedBodyQuery(req, 'agent_user_id');
    const direction = pickMergedBodyQuery(req, 'direction');
    const status = pickMergedBodyQuery(req, 'status');
    const is_connected = pickMergedBodyQuery(req, 'is_connected');
    const started_after = pickMergedBodyQuery(req, 'started_after');
    const started_before = pickMergedBodyQuery(req, 'started_before');
    const today_only = pickMergedBodyQuery(req, 'today_only');
    const meaningful_only = pickMergedBodyQuery(req, 'meaningful_only');
    const column_filters = pickMergedBodyQuery(req, 'column_filters');

    const meaningfulOnly =
      meaningful_only === undefined || meaningful_only === null || String(meaningful_only).trim() === ''
        ? true
        : meaningful_only === '1' || String(meaningful_only || '').toLowerCase() === 'true';
    const todayOnly = today_only === '1' || String(today_only || '').toLowerCase() === 'true';
    const isConnected =
      is_connected === undefined || is_connected === null || String(is_connected).trim() === ''
        ? undefined
        : String(is_connected).trim();

    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const export_scope_raw = String(b.export_scope ?? b.exportScope ?? 'filtered').toLowerCase();
    const export_scope = export_scope_raw === 'selected' ? 'selected' : 'filtered';

    let selected_ids = [];
    const sd = b.selected_ids ?? b.selectedIds;
    if (Array.isArray(sd)) {
      selected_ids = sd;
    } else if (typeof sd === 'string' && sd.trim()) {
      try {
        const parsed = JSON.parse(sd);
        if (Array.isArray(parsed)) selected_ids = parsed;
      } catch {
        /* ignore */
      }
    }

    let columns = [];
    const cols = b.columns ?? b.column_keys;
    if (Array.isArray(cols) && cols.length > 0) {
      columns = cols;
    } else if (typeof cols === 'string' && cols.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(cols);
        if (Array.isArray(parsed) && parsed.length > 0) columns = parsed;
      } catch {
        /* ignore */
      }
    }

    const csv = await callsService.exportCallAttemptsCsv(tenantId, req.user, {
      q: q != null && String(q).trim() ? String(q).trim() : undefined,
      contact_id: contact_id ? Number(contact_id) : undefined,
      disposition_id: disposition_id !== undefined && disposition_id !== null && disposition_id !== '' ? disposition_id : undefined,
      agent_user_id: agent_user_id !== undefined && agent_user_id !== null && agent_user_id !== '' ? agent_user_id : undefined,
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
      column_filters: column_filters != null && String(column_filters).trim() !== '' ? column_filters : undefined,
      export_scope,
      selected_ids,
      columns,
    });

    const filename = `call_history_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
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
      column_filters,
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
      column_filters: column_filters != null && String(column_filters).trim() !== '' ? column_filters : undefined,
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
      column_filters,
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
      column_filters: column_filters != null && String(column_filters).trim() !== '' ? column_filters : undefined,
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
      column_filters,
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
      column_filters: column_filters != null && String(column_filters).trim() !== '' ? column_filters : undefined,
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

