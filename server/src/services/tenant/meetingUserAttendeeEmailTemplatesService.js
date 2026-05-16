import { query } from '../../config/db.js';
import * as tenantTemplates from './meetingEmailTemplatesService.js';

export const USER_TEMPLATE_KINDS = ['created', 'updated', 'cancelled'];

function isLegacyAttendeeTemplate(row) {
  const bodyHtml = String(row?.body_html || '');
  const bodyText = String(row?.body_text || '');
  const combined = `${bodyHtml}\n${bodyText}`.toLowerCase();
  if (!bodyHtml.trim()) return true;
  return (
    combined.includes('you have been invited to the following meeting') ||
    combined.includes('duration (minutes)') ||
    combined.includes('<li><strong>start') ||
    combined.includes('meeting link:')
  );
}

async function repairLegacyUserTemplate(tenantId, userId, actingUserId, kind) {
  const d = tenantTemplates.getBuiltinDefaults(kind);
  if (!d) return null;
  await query(
    `UPDATE tenant_user_meeting_attendee_email_templates
     SET subject = ?,
         body_html = ?,
         body_text = NULL,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND user_id = ? AND template_kind = ? AND deleted_at IS NULL`,
    [d.subject, d.body_html || null, actingUserId ?? userId, Number(tenantId), Number(userId), kind]
  );
  return {
    template_kind: kind,
    subject: d.subject,
    body_html: d.body_html,
    body_text: null,
  };
}

async function ensureUserDefaults(tenantId, userId, actingUserId) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  if (!Number.isFinite(tid) || !Number.isFinite(uid)) return;
  const rows = await query(
    `SELECT template_kind
     FROM tenant_user_meeting_attendee_email_templates
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [tid, uid]
  );
  const have = new Set((rows || []).map((r) => r.template_kind));
  for (const kind of USER_TEMPLATE_KINDS) {
    if (have.has(kind)) continue;
    const d = tenantTemplates.getBuiltinDefaults(kind);
    await query(
      `INSERT INTO tenant_user_meeting_attendee_email_templates
        (tenant_id, user_id, template_kind, subject, body_html, body_text, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tid, uid, kind, d.subject, d.body_html, null, actingUserId ?? uid, actingUserId ?? uid]
    );
  }
}

export async function resetOneForUser(tenantId, userId, actingUserId, kind) {
  const k = String(kind || '').trim();
  if (!USER_TEMPLATE_KINDS.includes(k)) {
    const err = new Error('Invalid template_kind');
    err.status = 400;
    throw err;
  }
  await ensureUserDefaults(tenantId, userId, actingUserId);
  const d = tenantTemplates.getBuiltinDefaults(k);
  if (!d) {
    const err = new Error('Invalid template_kind');
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE tenant_user_meeting_attendee_email_templates
     SET subject = ?, body_html = ?, body_text = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND user_id = ? AND template_kind = ? AND deleted_at IS NULL`,
    [d.subject, d.body_html || null, null, actingUserId ?? userId, Number(tenantId), Number(userId), k]
  );
  return listForUser(tenantId, userId);
}

export async function listForUser(tenantId, userId) {
  await ensureUserDefaults(tenantId, userId, userId);
  let rows = await query(
    `SELECT template_kind, subject, body_html, body_text, updated_at
     FROM tenant_user_meeting_attendee_email_templates
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
     ORDER BY FIELD(template_kind, 'created', 'updated', 'cancelled')`,
    [Number(tenantId), Number(userId)]
  );
  let repaired = false;
  for (const row of rows || []) {
    if (!USER_TEMPLATE_KINDS.includes(row.template_kind) || !isLegacyAttendeeTemplate(row)) continue;
    await repairLegacyUserTemplate(tenantId, userId, userId, row.template_kind);
    repaired = true;
  }
  if (repaired) {
    rows = await query(
      `SELECT template_kind, subject, body_html, body_text, updated_at
       FROM tenant_user_meeting_attendee_email_templates
       WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
       ORDER BY FIELD(template_kind, 'created', 'updated', 'cancelled')`,
      [Number(tenantId), Number(userId)]
    );
  }
  return rows || [];
}

export async function updateBatchForUser(tenantId, userId, actingUserId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('templates array is required');
    err.status = 400;
    throw err;
  }
  await ensureUserDefaults(tenantId, userId, actingUserId);
  for (const item of items) {
    const kind = String(item?.template_kind || '').trim();
    if (!USER_TEMPLATE_KINDS.includes(kind)) {
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
      `UPDATE tenant_user_meeting_attendee_email_templates
       SET subject = ?, body_html = ?, body_text = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND user_id = ? AND template_kind = ? AND deleted_at IS NULL`,
      [
        subject,
        body_html.trim() ? body_html : null,
        body_html.trim() ? null : body_text.trim() ? body_text : null,
        actingUserId ?? userId,
        Number(tenantId),
        Number(userId),
        kind,
      ]
    );
  }
  return listForUser(tenantId, userId);
}

export async function findTemplateForUserOrTenant(tenantId, ownerUserId, kind) {
  const tid = Number(tenantId);
  const uid = Number(ownerUserId);
  const k = String(kind || '').trim();
  if (!USER_TEMPLATE_KINDS.includes(k)) return null;

  if (Number.isFinite(uid) && uid > 0) {
    await ensureUserDefaults(tid, uid, uid);
    const [row] = await query(
      `SELECT template_kind, subject, body_html, body_text
       FROM tenant_user_meeting_attendee_email_templates
       WHERE tenant_id = ? AND user_id = ? AND template_kind = ? AND deleted_at IS NULL
       LIMIT 1`,
      [tid, uid, k]
    );
    if (row && isLegacyAttendeeTemplate(row)) {
      return repairLegacyUserTemplate(tid, uid, uid, k);
    }
    if (row) return row;
  }

  // Fallback to tenant-level defaults (existing feature)
  const tenantRow = await tenantTemplates.findByKind(tid, uid || null, k);
  if (tenantRow && isLegacyAttendeeTemplate(tenantRow)) {
    const d = tenantTemplates.getBuiltinDefaults(k);
    return {
      template_kind: k,
      subject: d.subject,
      body_html: d.body_html,
      body_text: null,
    };
  }
  return tenantRow;
}
