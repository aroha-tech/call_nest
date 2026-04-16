import * as dialerSessionsService from '../../services/tenant/dialerSessionsService.js';

function pickMergedBodyQuery(req, key) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const q = req.query || {};
  if (b[key] !== undefined && b[key] !== null && b[key] !== '') return b[key];
  if (q[key] !== undefined && q[key] !== null && q[key] !== '') return q[key];
  return undefined;
}

/** Shared list/export/ids filters (query string values; optional body merge for export). */
function dialSessionsFiltersFromReq(req, { mergeBody = false } = {}) {
  const t = (k) => {
    const v = mergeBody ? pickMergedBodyQuery(req, k) : req.query?.[k];
    return v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim();
  };

  return {
    q: t('q'),
    status: t('status'),
    provider: t('provider'),
    created_after: t('created_after'),
    created_before: t('created_before'),
    column_filters: t('column_filters'),
    created_by_user_id: t('created_by_user_id'),
    script_q: t('script_q'),
    items_min: t('items_min'),
    items_max: t('items_max'),
    called_min: t('called_min'),
    called_max: t('called_max'),
    connected_min: t('connected_min'),
    connected_max: t('connected_max'),
    failed_min: t('failed_min'),
    failed_max: t('failed_max'),
    queued_min: t('queued_min'),
    queued_max: t('queued_max'),
    duration_min: t('duration_min'),
    duration_max: t('duration_max'),
  };
}

export async function listIds(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await dialerSessionsService.listDialSessionIds(tenantId, req.user, dialSessionsFiltersFromReq(req));
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/** POST body: export_scope, columns, selected_ids; filters on query (same as GET /) or merged from body. */
export async function exportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const filter = dialSessionsFiltersFromReq(req, { mergeBody: true });

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

    const csv = await dialerSessionsService.exportDialSessionsCsv(tenantId, req.user, {
      ...filter,
      export_scope,
      selected_ids,
      columns,
    });

    const filename = `dial_sessions_export_${new Date().toISOString().slice(0, 10)}.csv`;
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
    const { page = '1', limit = '20', sort_by, sort_dir } = req.query;
    const data = await dialerSessionsService.listDialSessions(tenantId, req.user, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      ...dialSessionsFiltersFromReq(req),
      sort_by: sort_by ? String(sort_by).trim() : undefined,
      sort_dir: sort_dir ? String(sort_dir).trim() : undefined,
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

