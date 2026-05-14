import * as sendEmailService from '../email/sendEmailService.js';
import * as meetingUserAttendeeEmailTemplatesService from './meetingUserAttendeeEmailTemplatesService.js';
import * as meetingDefaultEmailSettingsService from './meetingDefaultEmailSettingsService.js';
import * as meetingEmailContentResolve from './meetingEmailContentResolve.js';
import { parseMeetingInstantUtc } from '../../utils/meetingInstant.js';
import { PRODUCT_DISPLAY_NAME } from '../../config/productBrand.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIcsUtcDateTime(v) {
  const d = parseMeetingInstantUtc(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(v) {
  return String(v || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildMeetingIcs(meeting, kind, organizerEmail, attendeeEmail) {
  const dtStart = toIcsUtcDateTime(meeting?.start_at);
  const dtEnd = toIcsUtcDateTime(meeting?.end_at);
  if (!dtStart || !dtEnd) return null;

  const method = kind === 'cancelled' ? 'CANCEL' : 'REQUEST';
  const uid = `meeting-${meeting?.tenant_id || 't'}-${meeting?.id || 'x'}@callxtime.local`;
  const dtStamp = toIcsUtcDateTime(new Date().toISOString()) || dtStart;
  const title = escapeIcsText(meeting?.title || 'Meeting');
  const description = escapeIcsText(
    [
      meeting?.description || '',
      meeting?.meeting_link ? `Join: ${meeting.meeting_link}` : '',
      meeting?.location ? `Location: ${meeting.location}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
  const location = escapeIcsText(meeting?.location || meeting?.meeting_link || '');
  const organizer = organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : null;
  const attendee = attendeeEmail
    ? `ATTENDEE;CN=${escapeIcsText(attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`
    : null;
  const status = kind === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';
  const sequence = kind === 'created' ? '0' : '1';

  const lines = [
    'BEGIN:VCALENDAR',
    `PRODID:-//${PRODUCT_DISPLAY_NAME}//Meeting Invite//EN`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    meeting?.meeting_link ? `URL:${meeting.meeting_link}` : null,
    organizer,
    attendee,
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

function ensureJoinDetailsInBodyHtml(bodyHtml, meeting) {
  const html = String(bodyHtml || '');
  const link = String(meeting?.meeting_link || '').trim();
  if (!link) return html;
  if (html.includes(link)) return html;
  const platform = meetingEmailContentResolve.formatMeetingPlatformLabel(
    meetingEmailContentResolve.normalizeMeetingPlatform(meeting?.meeting_platform)
  );
  return `${html}<hr/><p><strong>${platform}</strong><br/><a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></p>`;
}

function ensureJoinDetailsInBodyText(bodyText, meeting) {
  const text = String(bodyText || '');
  const link = String(meeting?.meeting_link || '').trim();
  if (!link) return text;
  if (text.includes(link)) return text;
  const platform = meetingEmailContentResolve.formatMeetingPlatformLabel(
    meetingEmailContentResolve.normalizeMeetingPlatform(meeting?.meeting_platform)
  );
  return `${text}\n\n${platform}\n${link}\n`;
}

/**
 * Build final subject/HTML/text like outbound attendee mail (merge fields + join link hint when missing).
 */
export async function buildAttendeeEmailBodies(tenantId, meeting, templateFrom, _options = {}) {
  const resolved = meetingEmailContentResolve.resolveTemplateStrings(templateFrom, meeting);
  const subject = resolved.subject;
  let body_text = ensureJoinDetailsInBodyText(resolved.body_text || null, meeting) || null;
  let body_html = ensureJoinDetailsInBodyHtml(resolved.body_html || null, meeting) || null;
  return { subject, body_html, body_text };
}

/**
 * Send invite/update/cancel email to the meeting's **attendee_email** (To), from **email_account_id** (From),
 * with optional CC/BCC from the meeting owner's default **Meetings mail settings**.
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
    const ownerUserId = Number(meeting?.meeting_owner_user_id || meeting?.assigned_user_id || meeting?.created_by || 0) || null;
    const template = await meetingUserAttendeeEmailTemplatesService.findTemplateForUserOrTenant(
      tenantId,
      ownerUserId,
      kind
    );
    if (!template) {
      console.error('[meetingNotify] template missing for kind:', kind);
      return { sent: false, reason: 'template_missing' };
    }

    const built = await buildAttendeeEmailBodies(tenantId, meeting, {
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text,
    });
    const subject = built.subject;
    const body_text = built.body_text;
    const body_html = built.body_html;

    if (!body_html?.trim() && !body_text?.trim()) {
      return { sent: false, reason: 'empty_template' };
    }

    const ics = buildMeetingIcs(meeting, kind, meeting?.account_email || null, to);
    const attachments = ics
      ? [
          {
            filename: `meeting-${meeting?.id || 'invite'}.ics`,
            content: ics,
            contentType: 'text/calendar; charset=utf-8; method=' + (kind === 'cancelled' ? 'CANCEL' : 'REQUEST'),
          },
        ]
      : [];

    let cc;
    let bcc;
    if (ownerUserId) {
      try {
        const ownerSettings = await meetingDefaultEmailSettingsService.getOrCreateForUser(tenantId, ownerUserId);
        const pair = meetingDefaultEmailSettingsService.getCcBccForKind(ownerSettings, kind);
        cc = pair.cc || undefined;
        bcc = pair.bcc || undefined;
      } catch (_) {
        /* non-fatal */
      }
    }

    await sendEmailService.sendEmail(
      tenantId,
      {
        email_account_id: accountId,
        to,
        cc,
        bcc,
        subject,
        body_text: body_text || undefined,
        body_html: body_html || undefined,
        attachments,
      },
      userId ?? null
    );
    return { sent: true };
  } catch (err) {
    console.error('[meetingNotify] send failed:', err?.message || err);
    return { sent: false, reason: err?.message || 'send_failed' };
  }
}

/**
 * Used by test-send endpoints. Sends using the provided template override.
 */
export async function sendMeetingAttendeeEmailWithTemplate(tenantId, userId, meeting, kind, templateOverride) {
  const to = meeting?.attendee_email?.trim();
  if (!to) {
    const err = new Error('attendee_email is required');
    err.status = 400;
    throw err;
  }
  const accountId = meeting.email_account_id;
  if (!accountId) {
    const err = new Error('email_account_id is required');
    err.status = 400;
    throw err;
  }
  const built = await buildAttendeeEmailBodies(tenantId, meeting, {
    subject: templateOverride?.subject || '',
    body_html: templateOverride?.body_html || null,
    body_text: templateOverride?.body_text || null,
  });
  const subject = built.subject;
  const body_text = built.body_text;
  const body_html = built.body_html;
  if (!body_html?.trim() && !body_text?.trim()) {
    const err = new Error('Template body is empty');
    err.status = 400;
    throw err;
  }
  const ics = buildMeetingIcs(meeting, kind, meeting?.account_email || null, to);
  const attachments = ics
    ? [
        {
          filename: `meeting-${meeting?.id || 'invite'}.ics`,
          content: ics,
          contentType: 'text/calendar; charset=utf-8; method=' + (kind === 'cancelled' ? 'CANCEL' : 'REQUEST'),
        },
      ]
    : [];

  const ownerUserId = Number(meeting?.meeting_owner_user_id || meeting?.assigned_user_id || meeting?.created_by || 0) || null;
  let cc;
  let bcc;
  if (ownerUserId) {
    try {
      const ownerSettings = await meetingDefaultEmailSettingsService.getOrCreateForUser(tenantId, ownerUserId);
      const pair = meetingDefaultEmailSettingsService.getCcBccForKind(ownerSettings, kind);
      cc = pair.cc || undefined;
      bcc = pair.bcc || undefined;
    } catch (_) {
      /* non-fatal */
    }
  }

  await sendEmailService.sendEmail(
    tenantId,
    {
      email_account_id: accountId,
      to,
      cc,
      bcc,
      subject,
      body_text: body_text || undefined,
      body_html: body_html || undefined,
      attachments,
    },
    userId ?? null
  );
  return { sent: true };
}
