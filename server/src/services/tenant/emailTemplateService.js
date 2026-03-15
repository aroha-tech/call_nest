import { query } from '../../config/db.js';

export async function findAll(tenantId, includeInactive = false, emailAccountId = null) {
  let sql = `
    SELECT t.*, ea.email_address AS account_email
    FROM email_module_templates t
    LEFT JOIN email_accounts ea
      ON ea.id = t.email_account_id AND ea.tenant_id = t.tenant_id
    WHERE t.tenant_id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
  `;
  const params = [tenantId];
  if (emailAccountId) {
    sql += ' AND t.email_account_id = ?';
    params.push(emailAccountId);
  }
  if (!includeInactive) {
    sql += ' AND t.status = ?';
    params.push('active');
  }
  sql += ' ORDER BY t.name ASC';
  return query(sql, params);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM email_module_templates WHERE id = ? AND tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
    [id, tenantId]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const { email_account_id, name, subject, body_html = null, body_text = null, status = 'active' } = data;

  if (!name?.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (!subject?.trim()) {
    const err = new Error('subject is required');
    err.status = 400;
    throw err;
  }
  if (!email_account_id) {
    const err = new Error('email_account_id is required');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO email_module_templates
     (tenant_id, email_account_id, name, subject, body_html, body_text, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      email_account_id,
      name.trim(),
      subject.trim(),
      body_html || null,
      body_text || null,
      status,
      createdBy,
      createdBy,
    ]
  );
  return findById(tenantId, result.insertId);
}

export async function update(tenantId, id, data, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }

  const updates = [];
  const params = [];
  const allowed = ['email_account_id', 'name', 'subject', 'body_html', 'body_text', 'status'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (updates.length === 0) return template;
  updates.push('updated_by = ?');
  params.push(updatedBy, id, tenantId);

  await query(
    `UPDATE email_module_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }

  // Block only when assigned to a disposition. Used-in-sent-emails does not block; we always soft delete so history is kept.
  const idStr = String(id);
  const idNum = Number(id);

  // 1) disposition_actions_map (if used by that flow)
  const [mapRow] = await query(
    'SELECT 1 FROM disposition_actions_map WHERE tenant_id = ? AND email_template_id = ? LIMIT 1',
    [tenantId, idStr]
  );
  if (mapRow) {
    const err = new Error(
      'Cannot delete template: it is assigned to one or more dispositions. Remove it from those dispositions first.'
    );
    err.status = 400;
    err.code = 'TEMPLATE_IN_USE_DISPOSITION';
    throw err;
  }

  // 2) dispositions.actions JSON (used by Dispositions page)
  const dispositionsWithActions = await query(
    'SELECT id, actions FROM dispositions WHERE tenant_id = ? AND is_deleted = 0 AND actions IS NOT NULL',
    [tenantId]
  );
  for (const row of dispositionsWithActions) {
    let actions;
    try {
      actions = typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions;
    } catch {
      continue;
    }
    if (!Array.isArray(actions)) continue;
    const used = actions.some(
      (a) =>
        a &&
        (String(a.email_template_id) === idStr || Number(a.email_template_id) === idNum)
    );
    if (used) {
      const err = new Error(
        'Cannot delete template: it is assigned to one or more dispositions. Remove it from those dispositions first.'
      );
      err.status = 400;
      err.code = 'TEMPLATE_IN_USE_DISPOSITION';
      throw err;
    }
  }

  // Always soft delete (never hard delete)
  await query(
    'UPDATE email_module_templates SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}

export async function activate(tenantId, id, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE email_module_templates SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['active', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}

export async function deactivate(tenantId, id, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('Email template not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE email_module_templates SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['inactive', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}
