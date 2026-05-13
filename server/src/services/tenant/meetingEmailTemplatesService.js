import { query } from '../../config/db.js';
import {
  DEFAULT_MEETING_INVITATION_EMAIL_HTML,
  DEFAULT_MEETING_INVITATION_EMAIL_TEXT,
  DEFAULT_MEETING_UPDATED_EMAIL_HTML,
  DEFAULT_MEETING_UPDATED_EMAIL_TEXT,
  DEFAULT_MEETING_CANCELLED_EMAIL_HTML,
  DEFAULT_MEETING_CANCELLED_EMAIL_TEXT,
} from '../../utils/defaultMeetingEmailBodiesHtml.js';

export const TEMPLATE_KINDS = ['created', 'updated', 'cancelled'];

const DEFAULT_SUBJECT = {
  created: 'Meeting: {{title}}',
  updated: 'Updated: {{title}}',
  cancelled: 'Cancelled: {{title}}',
};

const DEFAULT_BODY_HTML = {
  created: DEFAULT_MEETING_INVITATION_EMAIL_HTML,
  updated: DEFAULT_MEETING_UPDATED_EMAIL_HTML,
  cancelled: DEFAULT_MEETING_CANCELLED_EMAIL_HTML,
};

const DEFAULT_BODY_TEXT = {
  created: DEFAULT_MEETING_INVITATION_EMAIL_TEXT,
  updated: DEFAULT_MEETING_UPDATED_EMAIL_TEXT,
  cancelled: DEFAULT_MEETING_CANCELLED_EMAIL_TEXT,
};

/** Shown in API + UI — use <code>{{name}}</code> in docs */
export const MEETING_TEMPLATE_PLACEHOLDERS = [
  'title',
  'start_at',
  'end_at',
  'location',
  'description',
  'meeting_status',
  'meeting_platform',
  'meeting_platform_label',
  'meeting_link',
  'meeting_duration_min',
  'meeting_owner_name',
  'attendee_email',
  'account_label',
  'account_email',
  'meeting_card_date',
  'meeting_card_time',
  'calendar_google_url',
  'calendar_outlook_url',
];

export function getBuiltinDefaults(kind) {
  if (!TEMPLATE_KINDS.includes(kind)) return null;
  return {
    template_kind: kind,
    subject: DEFAULT_SUBJECT[kind],
    body_html: DEFAULT_BODY_HTML[kind],
    body_text: DEFAULT_BODY_TEXT[kind],
  };
}

async function insertDefault(tenantId, kind, userId) {
  const d = getBuiltinDefaults(kind);
  await query(
    `INSERT INTO tenant_meeting_email_templates
      (tenant_id, template_kind, subject, body_html, body_text, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      kind,
      d.subject,
      d.body_html,
      d.body_text,
      userId ?? null,
      userId ?? null,
    ]
  );
}

/**
 * Ensure three rows exist for tenant (lazy seed with built-in copy).
 */
export async function ensureDefaults(tenantId, userId) {
  const rows = await query(
    `SELECT template_kind FROM tenant_meeting_email_templates
     WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tenantId]
  );
  const have = new Set((rows || []).map((r) => r.template_kind));
  for (const kind of TEMPLATE_KINDS) {
    if (!have.has(kind)) {
      await insertDefault(tenantId, kind, userId);
    }
  }
}

export async function list(tenantId, userId) {
  await ensureDefaults(tenantId, userId);
  const rows = await query(
    `SELECT id, tenant_id, template_kind, subject, body_html, body_text, created_at, updated_at
     FROM tenant_meeting_email_templates
     WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY FIELD(template_kind, 'created', 'updated', 'cancelled')`,
    [tenantId]
  );
  return rows || [];
}

export async function updateBatch(tenantId, userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('templates array is required');
    err.status = 400;
    throw err;
  }
  await ensureDefaults(tenantId, userId);

  for (const item of items) {
    const kind = item.template_kind;
    if (!TEMPLATE_KINDS.includes(kind)) {
      const err = new Error(`Invalid template_kind: ${kind}`);
      err.status = 400;
      throw err;
    }
    const subject = item.subject != null ? String(item.subject).trim() : '';
    if (!subject) {
      const err = new Error(`subject is required for ${kind}`);
      err.status = 400;
      throw err;
    }
    const body_html = item.body_html != null ? String(item.body_html) : '';
    const body_text = item.body_text != null ? String(item.body_text) : '';
    if (!body_html.trim() && !body_text.trim()) {
      const err = new Error(`Provide body_html and/or body_text for ${kind}`);
      err.status = 400;
      throw err;
    }

    await query(
      `UPDATE tenant_meeting_email_templates
       SET subject = ?, body_html = ?, body_text = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND template_kind = ? AND deleted_at IS NULL`,
      [
        subject,
        body_html.trim() ? body_html : null,
        body_text.trim() ? body_text : null,
        userId ?? null,
        tenantId,
        kind,
      ]
    );
  }
}

export async function findByKind(tenantId, userId, kind) {
  await ensureDefaults(tenantId, userId);
  const [row] = await query(
    `SELECT template_kind, subject, body_html, body_text
     FROM tenant_meeting_email_templates
     WHERE tenant_id = ? AND template_kind = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, kind]
  );
  return row || null;
}

export async function resetOne(tenantId, userId, kind) {
  const k = String(kind || '').trim();
  if (!TEMPLATE_KINDS.includes(k)) {
    const err = new Error('Invalid template_kind');
    err.status = 400;
    throw err;
  }
  await ensureDefaults(tenantId, userId);
  const d = getBuiltinDefaults(k);
  await query(
    `UPDATE tenant_meeting_email_templates
     SET subject = ?, body_html = ?, body_text = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND template_kind = ? AND deleted_at IS NULL`,
    [d.subject, d.body_html, d.body_text, userId ?? null, tenantId, k]
  );
  return findByKind(tenantId, userId, k);
}
