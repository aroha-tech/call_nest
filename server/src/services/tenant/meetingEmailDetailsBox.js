/**
 * HTML/text "meeting details" block appended to attendee emails when
 * include_meeting_details is enabled (same markup for preview + send).
 */

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

/** Plain field values for the meeting-details card (preview UI + HTML builder). */
export function meetingDetailsCardFieldValues(meeting) {
  const title = String(meeting?.title || '').trim() || 'Meeting';
  const date = formatDateValue(meeting?.start_at);
  const startTime = formatTimeValue(meeting?.start_at);
  const endTime = formatTimeValue(meeting?.end_at);
  const platform = String(meeting?.meeting_platform || '').trim() || 'Meeting';
  const link = String(meeting?.meeting_link || '').trim();
  const timeLine = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || '—';
  return { title, date, timeLine, platform, link };
}

export function buildMeetingDetailsBoxHtml(meeting) {
  const { title, date, timeLine, platform, link } = meetingDetailsCardFieldValues(meeting);
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

export function buildMeetingDetailsBoxText(meeting) {
  const { title, date, timeLine, platform, link } = meetingDetailsCardFieldValues(meeting);
  return (
    `\n\nMeeting details\n` +
    `Title: ${title}\n` +
    `Date: ${date || '—'}\n` +
    `Time: ${timeLine}\n` +
    `Platform: ${platform}\n` +
    `Link: ${link || '—'}\n`
  );
}
