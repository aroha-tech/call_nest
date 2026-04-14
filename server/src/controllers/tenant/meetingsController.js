import * as meetingsService from '../../services/tenant/meetingsService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const pageRaw = req.query.page;
    const pageNum = pageRaw != null && pageRaw !== '' ? parseInt(String(pageRaw), 10) : NaN;
    if (Number.isFinite(pageNum) && pageNum >= 1) {
      const limitRaw = req.query.limit;
      const limit = limitRaw != null && limitRaw !== '' ? parseInt(String(limitRaw), 10) : 20;
      const search = req.query.search != null ? String(req.query.search).trim() : '';
      const { email_account_id } = req.query;
      const result = await meetingsService.listPaged(tenantId, {
        email_account_id: email_account_id ?? null,
        search: search || null,
        page: pageNum,
        limit: Number.isFinite(limit) ? limit : 20,
      });
      return res.json({
        data: result.rows,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    }
    const { from, to, email_account_id } = req.query;
    const data = await meetingsService.listInRange(tenantId, {
      from: from ?? null,
      to: to ?? null,
      email_account_id: email_account_id ?? null,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function metrics(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { email_account_id } = req.query;
    const data = await meetingsService.getMetrics(tenantId, {
      email_account_id: email_account_id ?? null,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const row = await meetingsService.findById(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const row = await meetingsService.create(tenantId, req.user?.id, req.body || {});
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const row = await meetingsService.update(tenantId, req.user?.id, req.params.id, req.body || {});
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    await meetingsService.remove(tenantId, req.user?.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
