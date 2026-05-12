import * as userTemplates from '../../services/tenant/meetingUserAttendeeEmailTemplatesService.js';
import * as meetingEmailTemplatesService from '../../services/tenant/meetingEmailTemplatesService.js';
import * as meetingEmailContentResolve from '../../services/tenant/meetingEmailContentResolve.js';
import { sendMeetingAttendeeEmailWithTemplate } from '../../services/tenant/meetingNotifyService.js';
import { query } from '../../config/db.js';

function canManageOtherUsersMeetingEmail(req) {
  if (req.user?.isPlatformAdmin) return true;
  const p = req.user?.permissions || [];
  return p.includes('meetings.manage') || p.includes('settings.manage');
}

export async function listMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant/user context required' });
    const data = await userTemplates.listForUser(tenantId, userId);
    return res.json({ data, placeholder_help: meetingEmailTemplatesService.MEETING_TEMPLATE_PLACEHOLDERS });
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
    const rawTarget = body.for_user_id;
    delete body.for_user_id;
    const { templates } = body;
    let targetUserId = Number(actorId);
    if (rawTarget != null && rawTarget !== '') {
      const n = Number(rawTarget);
      if (Number.isFinite(n) && n > 0) targetUserId = n;
    }
    if (targetUserId !== Number(actorId) && !canManageOtherUsersMeetingEmail(req)) {
      return res.status(403).json({ error: 'Permission denied for this user’s templates' });
    }
    const data = await userTemplates.updateBatchForUser(tenantId, targetUserId, actorId ?? null, templates);
    return res.json({ data, placeholder_help: meetingEmailTemplatesService.MEETING_TEMPLATE_PLACEHOLDERS });
  } catch (e) {
    return next(e);
  }
}

export async function previewMine(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant/user context required' });
    const { template_kind, meeting, template_override, include_meeting_details } = req.body || {};
    if (!['created', 'updated', 'cancelled'].includes(template_kind)) {
      return res.status(400).json({ error: 'Invalid or missing template_kind' });
    }
    // For preview: prefer override, else use user's stored template
    const rows = await userTemplates.listForUser(tenantId, userId);
    const stored = rows.find((r) => r.template_kind === template_kind) || null;
    const override = template_override || (stored ? { subject: stored.subject, body_html: stored.body_html, body_text: stored.body_text } : null);
    const data = await meetingEmailContentResolve.resolveMeetingEmailContent(
      tenantId,
      userId,
      template_kind,
      meeting || {},
      override,
      { include_meeting_details: Boolean(include_meeting_details) }
    );
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
    const { template_kind, to_email, email_account_id } = req.body || {};
    const kind = String(template_kind || '').trim();
    if (!['created', 'updated', 'cancelled'].includes(kind)) {
      return res.status(400).json({ error: 'Invalid template_kind' });
    }
    const to = String(to_email || '').trim();
    if (!to) return res.status(400).json({ error: 'to_email is required' });

    const tid = Number(tenantId);
    const preferred =
      email_account_id != null && email_account_id !== ''
        ? Number(email_account_id)
        : NaN;
    let account = null;
    if (Number.isFinite(preferred) && preferred > 0) {
      const [row] = await query(
        `SELECT id, email_address, COALESCE(account_name, email_address) AS account_label
         FROM email_accounts
         WHERE tenant_id = ? AND id = ? AND is_deleted = 0 AND (status = 'active' OR status IS NULL)
         LIMIT 1`,
        [tid, preferred]
      );
      account = row || null;
    }
    if (!account?.id) {
      const [row] = await query(
        `SELECT id, email_address, COALESCE(account_name, email_address) AS account_label
         FROM email_accounts
         WHERE tenant_id = ? AND is_deleted = 0 AND (status = 'active' OR status IS NULL)
         ORDER BY id ASC
         LIMIT 1`,
        [tid]
      );
      account = row || null;
    }
    if (!account?.id) return res.status(400).json({ error: 'No active email account found' });

    const meeting = {
      tenant_id: tenantId,
      id: 0,
      email_account_id: Number(account.id),
      account_email: account.email_address,
      account_label: account.account_label,
      title: 'SEO Proposal Discussion',
      description: 'Sample test meeting for template verification.',
      location: 'Google Meet',
      attendee_email: to,
      start_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
      end_at: new Date(Date.now() + 25 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
      meeting_status: kind === 'cancelled' ? 'cancelled' : 'scheduled',
      meeting_platform: 'google_meet',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      meeting_duration_min: 60,
      meeting_owner_name: 'John Doe',
    };

    const tpl = await userTemplates.findTemplateForUserOrTenant(tenantId, userId, kind);
    if (!tpl) return res.status(400).json({ error: 'Template not found' });
    await sendMeetingAttendeeEmailWithTemplate(tenantId, userId, meeting, kind, {
      subject: tpl.subject,
      body_html: tpl.body_html,
      body_text: tpl.body_text,
    });
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
}
