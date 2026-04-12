import * as sendEmailService from '../email/sendEmailService.js';
import * as meetingEmailTemplatesService from './meetingEmailTemplatesService.js';
import * as meetingEmailContentResolve from './meetingEmailContentResolve.js';

/**
 * Send invite/update/cancel email to attendee using the meeting's email account
 * and tenant-editable templates.
 * Never throws — logs failures so meeting save still succeeds.
 *
 * @param {number} tenantId
 * @param {number|null} userId
 * @param {object} meeting - row from findById (needs email_account_id, attendee_email, title, …)
 * @param {'created'|'updated'|'cancelled'} kind
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function trySendMeetingAttendeeEmail(tenantId, userId, meeting, kind) {
  const to = meeting?.attendee_email?.trim();
  if (!to) {
    return { sent: false, reason: 'no_attendee_email' };
  }

  const accountId = meeting.email_account_id;
  if (!accountId) {
    return { sent: false, reason: 'no_email_account' };
  }

  try {
    const template = await meetingEmailTemplatesService.findByKind(tenantId, userId, kind);
    if (!template) {
      console.error('[meetingNotify] template missing for kind:', kind);
      return { sent: false, reason: 'template_missing' };
    }

    const resolved = meetingEmailContentResolve.resolveTemplateStrings(
      {
        subject: template.subject,
        body_html: template.body_html,
        body_text: template.body_text,
      },
      meeting
    );
    const subject = resolved.subject;
    const body_text = resolved.body_text || null;
    const body_html = resolved.body_html || null;

    if (!body_html?.trim() && !body_text?.trim()) {
      return { sent: false, reason: 'empty_template' };
    }

    await sendEmailService.sendEmail(
      tenantId,
      {
        email_account_id: accountId,
        to,
        subject,
        body_text: body_text || undefined,
        body_html: body_html || undefined,
      },
      userId ?? null
    );
    return { sent: true };
  } catch (err) {
    console.error('[meetingNotify] send failed:', err?.message || err);
    return { sent: false, reason: err?.message || 'send_failed' };
  }
}
