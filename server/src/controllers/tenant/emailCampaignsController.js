import * as emailCampaignService from '../../services/tenant/emailCampaignService.js';

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const result = await emailCampaignService.listCampaigns(tenantId, req.query || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const campaign = await emailCampaignService.getCampaignById(tenantId, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

export async function listRecipients(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const campaign = await emailCampaignService.getCampaignById(tenantId, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const result = await emailCampaignService.listCampaignRecipients(
      tenantId,
      req.params.id,
      req.query || {}
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const campaign = await emailCampaignService.createCampaign(tenantId, req.user.id, req.body || {});
    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

export async function queue(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const result = await emailCampaignService.queueCampaign(tenantId, req.params.id, req.user.id);
    res.status(202).json({ data: result, message: 'Campaign queued' });
  } catch (err) {
    next(err);
  }
}
