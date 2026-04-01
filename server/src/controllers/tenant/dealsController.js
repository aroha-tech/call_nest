import * as dealsService from '../../services/tenant/dealsService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const includeInactive = req.query?.include_inactive === '1' || req.query?.include_inactive === 'true';
    const data = await dealsService.listDeals(tenantId, { includeInactive });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getBoard(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const result = await dealsService.getDealBoard(tenantId, req.user, req.params.id);
    if (!result) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.getDealById(tenantId, req.params.id);
    if (!deal) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.createDeal(tenantId, req.user, req.body || {});
    res.status(201).json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.updateDeal(tenantId, req.user, req.params.id, req.body || {});
    if (!deal) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const result = await dealsService.softDeleteDeal(tenantId, req.user, req.params.id);
    if (!result) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ data: result, message: 'Pipeline deleted' });
  } catch (err) {
    next(err);
  }
}

export async function createStage(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.createStage(tenantId, req.user, req.params.id, req.body || {});
    if (!deal) return res.status(404).json({ error: 'Pipeline not found' });
    res.status(201).json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function updateStage(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.updateStage(
      tenantId,
      req.user,
      req.params.id,
      req.params.stageId,
      req.body || {}
    );
    if (!deal) return res.status(404).json({ error: 'Pipeline or stage not found' });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function reorderStages(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { stage_ids } = req.body || {};
    const deal = await dealsService.reorderStages(tenantId, req.user, req.params.id, stage_ids);
    if (!deal) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
}

export async function removeStage(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const deal = await dealsService.softDeleteStage(tenantId, req.user, req.params.id, req.params.stageId);
    if (!deal) return res.status(404).json({ error: 'Pipeline or stage not found' });
    res.json({ data: deal, message: 'Stage removed' });
  } catch (err) {
    next(err);
  }
}
