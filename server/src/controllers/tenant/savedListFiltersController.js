import * as savedListFiltersService from '../../services/tenant/savedListFiltersService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const entity_type = req.query.entity_type || req.query.entityType;
    const rows = await savedListFiltersService.listSavedFilters(tenantId, req.user.id, entity_type);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { entity_type, name, filter_json } = req.body || {};
    const row = await savedListFiltersService.createSavedFilter(tenantId, req.user, {
      entity_type,
      name,
      filter_json,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { name, filter_json } = req.body || {};
    const row = await savedListFiltersService.updateSavedFilter(tenantId, req.user, req.params.id, {
      name,
      filter_json,
    });
    if (!row) return res.status(404).json({ error: 'Saved filter not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const ok = await savedListFiltersService.softDeleteSavedFilter(tenantId, req.user, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Saved filter not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
