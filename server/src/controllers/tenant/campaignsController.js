import * as campaignsService from '../../services/tenant/campaignsService.js';

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const campaign = await campaignsService.getCampaign(tenantId, req.user, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const data = await campaignsService.listCampaigns(tenantId, req.user);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const campaign = await campaignsService.createCampaign(tenantId, req.user, req.body || {});
    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const campaign = await campaignsService.updateCampaign(
      tenantId,
      req.user,
      req.params.id,
      req.body || {}
    );

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const campaign = await campaignsService.softDeleteCampaign(tenantId, req.user, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ data: campaign, message: 'Campaign archived' });
  } catch (err) {
    next(err);
  }
}

export async function open(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { page, limit, search } = req.query;
    const result = await campaignsService.openCampaignForAgent(
      tenantId,
      req.user,
      req.params.id,
      {
        page,
        limit,
        search,
      }
    );

    if (!result) return res.status(404).json({ error: 'Campaign not found or not accessible' });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

