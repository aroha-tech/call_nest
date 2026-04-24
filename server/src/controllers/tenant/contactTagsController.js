import * as contactTagsService from '../../services/tenant/contactTagsService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const includeArchived = String(req.query?.includeArchived || '').trim() === '1';
    const data = await contactTagsService.listContactTags(tenantId, { includeArchived });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await contactTagsService.createContactTag(tenantId, req.user, req.body || {});
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await contactTagsService.updateContactTag(tenantId, req.user, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Tag not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await contactTagsService.softDeleteContactTag(tenantId, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: 'Tag not found' });
    res.json({ data: row, message: 'Tag archived' });
  } catch (err) {
    next(err);
  }
}

export async function removePermanent(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await contactTagsService.hardDeleteArchivedContactTag(tenantId, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: 'Tag not found' });
    res.json({ data: row, message: 'Tag deleted permanently' });
  } catch (err) {
    next(err);
  }
}

export async function unarchive(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const row = await contactTagsService.unarchiveContactTag(tenantId, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: 'Tag not found' });
    res.json({ data: row, message: 'Tag unarchived' });
  } catch (err) {
    next(err);
  }
}
