import { query } from '../../config/db.js';

const LIST_COLUMNS = 'id, tenant_id, provider, account_type, account_name, phone_number, external_account_id, status, created_at, updated_at';

function isDeletedColumnError(err) {
  return err?.code === 'ER_BAD_FIELD_ERROR' && err?.sqlMessage?.includes('is_deleted');
}

export async function findAll(tenantId, includeInactive = false) {
  const deletedClause = ' AND (is_deleted = 0 OR is_deleted IS NULL)';
  let sql = `SELECT ${LIST_COLUMNS} FROM whatsapp_accounts WHERE tenant_id = ?${deletedClause}`;
  const params = [tenantId];
  if (!includeInactive) {
    sql += ' AND status = ?';
    params.push('active');
  }
  sql += ' ORDER BY created_at DESC';
  try {
    return await query(sql, params);
  } catch (err) {
    if (!isDeletedColumnError(err)) throw err;
    sql = `SELECT ${LIST_COLUMNS} FROM whatsapp_accounts WHERE tenant_id = ?`;
    const fallbackParams = [tenantId];
    if (!includeInactive) {
      sql += ' AND status = ?';
      fallbackParams.push('active');
    }
    sql += ' ORDER BY created_at DESC';
    return query(sql, fallbackParams);
  }
}

export async function findById(tenantId, id) {
  try {
    const [row] = await query(
      'SELECT * FROM whatsapp_accounts WHERE id = ? AND tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
      [id, tenantId]
    );
    return row || null;
  } catch (err) {
    if (!isDeletedColumnError(err)) throw err;
    const [row] = await query('SELECT * FROM whatsapp_accounts WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return row || null;
  }
}

export async function findActiveById(tenantId, id) {
  try {
    const [row] = await query(
      'SELECT * FROM whatsapp_accounts WHERE id = ? AND tenant_id = ? AND status = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
      [id, tenantId, 'active']
    );
    return row || null;
  } catch (err) {
    if (!isDeletedColumnError(err)) throw err;
    const [row] = await query(
      'SELECT * FROM whatsapp_accounts WHERE id = ? AND tenant_id = ? AND status = ?',
      [id, tenantId, 'active']
    );
    return row || null;
  }
}

export async function create(tenantId, data, createdBy) {
  const {
    provider = 'meta',
    account_type = 'provider',
    account_name = null,
    phone_number,
    external_account_id = null,
    api_key = null,
    api_secret = null,
    webhook_url = null,
    status = 'active',
  } = data;

  if (!phone_number?.trim()) {
    const err = new Error('phone_number is required');
    err.status = 400;
    throw err;
  }

  const isNonProvider = account_type === 'non_provider';
  const normalizedProvider = isNonProvider ? null : provider;
  const normalizedExternalId = isNonProvider ? null : external_account_id;
  const normalizedApiKey = isNonProvider ? null : api_key;
  const normalizedApiSecret = isNonProvider ? null : api_secret;
  const normalizedWebhookUrl = isNonProvider ? null : webhook_url;

  const result = await query(
    `INSERT INTO whatsapp_accounts
     (tenant_id, provider, account_type, account_name, phone_number, external_account_id, api_key, api_secret, webhook_url, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      normalizedProvider,
      isNonProvider ? 'non_provider' : 'provider',
      account_name,
      phone_number.trim(),
      normalizedExternalId,
      normalizedApiKey,
      normalizedApiSecret,
      normalizedWebhookUrl,
      status,
      createdBy,
      createdBy,
    ]
  );
  return findById(tenantId, result.insertId);
}

export async function update(tenantId, id, data, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('WhatsApp account not found');
    err.status = 404;
    throw err;
  }
  const nextAccountType =
    data.account_type !== undefined ? data.account_type : account.account_type || 'provider';
  const isNonProvider = nextAccountType === 'non_provider';

  const updates = [];
  const params = [];
  const allowed = [
    'account_name',
    'phone_number',
    'external_account_id',
    'api_key',
    'api_secret',
    'webhook_url',
    'status',
    'provider',
    'account_type',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(data[key]);
    }
  }
  // Enforce non_provider semantics: clear provider credentials/IDs
  if (isNonProvider) {
    if (!updates.includes('account_type = ?')) {
      updates.push('account_type = ?');
      params.push('non_provider');
    }
    updates.push('provider = ?');
    params.push(null);
    updates.push('external_account_id = ?');
    params.push(null);
    updates.push('api_key = ?');
    params.push(null);
    updates.push('api_secret = ?');
    params.push(null);
    updates.push('webhook_url = ?');
    params.push(null);
  }

  if (updates.length === 0) return account;
  updates.push('updated_by = ?');
  params.push(updatedBy, id, tenantId);

  await query(
    `UPDATE whatsapp_accounts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('WhatsApp account not found');
    err.status = 404;
    throw err;
  }

  let templateRow;
  try {
    [templateRow] = await query(
      'SELECT 1 FROM whatsapp_business_templates WHERE whatsapp_account_id = ? AND tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1',
      [id, tenantId]
    );
  } catch (err) {
    if (!isDeletedColumnError(err)) throw err;
    [templateRow] = await query(
      'SELECT 1 FROM whatsapp_business_templates WHERE whatsapp_account_id = ? AND tenant_id = ? LIMIT 1',
      [id, tenantId]
    );
  }
  if (templateRow) {
    const err = new Error(
      'Cannot delete account: it is assigned to one or more WhatsApp templates. Remove or reassign those templates first.'
    );
    err.status = 400;
    err.code = 'ACCOUNT_HAS_TEMPLATES';
    throw err;
  }

  try {
    await query(
      'UPDATE whatsapp_accounts SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
  } catch (err) {
    if (!isDeletedColumnError(err)) throw err;
    await query('DELETE FROM whatsapp_accounts WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  }
  return { success: true };
}

export async function activate(tenantId, id, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('WhatsApp account not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE whatsapp_accounts SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['active', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}

export async function deactivate(tenantId, id, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('WhatsApp account not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE whatsapp_accounts SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['inactive', updatedBy, id, tenantId]
  );
  return findById(tenantId, id);
}
