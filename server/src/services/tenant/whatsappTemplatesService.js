import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT * FROM whatsapp_templates
    WHERE tenant_id = ? AND is_deleted = 0
  `;
  const params = [tenantId];
  
  if (!includeInactive) {
    sql += ' AND is_active = 1';
  }
  
  sql += ' ORDER BY name ASC';
  
  return query(sql, params);
}

export async function findAllActive(tenantId) {
  return query(
    'SELECT id, name, code FROM whatsapp_templates WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1 ORDER BY name ASC',
    [tenantId]
  );
}

export async function findById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM whatsapp_templates WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
    [id, tenantId]
  );
  return row || null;
}

export async function findByCode(tenantId, code) {
  const [row] = await query(
    'SELECT * FROM whatsapp_templates WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
    [tenantId, code]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const id = generateUUID();
  const {
    name,
    code,
    message_body,
    is_active = 1
  } = data;
  
  const existing = await findByCode(tenantId, code);
  if (existing) {
    const err = new Error('WhatsApp template code already exists for this tenant');
    err.status = 409;
    throw err;
  }
  
  await query(
    `INSERT INTO whatsapp_templates 
     (id, tenant_id, name, code, message_body, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, code, message_body, is_active, createdBy, createdBy]
  );
  
  return findById(tenantId, id);
}

export async function update(tenantId, id, data, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }
  
  const { name, code, message_body, is_active } = data;
  
  if (code && code !== template.code) {
    const existing = await findByCode(tenantId, code);
    if (existing && existing.id !== id) {
      const err = new Error('WhatsApp template code already exists for this tenant');
      err.status = 409;
      throw err;
    }
  }
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (code !== undefined) { updates.push('code = ?'); params.push(code); }
  if (message_body !== undefined) { updates.push('message_body = ?'); params.push(message_body); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);
  
  await query(`UPDATE whatsapp_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }

  // Prevent deleting templates that are used in disposition actions
  const [usageRow] = await query(
    'SELECT COUNT(*) AS cnt FROM disposition_actions_map WHERE tenant_id = ? AND whatsapp_template_id = ?',
    [tenantId, id]
  );
  if (usageRow?.cnt > 0) {
    const err = new Error(
      'Cannot delete WhatsApp template: it is assigned to one or more dispositions. Remove it from those dispositions first.'
    );
    err.status = 400;
    err.code = 'WHATSAPP_TEMPLATE_IN_USE';
    throw err;
  }

  await query(
    'UPDATE whatsapp_templates SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}
