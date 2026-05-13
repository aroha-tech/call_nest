import crypto from 'crypto';
import { query } from '../../config/db.js';
import { env } from '../../config/env.js';
import { parseMeetingInstantUtc } from '../../utils/meetingInstant.js';
import { normalizeEmailRecipientListString, firstInvalidEmailInRecipientList } from '../../utils/emailRecipientList.js';
import * as sendEmailService from '../email/sendEmailService.js';
import { createAndDispatchNotification, listUserIdsByRoles } from './notificationService.js';
import { meetingDetailsCardFieldValues } from './meetingEmailDetailsBox.js';
import {
  normalizeMeetingPlatform,
  formatMeetingPlatformLabel,
} from './meetingEmailContentResolve.js';
import {
  DEFAULT_MEETING_REMINDER_EMAIL_HTML,
  DEFAULT_MEETING_REMINDER_EMAIL_TEXT,
  DEFAULT_MEETING_FEEDBACK_EMAIL_HTML,
  DEFAULT_MEETING_FEEDBACK_EMAIL_TEXT,
} from '../../utils/defaultMeetingEmailBodiesHtml.js';
import { buildGoogleCalendarUrl, buildOutlookCalendarComposeUrl } from '../../utils/meetingCalendarLinks.js';

const DEFAULT_REMINDER_OFFSETS = [
  { value: 1, unit: 'days' },
  { value: 1, unit: 'hours' },
  { value: 15, unit: 'minutes' },
];

const ALLOWED_UNITS = new Set(['minutes', 'hours', 'days']);

/** Email kinds that can each have their own default CC/BCC (matches UI tabs). */
export const MEETING_EMAIL_CC_BCC_KINDS = Object.freeze([
  'created',
  'reminder',
  'feedback',
  'updated',
  'cancelled',
]);

function emptyCcBccByKind() {
  return Object.fromEntries(MEETING_EMAIL_CC_BCC_KINDS.map((k) => [k, { cc: '', bcc: '' }]));
}

const DEFAULTS = {
  reminder_enabled: true,
  reminder_offsets: DEFAULT_REMINDER_OFFSETS,
  reminder_subject: 'Reminder: {{title}} on {{meeting_date}} at {{meeting_time}}',
  reminder_body_html: DEFAULT_MEETING_REMINDER_EMAIL_HTML,
  reminder_body_text: DEFAULT_MEETING_REMINDER_EMAIL_TEXT,
  feedback_enabled: true,
  feedback_delay_value: 2,
  feedback_delay_unit: 'hours',
  feedback_subject: 'How was your meeting with us?',
  feedback_body_html: DEFAULT_MEETING_FEEDBACK_EMAIL_HTML,
  feedback_body_text: DEFAULT_MEETING_FEEDBACK_EMAIL_TEXT,
  thank_you_page_url: '',
  default_cc_email: '',
  default_bcc_email: '',
  default_cc_bcc_by_kind: emptyCcBccByKind(),
};

function asBool(v, fallback) {
  if (v == null) return fallback;
  return Boolean(v);
}

function asString(v, fallback = '') {
  if (v == null) return fallback;
  return String(v);
}

function normalizeOffsets(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const cleaned = arr
    .map((item) => ({
      value: Number(item?.value),
      unit: String(item?.unit || '').trim().toLowerCase(),
    }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0 && ALLOWED_UNITS.has(x.unit))
    .map((x) => ({ value: Math.floor(x.value), unit: x.unit }));
  return cleaned.length ? cleaned : DEFAULT_REMINDER_OFFSETS;
}

function offsetsToMinutes(offsets) {
  const out = [];
  for (const item of normalizeOffsets(offsets)) {
    if (item.unit === 'minutes') out.push(item.value);
    else if (item.unit === 'hours') out.push(item.value * 60);
    else if (item.unit === 'days') out.push(item.value * 24 * 60);
  }
  return [...new Set(out)].sort((a, b) => b - a);
}

function parseJsonOrNull(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cloneCcBccByKind(by) {
  const out = emptyCcBccByKind();
  for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
    if (by?.[k] && typeof by[k] === 'object') {
      out[k].cc = String(by[k].cc ?? '');
      out[k].bcc = String(by[k].bcc ?? '');
    }
  }
  return out;
}

/**
 * Build per-kind CC/BCC from DB row (JSON column + legacy flat columns).
 */
function defaultCcBccByKindFromRow(row) {
  const out = emptyCcBccByKind();
  const legacyCc = normalizeEmailRecipientListString(row?.default_cc_email != null ? String(row.default_cc_email) : '');
  const legacyBcc = normalizeEmailRecipientListString(row?.default_bcc_email != null ? String(row.default_bcc_email) : '');
  const jsonParsed = parseJsonOrNull(row?.default_cc_bcc_json);
  let anyFromJson = false;
  if (jsonParsed && typeof jsonParsed === 'object' && !Array.isArray(jsonParsed)) {
    for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
      const entry = jsonParsed[k];
      if (entry && typeof entry === 'object') {
        out[k].cc = normalizeEmailRecipientListString(String(entry.cc ?? '')).slice(0, 1000);
        out[k].bcc = normalizeEmailRecipientListString(String(entry.bcc ?? '')).slice(0, 1000);
        if (out[k].cc || out[k].bcc) anyFromJson = true;
      }
    }
  }
  if (!anyFromJson && (legacyCc || legacyBcc)) {
    for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
      out[k] = { cc: legacyCc, bcc: legacyBcc };
    }
  } else {
    for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
      out[k].cc = normalizeEmailRecipientListString(out[k].cc || '').slice(0, 1000);
      out[k].bcc = normalizeEmailRecipientListString(out[k].bcc || '').slice(0, 1000);
    }
  }
  return out;
}

/**
 * Normalized CC/BCC strings for one email type (for outbound mail and workspace).
 * @param {object} setting - row-shaped or getOrCreateForUser() result
 * @param {string} kind - created | reminder | feedback | updated | cancelled
 */
export function getCcBccForKind(setting, kind) {
  const k = String(kind || '').trim().toLowerCase();
  const byKind = setting?.default_cc_bcc_by_kind;
  if (byKind && typeof byKind === 'object' && !Array.isArray(byKind) && MEETING_EMAIL_CC_BCC_KINDS.includes(k)) {
    const slot = byKind[k];
    if (slot && typeof slot === 'object') {
      return {
        cc: normalizeEmailRecipientListString(String(slot.cc ?? '')),
        bcc: normalizeEmailRecipientListString(String(slot.bcc ?? '')),
      };
    }
  }
  const cc = normalizeEmailRecipientListString(setting?.default_cc_email || '');
  const bcc = normalizeEmailRecipientListString(setting?.default_bcc_email || '');
  return { cc, bcc };
}

function ccBccFromSettingForKind(setting, kind) {
  const { cc, bcc } = getCcBccForKind(setting, kind);
  return {
    cc: cc || undefined,
    bcc: bcc || undefined,
  };
}

function applyTemplateVars(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : `{{${key}}}`
  );
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function parseDt(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  return parseMeetingInstantUtc(raw);
}

function meetingVars(meeting, feedbackLink = '') {
  const start = parseDt(meeting.start_at);
  const end = parseDt(meeting.end_at);
  const tz = safeTimeZone(meeting.meeting_timezone || meeting.owner_datetime_timezone);
  const fmtDate = (d) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: tz }).format(d);
  const fmtTime = (d) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  const startT = start ? fmtTime(start) : '';
  const endT = end ? fmtTime(end) : '';
  let meeting_time_range = '';
  if (start) {
    meeting_time_range = end && end.getTime() !== start.getTime() && endT ? `${startT} - ${endT}` : startT || '';
  }
  const card = meetingDetailsCardFieldValues(meeting);
  const platformKey = normalizeMeetingPlatform(meeting.meeting_platform);
  return {
    title: meeting.title || 'Meeting',
    attendee_email: meeting.attendee_email || '',
    meeting_date: start ? fmtDate(start) : '',
    meeting_time: meeting_time_range,
    meeting_end_time: end ? fmtTime(end) : '',
    meeting_link: meeting.meeting_link || '',
    meeting_platform: platformKey,
    meeting_platform_label: formatMeetingPlatformLabel(platformKey),
    location: meeting.location || '',
    description: meeting.description || '',
    company_name: meeting.tenant_company_name || 'Your Company',
    contact_name: meeting.contact_name || '',
    feedback_link: feedbackLink,
    feedback_url: feedbackLink,
    meeting_card_date: card.date,
    meeting_card_time: card.timeLine,
    calendar_google_url: buildGoogleCalendarUrl(meeting),
    calendar_outlook_url: buildOutlookCalendarComposeUrl(meeting),
  };
}

export async function getOrCreateForUser(tenantId, userId) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  if (!Number.isFinite(tid) || !Number.isFinite(uid)) {
    const err = new Error('Invalid tenant/user');
    err.status = 400;
    throw err;
  }

  const [existing] = await query(
    `SELECT *
     FROM tenant_user_meeting_email_settings
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid, uid]
  );
  if (!existing) {
    await query(
      `INSERT INTO tenant_user_meeting_email_settings
        (tenant_id, user_id, reminder_enabled, reminder_offsets_json, reminder_subject, reminder_body_html, reminder_body_text,
         feedback_enabled, feedback_delay_value, feedback_delay_unit, feedback_subject, feedback_body_html, feedback_body_text,
         thank_you_page_url, include_meeting_details, created_by, updated_by)
       VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tid,
        uid,
        DEFAULTS.reminder_enabled ? 1 : 0,
        JSON.stringify(DEFAULTS.reminder_offsets),
        DEFAULTS.reminder_subject,
        DEFAULTS.reminder_body_html,
        DEFAULTS.reminder_body_text,
        DEFAULTS.feedback_enabled ? 1 : 0,
        DEFAULTS.feedback_delay_value,
        DEFAULTS.feedback_delay_unit,
        DEFAULTS.feedback_subject,
        DEFAULTS.feedback_body_html,
        DEFAULTS.feedback_body_text,
        DEFAULTS.thank_you_page_url || null,
        1,
        uid,
        uid,
      ]
    );
  }

  const [row] = await query(
    `SELECT *
     FROM tenant_user_meeting_email_settings
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid, uid]
  );
  if (!row) return { ...DEFAULTS, user_id: uid };
  const default_cc_bcc_by_kind = defaultCcBccByKindFromRow(row);
  const createdSlot = default_cc_bcc_by_kind.created || { cc: '', bcc: '' };
  return {
    user_id: uid,
    reminder_enabled: Boolean(row.reminder_enabled),
    reminder_offsets: normalizeOffsets(parseJsonOrNull(row.reminder_offsets_json)),
    reminder_subject: row.reminder_subject || DEFAULTS.reminder_subject,
    reminder_body_html: row.reminder_body_html || '',
    reminder_body_text: row.reminder_body_text || '',
    feedback_enabled: Boolean(row.feedback_enabled),
    feedback_delay_value: Number(row.feedback_delay_value || DEFAULTS.feedback_delay_value),
    feedback_delay_unit: ALLOWED_UNITS.has(String(row.feedback_delay_unit)) ? row.feedback_delay_unit : DEFAULTS.feedback_delay_unit,
    feedback_subject: row.feedback_subject || DEFAULTS.feedback_subject,
    feedback_body_html: row.feedback_body_html || '',
    feedback_body_text: row.feedback_body_text || '',
    thank_you_page_url: row.thank_you_page_url || '',
    default_cc_bcc_by_kind,
    default_cc_email: createdSlot.cc,
    default_bcc_email: createdSlot.bcc,
  };
}

export async function updateForUser(tenantId, userId, actingUserId, payload) {
  const current = await getOrCreateForUser(tenantId, userId);
  const nextByKind = cloneCcBccByKind(current.default_cc_bcc_by_kind);
  const incomingByKind = payload?.default_cc_bcc_by_kind;
  if (incomingByKind && typeof incomingByKind === 'object' && !Array.isArray(incomingByKind)) {
    for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
      if (incomingByKind[k] && typeof incomingByKind[k] === 'object') {
        if (incomingByKind[k].cc !== undefined) {
          nextByKind[k].cc = normalizeEmailRecipientListString(String(incomingByKind[k].cc ?? '')).slice(0, 1000);
        }
        if (incomingByKind[k].bcc !== undefined) {
          nextByKind[k].bcc = normalizeEmailRecipientListString(String(incomingByKind[k].bcc ?? '')).slice(0, 1000);
        }
      }
    }
  } else if (payload?.default_cc_email !== undefined || payload?.default_bcc_email !== undefined) {
    const lc = normalizeEmailRecipientListString(
      asString(payload?.default_cc_email, current.default_cc_email)
    ).slice(0, 1000);
    const lb = normalizeEmailRecipientListString(
      asString(payload?.default_bcc_email, current.default_bcc_email)
    ).slice(0, 1000);
    for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
      nextByKind[k] = { cc: lc, bcc: lb };
    }
  }

  for (const k of MEETING_EMAIL_CC_BCC_KINDS) {
    const badCc = firstInvalidEmailInRecipientList(nextByKind[k].cc);
    if (badCc) {
      const err = new Error(`Invalid CC for ${k}: "${badCc}" is not a valid email address`);
      err.status = 400;
      throw err;
    }
    const badBcc = firstInvalidEmailInRecipientList(nextByKind[k].bcc);
    if (badBcc) {
      const err = new Error(`Invalid BCC for ${k}: "${badBcc}" is not a valid email address`);
      err.status = 400;
      throw err;
    }
  }

  const legacyCreatedCc = nextByKind.created?.cc || '';
  const legacyCreatedBcc = nextByKind.created?.bcc || '';

  const next = {
    reminder_enabled: asBool(payload?.reminder_enabled, current.reminder_enabled),
    reminder_offsets: normalizeOffsets(payload?.reminder_offsets ?? current.reminder_offsets),
    reminder_subject: asString(payload?.reminder_subject, current.reminder_subject).trim() || DEFAULTS.reminder_subject,
    reminder_body_html: asString(payload?.reminder_body_html, current.reminder_body_html),
    reminder_body_text: asString(payload?.reminder_body_text, current.reminder_body_text),
    feedback_enabled: asBool(payload?.feedback_enabled, current.feedback_enabled),
    feedback_delay_value: Math.max(1, Math.floor(Number(payload?.feedback_delay_value ?? current.feedback_delay_value) || current.feedback_delay_value)),
    feedback_delay_unit: ALLOWED_UNITS.has(String(payload?.feedback_delay_unit || '').toLowerCase())
      ? String(payload.feedback_delay_unit).toLowerCase()
      : current.feedback_delay_unit,
    feedback_subject: asString(payload?.feedback_subject, current.feedback_subject).trim() || DEFAULTS.feedback_subject,
    feedback_body_html: asString(payload?.feedback_body_html, current.feedback_body_html),
    feedback_body_text: asString(payload?.feedback_body_text, current.feedback_body_text),
    thank_you_page_url: asString(payload?.thank_you_page_url, current.thank_you_page_url).trim(),
    default_cc_email: legacyCreatedCc,
    default_bcc_email: legacyCreatedBcc,
    default_cc_bcc_json: JSON.stringify(nextByKind),
  };
  await query(
    `UPDATE tenant_user_meeting_email_settings
     SET reminder_enabled = ?,
         reminder_offsets_json = CAST(? AS JSON),
         reminder_subject = ?,
         reminder_body_html = ?,
         reminder_body_text = ?,
         feedback_enabled = ?,
         feedback_delay_value = ?,
         feedback_delay_unit = ?,
         feedback_subject = ?,
         feedback_body_html = ?,
         feedback_body_text = ?,
         thank_you_page_url = ?,
         include_meeting_details = 1,
         default_cc_email = ?,
         default_bcc_email = ?,
         default_cc_bcc_json = CAST(? AS JSON),
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [
      next.reminder_enabled ? 1 : 0,
      JSON.stringify(next.reminder_offsets),
      next.reminder_subject,
      next.reminder_body_html || null,
      next.reminder_body_text || null,
      next.feedback_enabled ? 1 : 0,
      next.feedback_delay_value,
      next.feedback_delay_unit,
      next.feedback_subject,
      next.feedback_body_html || null,
      next.feedback_body_text || null,
      next.thank_you_page_url || null,
      next.default_cc_email || null,
      next.default_bcc_email || null,
      next.default_cc_bcc_json,
      actingUserId ?? null,
      Number(tenantId),
      Number(userId),
    ]
  );
  return getOrCreateForUser(tenantId, userId);
}

async function getSettingsForUsers(tenantId, userIds) {
  const ids = [...new Set(userIds.map((x) => Number(x)).filter(Number.isFinite))];
  if (!ids.length) return new Map();
  for (const uid of ids) await getOrCreateForUser(tenantId, uid);
  const rows = await query(
    `SELECT *
     FROM tenant_user_meeting_email_settings
     WHERE tenant_id = ? AND user_id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`,
    [tenantId, ...ids]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.user_id), {
      reminder_enabled: Boolean(row.reminder_enabled),
      reminder_offsets_minutes: offsetsToMinutes(parseJsonOrNull(row.reminder_offsets_json)),
      reminder_subject: row.reminder_subject || DEFAULTS.reminder_subject,
      reminder_body_html: row.reminder_body_html || '',
      reminder_body_text: row.reminder_body_text || '',
      feedback_enabled: Boolean(row.feedback_enabled),
      feedback_delay_minutes: (Number(row.feedback_delay_value) || 1) * (row.feedback_delay_unit === 'days' ? 1440 : row.feedback_delay_unit === 'hours' ? 60 : 1),
      feedback_subject: row.feedback_subject || DEFAULTS.feedback_subject,
      feedback_body_html: row.feedback_body_html || '',
      feedback_body_text: row.feedback_body_text || '',
      default_cc_bcc_by_kind: defaultCcBccByKindFromRow(row),
      default_cc_email: row.default_cc_email != null ? String(row.default_cc_email) : '',
      default_bcc_email: row.default_bcc_email != null ? String(row.default_bcc_email) : '',
    });
  }
  return map;
}

async function listSchedulableMeetings() {
  return query(
    `SELECT
       m.id, m.tenant_id, m.email_account_id, m.title, m.description, m.location, m.attendee_email,
       m.start_at, m.end_at, m.meeting_status, m.meeting_platform, m.meeting_link,
       m.meeting_timezone,
       m.send_reminder,
       m.assigned_user_id, m.meeting_owner_user_id, m.created_by,
       c.display_name AS contact_name,
       t.name AS tenant_company_name,
       COALESCE(owner_tz_u.datetime_timezone, 'Asia/Kolkata') AS owner_datetime_timezone
     FROM tenant_meetings m
     INNER JOIN tenants t ON t.id = m.tenant_id AND t.is_deleted = 0
     LEFT JOIN contacts c ON c.id = m.contact_id AND c.tenant_id = m.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN users owner_tz_u
       ON owner_tz_u.id = COALESCE(m.meeting_owner_user_id, m.assigned_user_id, m.created_by)
       AND owner_tz_u.tenant_id = m.tenant_id
     WHERE m.deleted_at IS NULL
       AND m.attendee_email IS NOT NULL
       AND TRIM(m.attendee_email) <> ''
       AND m.meeting_status IN ('scheduled', 'rescheduled', 'completed')
       AND m.end_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND m.start_at <= DATE_ADD(NOW(), INTERVAL 45 DAY)`
  );
}

function ownerIdFromMeeting(m) {
  return Number(m.meeting_owner_user_id || m.assigned_user_id || m.created_by || 0) || null;
}

async function markReminderAttempt(tenantId, meetingId, ownerUserId, offsetMinutes) {
  const res = await query(
    `INSERT IGNORE INTO tenant_meeting_reminder_events
      (tenant_id, meeting_id, owner_user_id, offset_minutes, delivery_status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [tenantId, meetingId, ownerUserId, offsetMinutes]
  );
  return Number(res?.affectedRows || 0) > 0;
}

async function getReminderEventRow(tenantId, meetingId, ownerUserId, offsetMinutes) {
  const [row] = await query(
    `SELECT id, delivery_status FROM tenant_meeting_reminder_events
     WHERE tenant_id = ? AND meeting_id = ? AND owner_user_id = ? AND offset_minutes = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, meetingId, ownerUserId, offsetMinutes]
  );
  return row || null;
}

async function updateReminderStatus(id, status, errMsg = null) {
  if (!Number.isFinite(Number(id)) || Number(id) < 1) return;
  await query(
    `UPDATE tenant_meeting_reminder_events
     SET delivery_status = ?, sent_at = CASE WHEN ? = 'sent' THEN NOW() ELSE sent_at END, last_error = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, status, errMsg ? String(errMsg).slice(0, 2000) : null, id]
  );
}

async function sendReminderEmail(meeting, setting) {
  const vars = meetingVars(meeting, '');
  const subject = applyTemplateVars(setting.reminder_subject, vars);
  const bodyText = applyTemplateVars(setting.reminder_body_text, vars);
  const bodyHtml = applyTemplateVars(
    setting.reminder_body_html,
    Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]))
  );
  const { cc, bcc } = ccBccFromSettingForKind(setting, 'reminder');
  await sendEmailService.sendEmail(
    Number(meeting.tenant_id),
    {
      email_account_id: Number(meeting.email_account_id),
      to: String(meeting.attendee_email).trim(),
      cc,
      bcc,
      subject,
      body_text: bodyText || undefined,
      body_html: bodyHtml || undefined,
    },
    null
  );
}

function computeFeedbackLink(token) {
  const base = String(env.apiBaseUrl || '').replace(/\/+$/, '');
  return `${base}/api/public/meetings/feedback/${token}`;
}

async function sendFeedbackEmail(meeting, setting, token) {
  const feedbackLink = computeFeedbackLink(token);
  const vars = meetingVars(meeting, feedbackLink);
  const subject = applyTemplateVars(setting.feedback_subject, vars);
  const bodyText = applyTemplateVars(setting.feedback_body_text, vars);
  const bodyHtml = applyTemplateVars(
    setting.feedback_body_html,
    Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]))
  );
  const { cc, bcc } = ccBccFromSettingForKind(setting, 'feedback');
  await sendEmailService.sendEmail(
    Number(meeting.tenant_id),
    {
      email_account_id: Number(meeting.email_account_id),
      to: String(meeting.attendee_email).trim(),
      cc,
      bcc,
      subject,
      body_text: bodyText || undefined,
      body_html: bodyHtml || undefined,
    },
    null
  );
}

function feedbackDueAt(meetingEnd, delayMinutes) {
  return meetingEnd.getTime() + delayMinutes * 60_000;
}

async function ensureFeedbackRequest(tenantId, meetingId, requesterUserId, attendeeEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT IGNORE INTO tenant_meeting_feedback_requests
      (tenant_id, meeting_id, requester_user_id, recipient_email, feedback_token, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [tenantId, meetingId, requesterUserId, attendeeEmail, token]
  );
  const [row] = await query(
    `SELECT * FROM tenant_meeting_feedback_requests
     WHERE tenant_id = ? AND meeting_id = ? AND requester_user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, meetingId, requesterUserId]
  );
  return row || null;
}

export async function processMeetingReminderAndFeedbackTick() {
  const meetings = await listSchedulableMeetings();
  if (!Array.isArray(meetings) || !meetings.length) return { reminders: 0, feedback: 0 };
  const settingsCache = new Map();
  const nowMs = Date.now();
  let reminderSent = 0;
  let feedbackSent = 0;

  for (const m of meetings) {
    const ownerId = ownerIdFromMeeting(m);
    if (!ownerId) continue;
    const settingKey = `${m.tenant_id}:${ownerId}`;
    let setting = settingsCache.get(settingKey);
    if (!setting) {
      const map = await getSettingsForUsers(Number(m.tenant_id), [ownerId]);
      setting = map.get(ownerId) || null;
      if (setting) settingsCache.set(settingKey, setting);
    }
    if (!setting) continue;
    const start = parseDt(m.start_at);
    const end = parseDt(m.end_at);
    if (!start || !end) continue;

    const meetingWantsReminder = Number(m.send_reminder) !== 0;
    if (setting.reminder_enabled && meetingWantsReminder && m.meeting_status !== 'cancelled') {
      for (const offsetMinutes of setting.reminder_offsets_minutes || []) {
        const dueMs = start.getTime() - offsetMinutes * 60_000;
        if (nowMs < dueMs) continue;
        if (nowMs >= start.getTime()) continue;
        // Long lead times (e.g. 1 day): only fire within 30m after ideal send time so we don't blast late.
        // Short lead times (≤2h): any tick from due time until meeting start (covers 5m/15m + missed ticks).
        if (offsetMinutes > 120 && nowMs - dueMs > 30 * 60_000) continue;

        const created = await markReminderAttempt(Number(m.tenant_id), Number(m.id), ownerId, offsetMinutes);
        const eventRow = await getReminderEventRow(Number(m.tenant_id), Number(m.id), ownerId, offsetMinutes);
        if (!eventRow) continue;
        if (!created && eventRow.delivery_status === 'sent') continue;
        try {
          await sendReminderEmail(m, setting);
          await updateReminderStatus(Number(eventRow.id), 'sent');
          reminderSent++;
        } catch (e) {
          await updateReminderStatus(Number(eventRow.id), 'failed', e?.message || 'send_failed');
        }
      }
    }

    if (setting.feedback_enabled && m.meeting_status !== 'cancelled') {
      const dueMs = feedbackDueAt(end, setting.feedback_delay_minutes || 120);
      if (nowMs < dueMs || nowMs - dueMs > 60 * 60_000) continue;
      const req = await ensureFeedbackRequest(Number(m.tenant_id), Number(m.id), ownerId, String(m.attendee_email || '').trim());
      if (!req || req.status === 'sent' || req.status === 'submitted') continue;
      try {
        await sendFeedbackEmail(m, setting, req.feedback_token);
        await query(
          `UPDATE tenant_meeting_feedback_requests
           SET status = 'sent', sent_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [req.id]
        );
        feedbackSent++;
      } catch (e) {
        await query(
          `UPDATE tenant_meeting_feedback_requests
           SET status = 'failed', last_error = ?, updated_at = NOW()
           WHERE id = ?`,
          [String(e?.message || 'send_failed').slice(0, 2000), req.id]
        );
      }
    }
  }
  return { reminders: reminderSent, feedback: feedbackSent };
}

export async function getFeedbackRequestByToken(token) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(t)) return null;
  const [row] = await query(
    `SELECT
       fr.*,
       m.title, m.start_at, m.end_at, m.meeting_link, m.meeting_platform, m.location,
       COALESCE(c.display_name, fr.recipient_email) AS contact_name
     FROM tenant_meeting_feedback_requests fr
     INNER JOIN tenant_meetings m ON m.id = fr.meeting_id AND m.tenant_id = fr.tenant_id AND m.deleted_at IS NULL
     LEFT JOIN contacts c ON c.id = m.contact_id AND c.tenant_id = m.tenant_id AND c.deleted_at IS NULL
     WHERE fr.feedback_token = ? AND fr.deleted_at IS NULL
     LIMIT 1`,
    [t]
  );
  return row || null;
}

export async function submitFeedbackByToken(token, payload) {
  const row = await getFeedbackRequestByToken(token);
  if (!row) {
    const err = new Error('Feedback request not found');
    err.status = 404;
    throw err;
  }
  if (row.submitted_at) return { already_submitted: true };
  const rating = Number(payload?.rating);
  const text = String(payload?.feedback_text || payload?.feedback || '').trim();
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE tenant_meeting_feedback_requests
     SET status = 'submitted',
         submitted_at = NOW(),
         rating = ?,
         feedback_text = ?,
         updated_at = NOW()
     WHERE id = ? AND submitted_at IS NULL`,
    [Math.floor(rating), text || null, row.id]
  );

  const recipientSet = new Set(await listUserIdsByRoles(row.tenant_id, ['admin', 'manager']));
  if (Number(row.requester_user_id)) recipientSet.add(Number(row.requester_user_id));
  const recipients = [...recipientSet];
  await createAndDispatchNotification(row.tenant_id, null, {
    moduleKey: 'meetings',
    eventType: 'meeting_feedback_received',
    severity: rating <= 2 ? 'high' : 'normal',
    title: `Meeting feedback received: ${row.title || 'Meeting'}`,
    body: `Rating ${Math.floor(rating)}/5${text ? ` - ${text.slice(0, 120)}` : ''}`,
    recipientUserIds: recipients,
    entityType: 'meeting',
    entityId: row.meeting_id,
    ctaPath: '/notifications',
    metadata: {
      meeting_id: row.meeting_id,
      feedback_request_id: row.id,
      rating: Math.floor(rating),
      feedback_text: text,
      recipient_email: row.recipient_email,
    },
    eventHash: `meeting:feedback:${row.tenant_id}:${row.id}:${Math.floor(rating)}`,
  });

  return { ok: true, meeting_title: row.title || 'Meeting' };
}

/**
 * Reset reminder or feedback copy to product defaults (same as new-user defaults).
 */
export async function resetAutomationSectionForUser(tenantId, userId, actingUserId, section) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  const sec = String(section || '').trim().toLowerCase();
  if (!Number.isFinite(tid) || !Number.isFinite(uid)) {
    const err = new Error('Invalid tenant/user');
    err.status = 400;
    throw err;
  }
  if (!['reminder', 'feedback'].includes(sec)) {
    const err = new Error('Invalid section');
    err.status = 400;
    throw err;
  }
  await getOrCreateForUser(tenantId, uid);
  if (sec === 'reminder') {
    await query(
      `UPDATE tenant_user_meeting_email_settings
       SET reminder_subject = ?,
           reminder_body_html = ?,
           reminder_body_text = ?,
           updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [
        DEFAULTS.reminder_subject,
        DEFAULTS.reminder_body_html || null,
        DEFAULTS.reminder_body_text || null,
        actingUserId ?? uid,
        tid,
        uid,
      ]
    );
  } else {
    await query(
      `UPDATE tenant_user_meeting_email_settings
       SET feedback_subject = ?,
           feedback_body_html = ?,
           feedback_body_text = ?,
           updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [
        DEFAULTS.feedback_subject,
        DEFAULTS.feedback_body_html || null,
        DEFAULTS.feedback_body_text || null,
        actingUserId ?? uid,
        tid,
        uid,
      ]
    );
  }
  return getOrCreateForUser(tenantId, uid);
}

export async function sendTestEmailForUser(tenantId, userId, type, toEmail, emailAccountId = null) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (!['reminder', 'feedback'].includes(normalizedType)) {
    const err = new Error('Invalid test email type');
    err.status = 400;
    throw err;
  }
  const recipient = String(toEmail || '').trim();
  if (!recipient) {
    const err = new Error('Recipient email is required');
    err.status = 400;
    throw err;
  }

  const setting = await getOrCreateForUser(tenantId, userId);
  const tid = Number(tenantId);
  const preferred =
    emailAccountId != null && emailAccountId !== ''
      ? Number(emailAccountId)
      : NaN;
  let account = null;
  if (Number.isFinite(preferred) && preferred > 0) {
    const [row] = await query(
      `SELECT id
       FROM email_accounts
       WHERE tenant_id = ? AND id = ? AND is_deleted = 0 AND (status = 'active' OR status IS NULL)
       LIMIT 1`,
      [tid, preferred]
    );
    account = row || null;
  }
  if (!account?.id) {
    const [row] = await query(
      `SELECT id
       FROM email_accounts
       WHERE tenant_id = ? AND is_deleted = 0 AND (status = 'active' OR status IS NULL)
       ORDER BY id ASC
       LIMIT 1`,
      [tid]
    );
    account = row || null;
  }
  if (!account?.id) {
    const err = new Error('No active email account found for test email');
    err.status = 400;
    throw err;
  }

  const sampleMeeting = {
    title: 'SEO Proposal Discussion',
    attendee_email: recipient,
    start_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
    end_at: new Date(Date.now() + 25 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
    meeting_timezone: 'Asia/Kolkata',
    owner_datetime_timezone: 'Asia/Kolkata',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    meeting_platform: 'google_meet',
    location: 'Google Meet',
    description: 'Sample test meeting for template verification.',
    tenant_company_name: 'Your Company',
    contact_name: 'Client',
  };
  const vars = meetingVars(
    sampleMeeting,
    normalizedType === 'feedback' ? 'https://example.com/feedback/test-link' : ''
  );
  const toHtmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]));
  const subject =
    normalizedType === 'reminder'
      ? applyTemplateVars(setting.reminder_subject, vars)
      : applyTemplateVars(setting.feedback_subject, vars);
  const bodyText =
    normalizedType === 'reminder'
      ? applyTemplateVars(setting.reminder_body_text || '', vars)
      : applyTemplateVars(setting.feedback_body_text || '', vars);
  const bodyHtml =
    normalizedType === 'reminder'
      ? applyTemplateVars(setting.reminder_body_html || '', toHtmlVars)
      : applyTemplateVars(setting.feedback_body_html || '', toHtmlVars);
  const { cc, bcc } = ccBccFromSettingForKind(setting, normalizedType);

  await sendEmailService.sendEmail(
    Number(tenantId),
    {
      email_account_id: Number(account.id),
      to: recipient,
      cc,
      bcc,
      subject,
      body_text: bodyText || undefined,
      body_html: bodyHtml || undefined,
    },
    Number(userId)
  );
  return { ok: true };
}
