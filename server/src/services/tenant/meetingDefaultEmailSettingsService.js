import crypto from 'crypto';
import { query } from '../../config/db.js';
import { env } from '../../config/env.js';
import * as sendEmailService from '../email/sendEmailService.js';
import { createAndDispatchNotification, listUserIdsByRoles } from './notificationService.js';

const DEFAULT_REMINDER_OFFSETS = [
  { value: 1, unit: 'days' },
  { value: 1, unit: 'hours' },
  { value: 15, unit: 'minutes' },
];

const ALLOWED_UNITS = new Set(['minutes', 'hours', 'days']);

const DEFAULTS = {
  reminder_enabled: true,
  reminder_offsets: DEFAULT_REMINDER_OFFSETS,
  reminder_subject: 'Reminder: {{title}} on {{meeting_date}} at {{meeting_time}}',
  reminder_body_html:
    '<p>Hi,</p><p>This is a friendly reminder for your upcoming meeting.</p><p><strong>Title:</strong> {{title}}<br/><strong>Date:</strong> {{meeting_date}}<br/><strong>Time:</strong> {{meeting_time}}<br/><strong>Join Link:</strong> <a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer">{{meeting_link}}</a></p><p>Thanks,<br/>{{company_name}}</p>',
  reminder_body_text:
    'This is a friendly reminder for your upcoming meeting.\n\nTitle: {{title}}\nDate: {{meeting_date}}\nTime: {{meeting_time}}\nJoin Link: {{meeting_link}}\n\nThanks,\n{{company_name}}',
  feedback_enabled: true,
  feedback_delay_value: 2,
  feedback_delay_unit: 'hours',
  feedback_subject: 'How was your meeting with us?',
  feedback_body_html:
    '<p>Hi,</p><p>We hope your meeting went well. Please share your feedback.</p><p><a href="{{feedback_link}}" target="_blank" rel="noopener noreferrer">Share your feedback</a></p><p>Thanks,<br/>{{company_name}}</p>',
  feedback_body_text:
    'We hope your meeting went well. Please share your feedback:\n{{feedback_link}}\n\nThanks,\n{{company_name}}',
  thank_you_page_url: '',
  include_meeting_details: true,
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

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

function parseDt(raw) {
  const d = new Date(String(raw || '').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function meetingVars(meeting, feedbackLink = '', includeMeetingDetails = true) {
  const start = parseDt(meeting.start_at);
  const end = parseDt(meeting.end_at);
  return {
    title: meeting.title || 'Meeting',
    attendee_email: meeting.attendee_email || '',
    meeting_date: includeMeetingDetails && start ? fmtDate(start) : '',
    meeting_time: includeMeetingDetails && start ? fmtTime(start) : '',
    meeting_end_time: includeMeetingDetails && end ? fmtTime(end) : '',
    meeting_link: includeMeetingDetails ? meeting.meeting_link || '' : '',
    meeting_platform: includeMeetingDetails ? meeting.meeting_platform || '' : '',
    location: includeMeetingDetails ? meeting.location || '' : '',
    description: includeMeetingDetails ? meeting.description || '' : '',
    company_name: meeting.tenant_company_name || 'Your Company',
    contact_name: meeting.contact_name || '',
    feedback_link: feedbackLink,
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
        DEFAULTS.include_meeting_details ? 1 : 0,
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
    include_meeting_details: Boolean(row.include_meeting_details),
  };
}

export async function updateForUser(tenantId, userId, actingUserId, payload) {
  const current = await getOrCreateForUser(tenantId, userId);
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
    include_meeting_details: asBool(payload?.include_meeting_details, current.include_meeting_details),
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
         include_meeting_details = ?,
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
      next.include_meeting_details ? 1 : 0,
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
      include_meeting_details: Boolean(row.include_meeting_details),
    });
  }
  return map;
}

async function listSchedulableMeetings() {
  return query(
    `SELECT
       m.id, m.tenant_id, m.email_account_id, m.title, m.description, m.location, m.attendee_email,
       m.start_at, m.end_at, m.meeting_status, m.meeting_platform, m.meeting_link,
       m.assigned_user_id, m.meeting_owner_user_id, m.created_by,
       c.display_name AS contact_name,
       t.name AS tenant_company_name
     FROM tenant_meetings m
     INNER JOIN tenants t ON t.id = m.tenant_id AND t.is_deleted = 0
     LEFT JOIN contacts c ON c.id = m.contact_id AND c.tenant_id = m.tenant_id AND c.deleted_at IS NULL
     WHERE m.deleted_at IS NULL
       AND m.attendee_email IS NOT NULL
       AND TRIM(m.attendee_email) <> ''
       AND m.meeting_status IN ('scheduled', 'rescheduled', 'completed')
       AND m.end_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND m.start_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)`
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
  const vars = meetingVars(meeting, '', Boolean(setting.include_meeting_details));
  const subject = applyTemplateVars(setting.reminder_subject, vars);
  const bodyText = applyTemplateVars(setting.reminder_body_text, vars);
  const bodyHtml = applyTemplateVars(setting.reminder_body_html, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)])));
  await sendEmailService.sendEmail(
    Number(meeting.tenant_id),
    {
      email_account_id: Number(meeting.email_account_id),
      to: String(meeting.attendee_email).trim(),
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
  const vars = meetingVars(meeting, feedbackLink, Boolean(setting.include_meeting_details));
  const subject = applyTemplateVars(setting.feedback_subject, vars);
  const bodyText = applyTemplateVars(setting.feedback_body_text, vars);
  const bodyHtml = applyTemplateVars(setting.feedback_body_html, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)])));
  await sendEmailService.sendEmail(
    Number(meeting.tenant_id),
    {
      email_account_id: Number(meeting.email_account_id),
      to: String(meeting.attendee_email).trim(),
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

    if (setting.reminder_enabled && m.meeting_status !== 'cancelled') {
      for (const offsetMinutes of setting.reminder_offsets_minutes || []) {
        const dueMs = start.getTime() - offsetMinutes * 60_000;
        if (nowMs < dueMs || nowMs - dueMs > 5 * 60_000) continue;
        const created = await markReminderAttempt(Number(m.tenant_id), Number(m.id), ownerId, offsetMinutes);
        if (!created) continue;
        const [eventRow] = await query(
          `SELECT id FROM tenant_meeting_reminder_events
           WHERE tenant_id = ? AND meeting_id = ? AND owner_user_id = ? AND offset_minutes = ? LIMIT 1`,
          [m.tenant_id, m.id, ownerId, offsetMinutes]
        );
        try {
          await sendReminderEmail(m, setting);
          await updateReminderStatus(Number(eventRow?.id), 'sent');
          reminderSent++;
        } catch (e) {
          await updateReminderStatus(Number(eventRow?.id), 'failed', e?.message || 'send_failed');
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

export async function sendTestEmailForUser(tenantId, userId, type, toEmail) {
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
  const [account] = await query(
    `SELECT id
     FROM email_accounts
     WHERE tenant_id = ? AND is_deleted = 0 AND (status = 'active' OR status IS NULL)
     ORDER BY id ASC
     LIMIT 1`,
    [Number(tenantId)]
  );
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
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    meeting_platform: 'google_meet',
    location: 'Google Meet',
    description: 'Sample test meeting for template verification.',
    tenant_company_name: 'Your Company',
    contact_name: 'Client',
  };
  const vars = meetingVars(
    sampleMeeting,
    normalizedType === 'feedback' ? 'https://example.com/feedback/test-link' : '',
    Boolean(setting.include_meeting_details)
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

  await sendEmailService.sendEmail(
    Number(tenantId),
    {
      email_account_id: Number(account.id),
      to: recipient,
      subject,
      body_text: bodyText || undefined,
      body_html: bodyHtml || undefined,
    },
    Number(userId)
  );
  return { ok: true };
}
