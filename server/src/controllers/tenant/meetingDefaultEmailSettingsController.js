import * as settingsService from '../../services/tenant/meetingDefaultEmailSettingsService.js';

export async function getMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant/user context required' });
    const data = await settingsService.getOrCreateForUser(tenantId, userId);
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
}

export async function updateMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant/user context required' });
    const data = await settingsService.updateForUser(tenantId, userId, req.user?.id ?? null, req.body || {});
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
}

export async function sendTestEmail(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant/user context required' });
    const { type, to_email } = req.body || {};
    const data = await settingsService.sendTestEmailForUser(tenantId, userId, type, to_email);
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
}
