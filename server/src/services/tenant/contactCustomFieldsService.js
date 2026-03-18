import { query } from '../../config/db.js';
import { getContactById } from './contactsService.js';

export async function listCustomFields(tenantId, { includeInactive = false, page = 1, limit = 20 } = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;

  const where = ['tenant_id = ?'];
  const params = [tenantId];
  if (!includeInactive) {
    where.push('is_active = 1');
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM contact_custom_fields
     ${whereSql}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = await query(
    `SELECT
        id AS field_id,
        name,
        label,
        type,
        options_json,
        is_required,
        is_active,
        created_at,
        updated_at
     FROM contact_custom_fields
     ${whereSql}
     ORDER BY id DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  const data = rows.map((f) => ({
    ...f,
    id: f.field_id,
    options_json: f.options_json ?? null,
  }));

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function listActiveCustomFields(tenantId) {
  // For runtime use (contacts create/edit)
  const rows = await query(
    `SELECT
        id AS field_id,
        name,
        label,
        type,
        options_json,
        is_required,
        is_active
     FROM contact_custom_fields
     WHERE tenant_id = ?
       AND is_active = 1
     ORDER BY id`,
    [tenantId]
  );

  return rows.map((f) => ({
    ...f,
    options_json: f.options_json ?? null,
  }));
}

export async function listContactCustomFieldValues(tenantId, contactId, user) {
  // Ensure user is allowed to access the contact (ownership rules)
  const contact = await getContactById(contactId, tenantId, user);
  if (!contact) return [];

  const rows = await query(
    `SELECT
        f.id AS field_id,
        f.name,
        f.label,
        f.type,
        f.options_json,
        v.value_text
     FROM contact_custom_fields f
     LEFT JOIN contact_custom_field_values v
       ON v.field_id = f.id
      AND v.contact_id = ?
      AND v.tenant_id = ?
     WHERE f.tenant_id = ?
       AND f.is_active = 1
     ORDER BY f.id`,
    [contactId, tenantId, tenantId]
  );

  return rows.map((r) => ({
    ...r,
    options_json: r.options_json ?? null,
  }));
}

export async function createCustomField(tenantId, payload) {
  const { name, label, type, options_json, is_required = 0 } = payload;

  const result = await query(
    `INSERT INTO contact_custom_fields
       (tenant_id, name, label, type, options_json, is_required, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      tenantId,
      name.trim(),
      label.trim(),
      type,
      options_json ? JSON.stringify(options_json) : null,
      is_required ? 1 : 0,
    ]
  );

  const [row] = await query(
    `SELECT id AS field_id, name, label, type, options_json, is_required, is_active, created_at, updated_at
     FROM contact_custom_fields
     WHERE id = ? AND tenant_id = ?`,
    [result.insertId, tenantId]
  );

  return row
    ? { ...row, id: row.field_id, options_json: row.options_json ?? null }
    : null;
}

export async function updateCustomField(tenantId, id, payload) {
  const [existing] = await query(
    `SELECT id, tenant_id FROM contact_custom_fields WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (!existing) return null;

  const { name, label, type, options_json, is_required } = payload;

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name.trim());
  }
  if (label !== undefined) {
    updates.push('label = ?');
    params.push(label.trim());
  }
  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (options_json !== undefined) {
    updates.push('options_json = ?');
    params.push(options_json ? JSON.stringify(options_json) : null);
  }
  if (is_required !== undefined) {
    updates.push('is_required = ?');
    params.push(is_required ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(id, tenantId);
    await query(
      `UPDATE contact_custom_fields
       SET ${updates.join(', ')}
       WHERE id = ? AND tenant_id = ?`,
      params
    );
  }

  const [row] = await query(
    `SELECT id AS field_id, name, label, type, options_json, is_required, is_active, created_at, updated_at
     FROM contact_custom_fields
     WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );

  return row
    ? { ...row, id: row.field_id, options_json: row.options_json ?? null }
    : null;
}

export async function setCustomFieldActive(tenantId, id, isActive) {
  await query(
    `UPDATE contact_custom_fields
     SET is_active = ?
     WHERE id = ? AND tenant_id = ?`,
    [isActive ? 1 : 0, id, tenantId]
  );

  const [row] = await query(
    `SELECT id AS field_id, name, label, type, options_json, is_required, is_active, created_at, updated_at
     FROM contact_custom_fields
     WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );

  return row
    ? { ...row, id: row.field_id, options_json: row.options_json ?? null }
    : null;
}

export async function deleteCustomField(tenantId, id) {
  await query(
    `DELETE FROM contact_custom_field_values
     WHERE tenant_id = ? AND field_id = ?`,
    [tenantId, id]
  );
  await query(
    `DELETE FROM contact_custom_fields
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, id]
  );
}

