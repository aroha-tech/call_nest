import * as settingsService from '../../services/tenant/meetingDefaultEmailSettingsService.js';

function canManageOtherUsersMeetingEmail(req) {
  if (req.user?.isPlatformAdmin) return true;
  const p = req.user?.permissions || [];
  return p.includes('meetings.manage') || p.includes('settings.manage');
}

function resolveTargetUserId(req, bodyOrQuery) {
  const raw = bodyOrQuery?.for_user_id ?? req.query?.for_user_id;
  const self = Number(req.user?.id || 0) || null;
  if (raw == null || raw === '') return self;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return self;
  return n;
}

export async function getMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actorId = req.user?.id;
    if (!tenantId || !actorId) return res.status(400).json({ error: 'Tenant/user context required' });
    const targetUserId = resolveTargetUserId(req, req.query);
    if (targetUserId !== Number(actorId) && !canManageOtherUsersMeetingEmail(req)) {
      return res.status(403).json({ error: 'Permission denied for this user’s settings' });
    }
    const data = await settingsService.getOrCreateForUser(tenantId, targetUserId);
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
}

export async function updateMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const actorId = req.user?.id;
    if (!tenantId || !actorId) return res.status(400).json({ error: 'Tenant/user context required' });
    const body = { ...(req.body || {}) };
    const targetUserId = resolveTargetUserId(req, body);
    delete body.for_user_id;
    if (targetUserId !== Number(actorId) && !canManageOtherUsersMeetingEmail(req)) {
      return res.status(403).json({ error: 'Permission denied for this user’s settings' });
    }
    const data = await settingsService.updateForUser(tenantId, targetUserId, actorId ?? null, body);
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
    const { type, to_email, email_account_id } = req.body || {};
    const data = await settingsService.sendTestEmailForUser(tenantId, userId, type, to_email, email_account_id);
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
}
