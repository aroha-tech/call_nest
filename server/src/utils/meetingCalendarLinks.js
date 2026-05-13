import { parseMeetingInstantUtc } from './meetingInstant.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Google Calendar "template" dates: UTC `yyyyMMddTHHmmssZ` range. */
function googleCalendarDatesUtc(start, end) {
  const fmt = (d) =>
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(
      d.getUTCMinutes()
    )}${pad2(d.getUTCSeconds())}Z`;
  return `${fmt(start)}/${fmt(end)}`;
}

/**
 * "Add to Google Calendar" compose URL (best-effort from stored meeting instants).
 * @param {object} meeting
 * @returns {string}
 */
export function buildGoogleCalendarUrl(meeting) {
  const d0 = parseMeetingInstantUtc(meeting?.start_at);
  const d1 = parseMeetingInstantUtc(meeting?.end_at);
  if (!d0 || !d1 || Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) {
    return 'https://calendar.google.com/calendar/u/0/r';
  }
  const text = String(meeting?.title || 'Meeting').trim() || 'Meeting';
  const details = [meeting?.description, meeting?.meeting_link ? `Join: ${meeting.meeting_link}` : '']
    .filter(Boolean)
    .join('\n\n');
  const location = String(meeting?.location || meeting?.meeting_link || '').trim();
  const dates = googleCalendarDatesUtc(d0, d1);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/**
 * Outlook on the web compose deeplink (best-effort).
 * @param {object} meeting
 * @returns {string}
 */
export function buildOutlookCalendarComposeUrl(meeting) {
  const d0 = parseMeetingInstantUtc(meeting?.start_at);
  const d1 = parseMeetingInstantUtc(meeting?.end_at);
  if (!d0 || !d1 || Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) {
    return 'https://outlook.live.com/calendar/0/';
  }
  const subject = String(meeting?.title || 'Meeting').trim() || 'Meeting';
  const body = [meeting?.description, meeting?.meeting_link ? `Join: ${meeting.meeting_link}` : '']
    .filter(Boolean)
    .join('\n\n');
  const location = String(meeting?.location || meeting?.meeting_link || '').trim();
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject,
    body,
    location,
    startdt: d0.toISOString(),
    enddt: d1.toISOString(),
    allday: 'false',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}
