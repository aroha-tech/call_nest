import * as sendEmailService from '../email/sendEmailService.js';
import * as meetingEmailTemplatesService from './meetingEmailTemplatesService.js';
import * as meetingEmailContentResolve from './meetingEmailContentResolve.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIcsUtcDateTime(v) {
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
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
  const uid = `meeting-${meeting?.tenant_id || 't'}-${meeting?.id || 'x'}@callnest.local`;
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
    'PRODID:-//Call Nest//Meeting Invite//EN',
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
  const platform = String(meeting?.meeting_platform || '').trim() || 'Meeting';
  return `${html}<hr/><p><strong>${platform}</strong><br/><a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></p>`;
}

function ensureJoinDetailsInBodyText(bodyText, meeting) {
  const text = String(bodyText || '');
  const link = String(meeting?.meeting_link || '').trim();
  if (!link) return text;
  if (text.includes(link)) return text;
  const platform = String(meeting?.meeting_platform || '').trim() || 'Meeting';
  return `${text}\n\n${platform}\n${link}\n`;
}

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
    const body_text = ensureJoinDetailsInBodyText(resolved.body_text || null, meeting) || null;
    const body_html = ensureJoinDetailsInBodyHtml(resolved.body_html || null, meeting) || null;

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

    await sendEmailService.sendEmail(
      tenantId,
      {
        email_account_id: accountId,
        to,
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
