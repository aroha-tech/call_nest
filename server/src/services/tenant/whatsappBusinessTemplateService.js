import { query } from '../../config/db.js';

export async function findAll(tenantId, includeInactive = false, accountId = null) {
  let sql = `
    SELECT t.*, wa.phone_number AS account_phone, wa.provider AS account_provider
    FROM whatsapp_business_templates t
    LEFT JOIN whatsapp_accounts wa ON wa.id = t.whatsapp_account_id AND wa.tenant_id = t.tenant_id
    WHERE t.tenant_id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
  `;
  const params = [tenantId];
  if (!includeInactive) {
    sql += ' AND t.status = ?';
    params.push('active');
  }
  if (accountId) {
    sql += ' AND t.whatsapp_account_id = ?';
    params.push(accountId);
  }
  sql += ' ORDER BY t.template_name ASC';
  return query(sql, params);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT t.*, wa.phone_number AS account_phone
     FROM whatsapp_business_templates t
     LEFT JOIN whatsapp_accounts wa ON wa.id = t.whatsapp_account_id AND wa.tenant_id = t.tenant_id
     WHERE t.id = ? AND t.tenant_id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)`,
    [id, tenantId]
  );
  return row || null;
}

export async function getComponents(templateId) {
  return query(
    'SELECT * FROM whatsapp_template_components WHERE template_id = ? ORDER BY component_order, id',
    [templateId]
  );
}

export async function getTemplateWithComponents(tenantId, id) {
  const template = await findById(tenantId, id);
  if (!template) return null;
  const components = await getComponents(id);
  return { ...template, components };
}

export async function create(tenantId, data, createdBy) {
  const {
    whatsapp_account_id = null,
    template_name,
    provider_template_id = null,
    category = null,
    language = 'en',
    status = 'active',
    template_mode = 'automatic',
    cooldown_days = null,
    cooldown_hours = null,
    components = [],
  } = data;

  if (!template_name) {
    const err = new Error('template_name is required');
    err.status = 400;
    throw err;
  }

  const [existing] = await query(
    `SELECT 1 FROM whatsapp_business_templates
     WHERE tenant_id = ? AND (whatsapp_account_id <=> ?) AND BINARY template_name = ? AND (language <=> ?)
     LIMIT 1`,
    [tenantId, whatsapp_account_id || null, template_name.trim(), language || 'en']
  );
  if (existing) {
    const err = new Error('A template with this name and language already exists for this account.');
    err.status = 400;
    err.code = 'DUPLICATE_TEMPLATE_NAME';
    throw err;
  }

  const insertResult = await query(
    `INSERT INTO whatsapp_business_templates
     (tenant_id, whatsapp_account_id, template_name, provider_template_id, category, language, status, template_mode, cooldown_days, cooldown_hours, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      whatsapp_account_id,
      template_name,
      provider_template_id,
      category,
      language,
      status,
      template_mode === 'manual' ? 'manual' : 'automatic',
      cooldown_days ?? null,
      cooldown_hours ?? null,
      createdBy,
      createdBy,
    ]
  );
  const templateId = insertResult.insertId;

  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    await query(
      `INSERT INTO whatsapp_template_components (template_id, component_type, component_text, component_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [templateId, c.component_type, c.component_text || null, c.component_order ?? i + 1, createdBy, createdBy]
    );
  }

  return getTemplateWithComponents(tenantId, templateId);
}

export async function update(tenantId, id, data, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }

  const { components, ...templateData } = data;
  const newName = templateData.template_name?.trim();
  const newLang = templateData.language !== undefined ? templateData.language : template.language;
  const newAccountId = templateData.whatsapp_account_id !== undefined ? templateData.whatsapp_account_id : template.whatsapp_account_id;
  if (newName) {
    const [existing] = await query(
      `SELECT 1 FROM whatsapp_business_templates
       WHERE tenant_id = ? AND id != ? AND (whatsapp_account_id <=> ?) AND BINARY template_name = ? AND (COALESCE(language, 'en') = COALESCE(?, 'en'))
       LIMIT 1`,
      [tenantId, id, newAccountId ?? null, newName, newLang || 'en']
    );
    if (existing) {
      const err = new Error('A template with this name and language already exists for this account.');
      err.status = 400;
      err.code = 'DUPLICATE_TEMPLATE_NAME';
      throw err;
    }
  }

  const allowed = [
    'whatsapp_account_id',
    'template_name',
    'provider_template_id',
    'category',
    'language',
    'status',
    'template_mode',
    'cooldown_days',
    'cooldown_hours',
  ];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (templateData[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(templateData[key]);
    }
  }
  if (updates.length > 0) {
    updates.push('updated_by = ?');
    params.push(updatedBy, id, tenantId);
    await query(`UPDATE whatsapp_business_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  }

  if (Array.isArray(components)) {
    await query('DELETE FROM whatsapp_template_components WHERE template_id = ?', [id]);
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      await query(
        `INSERT INTO whatsapp_template_components (template_id, component_type, component_text, component_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, c.component_type, c.component_text || null, c.component_order ?? i + 1, updatedBy, updatedBy]
      );
    }
  }

  return getTemplateWithComponents(tenantId, id);
}

export async function remove(tenantId, id) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }

  // Prevent delete when assigned to any disposition.
  // 1) disposition_actions_map (normalized table)
  const [mapRow] = await query(
    'SELECT 1 FROM disposition_actions_map WHERE tenant_id = ? AND whatsapp_template_id = ? LIMIT 1',
    [tenantId, String(id)]
  );
  if (mapRow) {
    const err = new Error(
      'Cannot delete WhatsApp template: it is assigned to one or more dispositions. Remove it from those dispositions first.'
    );
    err.status = 400;
    err.code = 'WHATSAPP_TEMPLATE_IN_USE';
    throw err;
  }

  // 2) dispositions.actions JSON (used by Dispositions page when saving)
  const idStr = String(id);
  const idNum = Number(id);
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
        (String(a.whatsapp_template_id) === idStr || Number(a.whatsapp_template_id) === idNum)
    );
    if (used) {
      const err = new Error(
        'Cannot delete WhatsApp template: it is assigned to one or more dispositions. Remove it from those dispositions first.'
      );
      err.status = 400;
      err.code = 'WHATSAPP_TEMPLATE_IN_USE';
      throw err;
    }
  }

  // Soft delete only (never hard delete)
  await query(
    'UPDATE whatsapp_business_templates SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  return { success: true };
}

export async function activate(tenantId, id, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE whatsapp_business_templates SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['active', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}

export async function deactivate(tenantId, id, updatedBy) {
  const template = await findById(tenantId, id);
  if (!template) {
    const err = new Error('WhatsApp template not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE whatsapp_business_templates SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['inactive', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}
