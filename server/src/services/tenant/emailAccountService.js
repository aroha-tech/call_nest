import { query } from '../../config/db.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

const LIST_COLUMNS =
  'id, tenant_id, provider, account_name, email_address, display_name, status, token_expires_at, created_at, updated_at';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT ${LIST_COLUMNS}
    FROM email_accounts
    WHERE tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const params = [tenantId];
  if (!includeInactive) {
    sql += ' AND status = ?';
    params.push('active');
  }
  sql += ' ORDER BY created_at DESC';
  return query(sql, params);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM email_accounts WHERE id = ? AND tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
    [id, tenantId]
  );
  return row || null;
}

export async function findActiveById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM email_accounts WHERE id = ? AND tenant_id = ? AND status = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
    [id, tenantId, 'active']
  );
  return row || null;
}

export async function findByEmail(tenantId, email) {
  if (!email?.trim()) return null;
  const [row] = await query(
    'SELECT * FROM email_accounts WHERE tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND LOWER(TRIM(email_address)) = LOWER(TRIM(?)) LIMIT 1',
    [tenantId, email.trim()]
  );
  return row || null;
}

export async function findAllByProvider(tenantId, provider, includeInactive = false) {
  let sql = `
    SELECT *
    FROM email_accounts
    WHERE tenant_id = ? AND provider = ? AND (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const params = [tenantId, provider];
  if (!includeInactive) {
    sql += ' AND status = ?';
    params.push('active');
  }
  sql += ' ORDER BY created_at DESC';
  return query(sql, params);
}

export async function create(tenantId, data, createdBy) {
  const {
    provider = 'smtp',
    account_name = null,
    email_address,
    display_name = null,
    access_token = null,
    refresh_token = null,
    token_expires_at = null,
    smtp_host = null,
    smtp_port = null,
    smtp_secure = true,
    smtp_user = null,
    smtp_password_encrypted = null,
    status = 'active',
  } = data;

  if (!email_address?.trim()) {
    const err = new Error('email_address is required');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO email_accounts
     (tenant_id, provider, account_name, email_address, display_name, access_token, refresh_token, token_expires_at,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      provider,
      account_name?.trim() || null,
      email_address.trim(),
      display_name?.trim() || null,
      access_token || null,
      refresh_token || null,
      token_expires_at || null,
      smtp_host?.trim() || null,
      smtp_port ?? null,
      smtp_secure ? 1 : 0,
      smtp_user?.trim() || null,
      smtp_password_encrypted || null,
      status,
      createdBy,
      createdBy,
    ]
  );
  const row = await findById(tenantId, result.insertId);
  const label = row?.account_name || row?.email_address || 'Email account';
  await safeLogTenantActivity(tenantId, createdBy, {
    event_category: 'email_account',
    event_type: 'email_account.created',
    summary: `Email account added: ${label}`,
    entity_type: 'email_account',
    entity_id: result.insertId,
  });
  return row;
}

export async function update(tenantId, id, data, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }

  const updates = [];
  const params = [];
  const allowed = [
    'account_name',
    'email_address',
    'display_name',
    'access_token',
    'refresh_token',
    'token_expires_at',
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_user',
    'smtp_password_encrypted',
    'status',
    'provider',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      if (key === 'smtp_secure') {
        updates.push('smtp_secure = ?');
        params.push(data[key] ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
  }

  if (updates.length === 0) return account;
  updates.push('updated_by = ?');
  params.push(updatedBy, id, tenantId);

  await query(
    `UPDATE email_accounts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );
  const row = await findById(tenantId, id);
  const label = row?.account_name || row?.email_address || 'Email account';
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'email_account',
    event_type: 'email_account.updated',
    summary: `Email account updated: ${label}`,
    entity_type: 'email_account',
    entity_id: Number(id),
  });
  return row;
}

export async function remove(tenantId, id, deletedByUserId = null) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }

  // Block delete only when account is assigned to any (non-deleted) email templates
  const [templateRow] = await query(
    'SELECT 1 FROM email_module_templates WHERE email_account_id = ? AND tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1',
    [id, tenantId]
  );
  if (templateRow) {
    const err = new Error(
      'Cannot delete account: it is assigned to one or more email templates. Remove or reassign those templates first.'
    );
    err.status = 400;
    err.code = 'ACCOUNT_HAS_TEMPLATES';
    throw err;
  }

  // Always soft delete (never hard delete)
  await query(
    'UPDATE email_accounts SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  const label = account.account_name || account.email_address || 'Email account';
  await safeLogTenantActivity(tenantId, deletedByUserId, {
    event_category: 'email_account',
    event_type: 'email_account.deleted',
    summary: `Email account removed: ${label}`,
    entity_type: 'email_account',
    entity_id: Number(id),
  });
  return { success: true };
}

export async function activate(tenantId, id, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE email_accounts SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['active', updatedBy, id, tenantId]
  );
  const row = await findById(tenantId, id);
  const label = row?.account_name || row?.email_address || 'Email account';
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'email_account',
    event_type: 'email_account.activated',
    summary: `Email account activated: ${label}`,
    entity_type: 'email_account',
    entity_id: Number(id),
  });
  return row;
}

export async function deactivate(tenantId, id, updatedBy) {
  const account = await findById(tenantId, id);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }
  await query(
    'UPDATE email_accounts SET status = ?, updated_by = ? WHERE id = ? AND tenant_id = ?',
    ['inactive', updatedBy, id, tenantId]
  );
  const row = await findById(tenantId, id);
  const label = row?.account_name || row?.email_address || 'Email account';
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'email_account',
    event_type: 'email_account.deactivated',
    summary: `Email account deactivated: ${label}`,
    entity_type: 'email_account',
    entity_id: Number(id),
  });
  return row;
}
