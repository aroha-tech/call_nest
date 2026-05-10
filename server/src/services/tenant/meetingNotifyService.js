import * as sendEmailService from '../email/sendEmailService.js';
import * as meetingUserAttendeeEmailTemplatesService from './meetingUserAttendeeEmailTemplatesService.js';
import * as meetingEmailContentResolve from './meetingEmailContentResolve.js';
import { query } from '../../config/db.js';

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

function parseMeetingInstant(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateValue(raw) {
  const d = parseMeetingInstant(raw);
  if (!d) return String(raw || '').trim() || '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatTimeValue(raw) {
  const d = parseMeetingInstant(raw);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function buildMeetingDetailsBoxHtml(meeting) {
  const title = String(meeting?.title || '').trim() || 'Meeting';
  const date = formatDateValue(meeting?.start_at);
  const startTime = formatTimeValue(meeting?.start_at);
  const endTime = formatTimeValue(meeting?.end_at);
  const platform = String(meeting?.meeting_platform || '').trim() || 'Meeting';
  const link = String(meeting?.meeting_link || '').trim();
  const timeLine = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || '—';
  const linkHtml = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`
    : '—';
  const joinCta = link
    ? `<p style="margin:14px 0 0;"><a href="${link}" target="_blank" rel="noopener noreferrer" ` +
      `style="display:inline-block;padding:10px 18px;border-radius:10px;background:#2563eb;color:#ffffff;` +
      `font-weight:600;font-size:14px;text-decoration:none;">Join meeting</a></p>`
    : '';
  return (
    `<div style="margin-top:16px;padding:14px 16px;border-radius:12px;` +
    `background:#f5f7ff;border:1px solid #dbe3ff;font-size:13px;line-height:1.45;color:#1f2937;">` +
    `<p style="margin:0 0 10px;font-weight:700;font-size:13px;color:#111827;">Meeting details</p>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse;">` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Title</td><td style="padding:3px 0;">${title}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Date</td><td style="padding:3px 0;">${date || '—'}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Time</td><td style="padding:3px 0;">${timeLine}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Platform</td><td style="padding:3px 0;">${platform}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Link</td><td style="padding:3px 0;">${linkHtml}</td></tr>` +
    `</table>${joinCta}</div>`
  );
}

function buildMeetingDetailsBoxText(meeting) {
  const title = String(meeting?.title || '').trim() || 'Meeting';
  const date = formatDateValue(meeting?.start_at);
  const startTime = formatTimeValue(meeting?.start_at);
  const endTime = formatTimeValue(meeting?.end_at);
  const platform = String(meeting?.meeting_platform || '').trim() || 'Meeting';
  const link = String(meeting?.meeting_link || '').trim();
  const timeLine = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || '—';
  return (
    `\n\nMeeting details\n` +
    `Title: ${title}\n` +
    `Date: ${date || '—'}\n` +
    `Time: ${timeLine}\n` +
    `Platform: ${platform}\n` +
    `Link: ${link || '—'}\n`
  );
}

async function includeMeetingDetailsEnabled(tenantId, meeting) {
  const ownerUserId =
    Number(meeting?.meeting_owner_user_id || meeting?.assigned_user_id || meeting?.created_by || 0) || null;
  if (!ownerUserId) return true;
  try {
    const [row] = await query(
      `SELECT include_meeting_details
       FROM tenant_user_meeting_email_settings
       WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [Number(tenantId), ownerUserId]
    );
    if (!row) return true;
    return Boolean(row.include_meeting_details);
  } catch {
    // Avoid blocking send if table/migration is not available yet.
    return true;
  }
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

    const resolved = meetingEmailContentResolve.resolveTemplateStrings(
      {
        subject: template.subject,
        body_html: template.body_html,
        body_text: template.body_text,
      },
      meeting
    );
    const subject = resolved.subject;
    let body_text = ensureJoinDetailsInBodyText(resolved.body_text || null, meeting) || null;
    let body_html = ensureJoinDetailsInBodyHtml(resolved.body_html || null, meeting) || null;
    const includeDetails = await includeMeetingDetailsEnabled(tenantId, meeting);
    if (includeDetails) {
      const detailsHtml = buildMeetingDetailsBoxHtml(meeting);
      const detailsText = buildMeetingDetailsBoxText(meeting);
      body_html = `${body_html || ''}${detailsHtml}`;
      body_text = `${body_text || ''}${detailsText}`;
    }

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
  const resolved = meetingEmailContentResolve.resolveTemplateStrings(
    {
      subject: templateOverride?.subject || '',
      body_html: templateOverride?.body_html || null,
      body_text: templateOverride?.body_text || null,
    },
    meeting
  );
  const subject = resolved.subject;
  let body_text = ensureJoinDetailsInBodyText(resolved.body_text || null, meeting) || null;
  let body_html = ensureJoinDetailsInBodyHtml(resolved.body_html || null, meeting) || null;
  const includeDetails = await includeMeetingDetailsEnabled(tenantId, meeting);
  if (includeDetails) {
    const detailsHtml = buildMeetingDetailsBoxHtml(meeting);
    const detailsText = buildMeetingDetailsBoxText(meeting);
    body_html = `${body_html || ''}${detailsHtml}`;
    body_text = `${body_text || ''}${detailsText}`;
  }
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
}
