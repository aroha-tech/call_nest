import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT * FROM email_templates
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
    'SELECT id, name, code FROM email_templates WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1 ORDER BY name ASC',
    [tenantId]
  );
}

export async function findById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM email_templates WHERE id = ? AND tenant_id = ? AND is_deleted = 0',
    [id, tenantId]
  );
  return row || null;
}

export async function findByCode(tenantId, code) {
  const [row] = await query(
    'SELECT * FROM email_templates WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
    [tenantId, code]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const id = generateUUID();
  const {
    name,
    code,
    subject,
    body_html,
    body_text = null,
    is_active = 1
  } = data;
  
  const existing = await findByCode(tenantId, code);
  if (existing) {
    const err = new Error('Email template code already exists for this tenant');
    err.status = 409;
    throw err;
  }
  
  await query(
    `INSERT INTO email_templates 
     (id, tenant_id, name, code, subject, body_html, body_text, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, code, subject, body_html, body_text, is_active, createdBy, createdBy]
  );
  
  return findById(tenantId, id);
}

export async function update(tenantId, id, data, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }
  
  const { name, code, subject, body_html, body_text, is_active } = data;
  
  if (code && code !== template.code) {
    const existing = await findByCode(tenantId, code);
    if (existing && existing.id !== id) {
      const err = new Error('Email template code already exists for this tenant');
      err.status = 409;
      throw err;
    }
  }
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (code !== undefined) { updates.push('code = ?'); params.push(code); }
  if (subject !== undefined) { updates.push('subject = ?'); params.push(subject); }
  if (body_html !== undefined) { updates.push('body_html = ?'); params.push(body_html); }
  if (body_text !== undefined) { updates.push('body_text = ?'); params.push(body_text); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);
  
  await query(`UPDATE email_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }
  
  await query(
    'UPDATE email_templates SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}
