import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';
import {
  getCreatedByUserIdsForScope,
  isOutboundRecordVisibleByCreatedBy,
} from './userMessageScopeService.js';

export { getCreatedByUserIdsForScope };

/**
 * Single-row access: agents see own sends; managers see team + self; admins see all.
 */
export async function isMessageVisibleToUser(tenantId, message, user) {
  if (user?.role === 'admin') return true;
  if (!message) return false;
  return isOutboundRecordVisibleByCreatedBy(tenantId, user, message.created_by);
}

function applyCreatedByScope(sql, params, createdByUserIds) {
  if (createdByUserIds === undefined || createdByUserIds === null) {
    return;
  }
  if (!Array.isArray(createdByUserIds) || createdByUserIds.length === 0) {
    sql.ref += ' AND 1=0';
    return;
  }
  const placeholders = createdByUserIds.map(() => '?').join(',');
  sql.ref += ` AND m.created_by IN (${placeholders})`;
  params.push(...createdByUserIds);
}

export async function findAll(tenantId, filters = {}) {
  const {
    contact_id,
    status,
    search,
    whatsapp_account_id,
    template_id,
    limit = 50,
    offset = 0,
    createdByUserIds,
  } = filters;
  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  let sql = {
    ref: `
    SELECT m.*, t.template_name, wa.phone_number AS account_phone,
           u.name AS sender_name, u.email AS sender_email
    FROM whatsapp_messages m
    LEFT JOIN whatsapp_business_templates t ON t.id = m.template_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = m.whatsapp_account_id
    LEFT JOIN users u ON u.id = m.created_by AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
    WHERE m.tenant_id = ?
  `,
  };
  const params = [tenantId];
  applyCreatedByScope(sql, params, createdByUserIds);
  if (contact_id != null && contact_id !== '') {
    sql.ref += ' AND m.contact_id = ?';
    params.push(contact_id);
  }
  if (status != null && status !== '') {
    sql.ref += ' AND m.status = ?';
    params.push(status);
  }
  if (whatsapp_account_id != null && whatsapp_account_id !== '') {
    sql.ref += ' AND m.whatsapp_account_id = ?';
    params.push(whatsapp_account_id);
  }
  if (template_id != null && template_id !== '') {
    sql.ref += ' AND m.template_id = ?';
    params.push(template_id);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql.ref += ' AND (m.phone LIKE ? OR m.message_text LIKE ? OR m.provider_message_id LIKE ?)';
    params.push(term, term, term);
  }
  sql.ref += ` ORDER BY m.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
  return query(sql.ref, params);
}

export async function countAll(tenantId, filters = {}) {
  const {
    contact_id,
    status,
    search,
    whatsapp_account_id,
    template_id,
    createdByUserIds,
  } = filters;
  let sql = { ref: 'SELECT COUNT(*) AS total FROM whatsapp_messages m WHERE m.tenant_id = ?' };
  const params = [tenantId];
  applyCreatedByScope(sql, params, createdByUserIds);
  if (contact_id != null && contact_id !== '') {
    sql.ref += ' AND m.contact_id = ?';
    params.push(contact_id);
  }
  if (status != null && status !== '') {
    sql.ref += ' AND m.status = ?';
    params.push(status);
  }
  if (whatsapp_account_id != null && whatsapp_account_id !== '') {
    sql.ref += ' AND m.whatsapp_account_id = ?';
    params.push(whatsapp_account_id);
  }
  if (template_id != null && template_id !== '') {
    sql.ref += ' AND m.template_id = ?';
    params.push(template_id);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql.ref += ' AND (m.phone LIKE ? OR m.message_text LIKE ? OR m.provider_message_id LIKE ?)';
    params.push(term, term, term);
  }
  const [row] = await query(sql.ref, params);
  return row?.total ?? 0;
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT m.*, t.template_name, t.language AS template_language, wa.phone_number AS account_phone,
            u.name AS sender_name, u.email AS sender_email
     FROM whatsapp_messages m
     LEFT JOIN whatsapp_business_templates t ON t.id = m.template_id
     LEFT JOIN whatsapp_accounts wa ON wa.id = m.whatsapp_account_id
     LEFT JOIN users u ON u.id = m.created_by AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
     WHERE m.id = ? AND m.tenant_id = ?`,
    [id, tenantId]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const {
    whatsapp_account_id = null,
    provider = null,
    contact_id = null,
    phone,
    template_id = null,
    message_text = null,
    provider_message_id = null,
    status = 'pending',
    send_mode = 'automatic',
  } = data;

  if (!phone && !contact_id) {
    const err = new Error('phone or contact_id is required');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO whatsapp_messages
     (tenant_id, provider, whatsapp_account_id, contact_id, phone, template_id, message_text, provider_message_id, status, send_mode, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      provider || null,
      whatsapp_account_id,
      contact_id,
      phone || null,
      template_id,
      message_text,
      provider_message_id,
      status,
      send_mode === 'manual' ? 'manual' : 'automatic',
      createdBy,
      createdBy,
    ]
  );
  return findById(tenantId, result.insertId);
}

export async function updateStatus(tenantId, id, status, timestamps = {}) {
  const msg = await findById(tenantId, id);
  if (!msg) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }
  const prevStatus = String(msg.status || '');
  const updates = ['status = ?'];
  const params = [status];
  if (timestamps.sent_at !== undefined) {
    updates.push('sent_at = ?');
    params.push(timestamps.sent_at);
  }
  if (timestamps.delivered_at !== undefined) {
    updates.push('delivered_at = ?');
    params.push(timestamps.delivered_at);
  }
  if (timestamps.read_at !== undefined) {
    updates.push('read_at = ?');
    params.push(timestamps.read_at);
  }
  if (timestamps.provider_message_id !== undefined) {
    updates.push('provider_message_id = ?');
    params.push(timestamps.provider_message_id);
  }
  params.push(id, tenantId);
  await query(`UPDATE whatsapp_messages SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  const out = await findById(tenantId, id);
  const incoming = String(status || '');
  const nowSentFamily = ['sent', 'delivered', 'read'].includes(incoming);
  const wasSentFamily = ['sent', 'delivered', 'read'].includes(prevStatus);
  if (nowSentFamily && !wasSentFamily && msg.created_by) {
    const preview = msg.message_text ? String(msg.message_text).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    await safeLogTenantActivity(tenantId, msg.created_by, {
      event_category: 'message',
      event_type: 'whatsapp.sent',
      summary: preview ? `WhatsApp sent · ${preview}` : 'WhatsApp sent',
      entity_type: 'whatsapp_message',
      entity_id: Number(id),
      contact_id: msg.contact_id != null ? Number(msg.contact_id) : null,
      payload_json: { status: incoming },
    });
  }
  return out;
}

/** Find and update status by provider_message_id (for webhooks). */
export async function updateStatusByProviderMessageId(tenantId, providerMessageId, status, timestamps = {}) {
  if (!providerMessageId || !status) return null;
  const [row] = await query(
    'SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND provider_message_id = ? LIMIT 1',
    [tenantId, String(providerMessageId)]
  );
  if (!row) return null;
  await updateStatus(tenantId, row.id, status, timestamps);
  return findById(tenantId, row.id);
}
