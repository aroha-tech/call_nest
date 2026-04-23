import { query } from '../../config/db.js';
import * as meetingEmailTemplatesService from './meetingEmailTemplatesService.js';

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeMeetingPlatform(v) {
  const raw = String(v || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'google_meet';
  if (raw === 'google' || raw === 'google_meet' || raw === 'google-meet') return 'google_meet';
  if (raw === 'teams' || raw === 'microsoft_teams' || raw === 'microsoft-teams') return 'microsoft_teams';
  if (raw === 'custom') return 'custom';
  return 'google_meet';
}

function parseMysqlDateTime(raw) {
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function encodeUrlSafe(v) {
  return encodeURIComponent(String(v || '').trim());
}

function buildAutoMeetingLink(platform, { title, start_at, end_at }) {
  if (platform === 'google_meet') return 'https://meet.google.com/new';
  if (platform === 'microsoft_teams') {
    const subject = encodeUrlSafe(title || 'Meeting');
    const startIso = parseMysqlDateTime(start_at)?.toISOString() || '';
    const endIso = parseMysqlDateTime(end_at)?.toISOString() || '';
    const qs = `subject=${encodeUrlSafe(subject)}&startTime=${encodeUrlSafe(startIso)}&endTime=${encodeUrlSafe(endIso)}`;
    return `https://teams.microsoft.com/l/meeting/new?${qs}`;
  }
  return '';
}

export function applyTemplateVariables(text, variables = {}) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : `{{${key}}}`
  );
}

function formatDt(mysqlDt) {
  if (!mysqlDt) return '—';
  try {
    const d = new Date(String(mysqlDt).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(mysqlDt);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(mysqlDt);
  }
}

export function buildPlainVars(meeting) {
  const platform = normalizeMeetingPlatform(meeting.meeting_platform);
  const computedLink =
    meeting.meeting_link ||
    buildAutoMeetingLink(platform, {
      title: meeting.title,
      start_at: meeting.start_at,
      end_at: meeting.end_at,
    });
  return {
    title: meeting.title ?? '',
    start_at: formatDt(meeting.start_at),
    end_at: formatDt(meeting.end_at),
    location: meeting.location?.trim() || '',
    description: meeting.description?.trim() || '',
    meeting_status: meeting.meeting_status ?? '',
    meeting_platform: platform,
    meeting_link: computedLink,
    meeting_duration_min:
      meeting.meeting_duration_min != null ? String(meeting.meeting_duration_min) : '',
    meeting_owner_name: meeting.meeting_owner_name ?? '',
    attendee_email: meeting.attendee_email?.trim() || '',
    account_label: meeting.account_label || '',
    account_email: meeting.account_email || '',
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
    meeting_link: escapeHtml(p.meeting_link),
    meeting_duration_min: escapeHtml(p.meeting_duration_min),
    meeting_owner_name: escapeHtml(p.meeting_owner_name),
    attendee_email: escapeHtml(p.attendee_email),
    account_label: escapeHtml(p.account_label),
    account_email: escapeHtml(p.account_email),
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

/**
 * @param {number} tenantId
 * @param {number|null} userId
 * @param {'created'|'updated'|'cancelled'} kind
 * @param {object} meetingPayload - partial meeting from client (datetime strings ok)
 * @param {{ subject?: string, body_html?: string|null, body_text?: string|null }|null} [templateOverride] - unsaved draft; if null, load from DB
 */
export async function resolveMeetingEmailContent(tenantId, userId, kind, meetingPayload, templateOverride = null) {
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
    ...resolved,
  };
}
