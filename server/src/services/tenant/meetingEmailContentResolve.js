import { query } from '../../config/db.js';
import { parseMeetingInstantUtc } from '../../utils/meetingInstant.js';
import * as meetingEmailTemplatesService from './meetingEmailTemplatesService.js';
import { meetingDetailsCardFieldValues } from './meetingEmailDetailsBox.js';
import { buildGoogleCalendarUrl, buildOutlookCalendarComposeUrl } from '../../utils/meetingCalendarLinks.js';

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeMeetingPlatform(v) {
  const raw = String(v || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'google_meet';
  if (raw === 'google' || raw === 'google_meet' || raw === 'google-meet') return 'google_meet';
  if (raw === 'teams' || raw === 'microsoft_teams' || raw === 'microsoft-teams') return 'microsoft_teams';
  if (raw === 'custom') return 'custom';
  return 'google_meet';
}

/** Human-readable platform for email templates (use {{meeting_platform_label}} in HTML/text). */
export function formatMeetingPlatformLabel(normalizedPlatform) {
  const p = String(normalizedPlatform || '').trim();
  if (p === 'google_meet') return 'Google Meet';
  if (p === 'microsoft_teams') return 'Microsoft Teams';
  if (p === 'custom') return 'Video link';
  return 'Google Meet';
}

export function applyTemplateVariables(text, variables = {}) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : `{{${key}}}`
  );
}

const DEFAULT_MEETING_TZ = 'Asia/Kolkata';

function safeTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return DEFAULT_MEETING_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return s;
  } catch {
    return DEFAULT_MEETING_TZ;
  }
}

function formatDt(mysqlDt, meeting = {}) {
  if (!mysqlDt) return '—';
  try {
    const d = parseMeetingInstantUtc(mysqlDt);
    if (!d) return String(mysqlDt);
    const tz = safeTimeZone(meeting.meeting_timezone || meeting.owner_datetime_timezone);
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(d);
  } catch {
    return String(mysqlDt);
  }
}

export function buildPlainVars(meeting) {
  const platform = normalizeMeetingPlatform(meeting.meeting_platform);
  const computedLink = String(meeting.meeting_link || '').trim();
  const card = meetingDetailsCardFieldValues(meeting);
  return {
    title: meeting.title ?? '',
    start_at: formatDt(meeting.start_at, meeting),
    end_at: formatDt(meeting.end_at, meeting),
    location: meeting.location?.trim() || '',
    description: meeting.description?.trim() || '',
    meeting_status: meeting.meeting_status ?? '',
    meeting_platform: platform,
    meeting_platform_label: formatMeetingPlatformLabel(platform),
    meeting_link: computedLink,
    meeting_duration_min:
      meeting.meeting_duration_min != null ? String(meeting.meeting_duration_min) : '',
    meeting_owner_name: meeting.meeting_owner_name ?? '',
    attendee_email: meeting.attendee_email?.trim() || '',
    account_label: meeting.account_label || '',
    account_email: meeting.account_email || '',
    meeting_card_date: card.date,
    meeting_card_time: card.timeLine,
    calendar_google_url: buildGoogleCalendarUrl(meeting),
    calendar_outlook_url: buildOutlookCalendarComposeUrl(meeting),
  };
}

export function buildHtmlVars(meeting) {
  const p = buildPlainVars(meeting);
  return {
    title: escapeHtml(p.title),
    start_at: escapeHtml(p.start_at),
    end_at: escapeHtml(p.end_at),
    location: escapeHtml(p.location),
    description: p.description ? escapeHtml(p.description).replace(/\n/g, '<br/>') : '',
    meeting_status: escapeHtml(p.meeting_status),
    meeting_platform: escapeHtml(p.meeting_platform),
    meeting_platform_label: escapeHtml(p.meeting_platform_label),
    meeting_link: escapeHtml(p.meeting_link),
    meeting_duration_min: escapeHtml(p.meeting_duration_min),
    meeting_owner_name: escapeHtml(p.meeting_owner_name),
    attendee_email: escapeHtml(p.attendee_email),
    account_label: escapeHtml(p.account_label),
    account_email: escapeHtml(p.account_email),
    meeting_card_date: escapeHtml(p.meeting_card_date),
    meeting_card_time: escapeHtml(p.meeting_card_time),
    calendar_google_url: escapeHtml(p.calendar_google_url),
    calendar_outlook_url: escapeHtml(p.calendar_outlook_url),
  };
}

/**
 * Fill account_label / account_email from email_accounts when email_account_id is set.
 * @param {number} tenantId
 * @param {object} payload - partial meeting (title, start_at, email_account_id, …)
 */
export async function enrichMeetingPayload(tenantId, payload) {
  const p = { ...payload };
  const id = Number(p.email_account_id);
  if (Number.isFinite(id) && id > 0) {
    const [row] = await query(
      `SELECT email_address,
              COALESCE(account_name, email_address) AS account_label
       FROM email_accounts
       WHERE tenant_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
      [tenantId, id]
    );
    if (row) {
      p.account_email = row.email_address;
      p.account_label = row.account_label;
    }
    p.email_account_id = id;
  }
  return p;
}

/**
 * Resolve template to final subject/bodies.
 * @param {object} template - { subject, body_html, body_text }
 * @param {object} meeting - enriched row-like object
 */
export function resolveTemplateStrings(template, meeting) {
  const plainVars = buildPlainVars(meeting);
  const htmlVars = buildHtmlVars(meeting);
  const subject = applyTemplateVariables(template.subject, plainVars);
  const body_text = template.body_text ? applyTemplateVariables(template.body_text, plainVars) : '';
  const body_html = template.body_html ? applyTemplateVariables(template.body_html, htmlVars) : '';
  return { subject, body_html, body_text };
}

function parseDt(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  return parseMeetingInstantUtc(raw);
}

/** Plain merge fields for reminder/feedback emails (attendee + automation-specific keys). */
export function buildAutomationPlainVars(meeting, feedbackLink = '') {
  const base = buildPlainVars(meeting);
  const start = parseDt(meeting.start_at);
  const end = parseDt(meeting.end_at);
  const tz = safeTimeZone(meeting.meeting_timezone || meeting.owner_datetime_timezone);
  const fmtDate = (d) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: tz }).format(d);
  const fmtTime = (d) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  const startT = start ? fmtTime(start) : '';
  const endT = end ? fmtTime(end) : '';
  let meeting_time_range = '';
  if (start) {
    meeting_time_range =
      end && end.getTime() !== start.getTime() && endT ? `${startT} - ${endT}` : startT || '';
  }
  return {
    ...base,
    meeting_date: start ? fmtDate(start) : '',
    meeting_time: meeting_time_range,
    meeting_end_time: end ? fmtTime(end) : '',
    company_name: meeting.tenant_company_name || 'Your Company',
    contact_name: meeting.contact_name || '',
    feedback_link: feedbackLink,
    feedback_url: feedbackLink,
  };
}

/** HTML merge fields for reminder/feedback templates. */
export function buildAutomationHtmlVars(meeting, feedbackLink = '') {
  const plain = buildAutomationPlainVars(meeting, feedbackLink);
  const htmlBase = buildHtmlVars(meeting);
  const htmlKeys = new Set(Object.keys(htmlBase));
  const extra = Object.fromEntries(
    Object.entries(plain)
      .filter(([k]) => !htmlKeys.has(k))
      .map(([k, v]) => [k, escapeHtml(v)])
  );
  return { ...htmlBase, ...extra };
}

function ensureJoinDetailsInBodyHtml(bodyHtml, meeting) {
  const html = String(bodyHtml || '');
  const link = String(meeting?.meeting_link || '').trim();
  if (!link) return html;
  if (html.includes(link)) return html;
  const platform = formatMeetingPlatformLabel(normalizeMeetingPlatform(meeting?.meeting_platform));
  return `${html}<hr/><p><strong>${platform}</strong><br/><a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></p>`;
}

function ensureJoinDetailsInBodyText(bodyText, meeting) {
  const text = String(bodyText || '');
  const link = String(meeting?.meeting_link || '').trim();
  if (!link) return text;
  if (text.includes(link)) return text;
  const platform = formatMeetingPlatformLabel(normalizeMeetingPlatform(meeting?.meeting_platform));
  return `${text}\n\n${platform}\n${link}\n`;
}

/**
 * Resolve reminder/feedback templates the same way as invitation mail (merge fields + join link).
 * @param {{ subject?: string, body_html?: string|null, body_text?: string|null }} template
 * @param {object} meeting
 * @param {{ feedbackLink?: string }} [options]
 */
export function buildAutomationEmailBodies(template, meeting, options = {}) {
  const feedbackLink = options.feedbackLink || '';
  const plainVars = buildAutomationPlainVars(meeting, feedbackLink);
  const htmlVars = buildAutomationHtmlVars(meeting, feedbackLink);
  const subject = applyTemplateVariables(template?.subject, plainVars);
  let body_text = template?.body_text ? applyTemplateVariables(template.body_text, plainVars) : '';
  let body_html = template?.body_html ? applyTemplateVariables(template.body_html, htmlVars) : '';
  body_html = ensureJoinDetailsInBodyHtml(body_html, meeting);
  body_text = ensureJoinDetailsInBodyText(body_text, meeting);
  return { subject, body_html, body_text };
}

/**
 * @param {number} tenantId
 * @param {number|null} userId
 * @param {'created'|'updated'|'cancelled'} kind
 * @param {object} meetingPayload - partial meeting from client (datetime strings ok)
 * @param {{ subject?: string, body_html?: string|null, body_text?: string|null }|null} [templateOverride] - unsaved draft; if null, load from DB
 */
export async function resolveMeetingEmailContent(
  tenantId,
  userId,
  kind,
  meetingPayload,
  templateOverride = null,
  _options = {}
) {
  const meeting = await enrichMeetingPayload(tenantId, meetingPayload || {});

  let template;
  if (
    templateOverride &&
    (templateOverride.subject != null || templateOverride.body_html != null || templateOverride.body_text != null)
  ) {
    template = {
      subject: templateOverride.subject ?? '',
      body_html: templateOverride.body_html ?? null,
      body_text: templateOverride.body_text ?? null,
    };
  } else {
    const row = await meetingEmailTemplatesService.findByKind(tenantId, userId, kind);
    if (!row) {
      const err = new Error('Email template not found');
      err.status = 404;
      throw err;
    }
    template = {
      subject: row.subject,
      body_html: row.body_html,
      body_text: row.body_text,
    };
  }

  if (!String(template.subject || '').trim()) {
    const err = new Error('Template subject is empty');
    err.status = 400;
    throw err;
  }

  const resolved = resolveTemplateStrings(template, meeting);
  return {
    template_kind: kind,
    subject: resolved.subject,
    body_html: resolved.body_html,
    body_text: resolved.body_text,
  };
}
