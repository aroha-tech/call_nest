import * as contactBlacklistService from '../../services/tenant/contactBlacklistService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { search = '', page = '1', limit = '20', block_scope = '' } = req.query || {};
    const data = await contactBlacklistService.listBlacklistEntries(tenantId, req.user, {
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      block_scope,
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
    const data = await contactBlacklistService.createBlacklistEntry(tenantId, req.user, req.body || {});
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function unblock(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Only admin or manager can unblock entries' });
    }
    const ok = await contactBlacklistService.unblockBlacklistEntry(tenantId, req.user, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Blacklist entry not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

