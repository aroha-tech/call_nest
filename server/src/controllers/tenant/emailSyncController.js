import { syncGmailForTenant } from '../../services/email/gmailSyncService.js';

/**
 * POST /sync/gmail — sync recent Gmail inbox messages into email_messages.
 * Minimal v1: best-effort, safe to call manually or via cron.
 */
export async function syncGmail(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.id;
    const result = await syncGmailForTenant(tenantId, userId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
}

