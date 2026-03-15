import { query } from '../../config/db.js';

export async function findAll(tenantId, filters = {}) {
  const {
    contact_id,
    email_account_id,
    direction,
    status,
    folder = 'inbox', // 'inbox' | 'sent'
    search,
    limit = 50,
    offset = 0,
  } = filters;

  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  let sql = `
    SELECT m.*, ea.email_address AS account_email, ea.display_name AS account_display_name,
           et.name AS template_name
    FROM email_messages m
    LEFT JOIN email_accounts ea ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id
    LEFT JOIN email_module_templates et ON et.id = m.template_id AND et.tenant_id = m.tenant_id
    WHERE m.tenant_id = ?
  `;
  const params = [tenantId];

  if (folder === 'sent') {
    sql += ' AND m.direction = ?';
    params.push('outbound');
  } else if (folder === 'inbox') {
    sql += ' AND m.direction = ?';
    params.push('inbound');
  }

  if (contact_id != null && contact_id !== '') {
    sql += ' AND m.contact_id = ?';
    params.push(contact_id);
  }
  if (email_account_id != null && email_account_id !== '') {
    sql += ' AND m.email_account_id = ?';
    params.push(email_account_id);
  }
  if (direction != null && direction !== '') {
    sql += ' AND m.direction = ?';
    params.push(direction);
  }
  if (status != null && status !== '') {
    sql += ' AND m.status = ?';
    params.push(status);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql +=
      ' AND (m.from_email LIKE ? OR m.to_email LIKE ? OR m.subject LIKE ? OR m.body_text LIKE ?)';
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY m.sent_at DESC, m.received_at DESC, m.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
  return query(sql, params);
}

export async function countAll(tenantId, filters = {}) {
  const { contact_id, email_account_id, direction, status, folder, search } = filters;

  let sql = 'SELECT COUNT(*) AS total FROM email_messages m WHERE m.tenant_id = ?';
  const params = [tenantId];

  if (folder === 'sent') {
    sql += ' AND m.direction = ?';
    params.push('outbound');
  } else if (folder === 'inbox') {
    sql += ' AND m.direction = ?';
    params.push('inbound');
  }
  if (contact_id != null && contact_id !== '') {
    sql += ' AND m.contact_id = ?';
    params.push(contact_id);
  }
  if (email_account_id != null && email_account_id !== '') {
    sql += ' AND m.email_account_id = ?';
    params.push(email_account_id);
  }
  if (direction != null && direction !== '') {
    sql += ' AND m.direction = ?';
    params.push(direction);
  }
  if (status != null && status !== '') {
    sql += ' AND m.status = ?';
    params.push(status);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql +=
      ' AND (m.from_email LIKE ? OR m.to_email LIKE ? OR m.subject LIKE ? OR m.body_text LIKE ?)';
    params.push(term, term, term, term);
  }

  const [row] = await query(sql, params);
  return row?.total ?? 0;
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT m.*, ea.email_address AS account_email, ea.display_name AS account_display_name,
            et.name AS template_name, et.subject AS template_subject
     FROM email_messages m
     LEFT JOIN email_accounts ea ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id
     LEFT JOIN email_module_templates et ON et.id = m.template_id AND et.tenant_id = m.tenant_id
     WHERE m.id = ? AND m.tenant_id = ?`,
    [id, tenantId]
  );
  return row || null;
}

export async function findByThreadId(tenantId, threadId) {
  return query(
    `SELECT m.*, ea.email_address AS account_email, et.name AS template_name
     FROM email_messages m
     LEFT JOIN email_accounts ea ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id
     LEFT JOIN email_module_templates et ON et.id = m.template_id AND et.tenant_id = m.tenant_id
     WHERE m.tenant_id = ? AND m.thread_id = ?
     ORDER BY m.sent_at ASC, m.received_at ASC, m.created_at ASC`,
    [tenantId, threadId]
  );
}

export async function create(tenantId, data, createdBy) {
  const {
    email_account_id = null,
    contact_id = null,
    thread_id = null,
    message_id_header = null,
    direction = 'outbound',
    status = 'sent',
    from_email,
    to_email,
    cc_email = null,
    bcc_email = null,
    subject = null,
    body_html = null,
    body_text = null,
    template_id = null,
    sent_at = null,
    received_at = null,
  } = data;

  if (!from_email?.trim() || !to_email?.trim()) {
    const err = new Error('from_email and to_email are required');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO email_messages
     (tenant_id, email_account_id, contact_id, thread_id, message_id_header, direction, status,
      from_email, to_email, cc_email, bcc_email, subject, body_html, body_text, template_id,
      sent_at, received_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      email_account_id,
      contact_id,
      thread_id,
      message_id_header,
      direction,
      status,
      from_email.trim(),
      to_email.trim(),
      cc_email?.trim() || null,
      bcc_email?.trim() || null,
      subject?.trim() || null,
      body_html || null,
      body_text || null,
      template_id,
      sent_at || (direction === 'outbound' ? new Date() : null),
      received_at || (direction === 'inbound' ? new Date() : null),
      createdBy,
    ]
  );
  return findById(tenantId, result.insertId);
}

export async function getAttachments(tenantId, emailMessageId) {
  return query(
    'SELECT id, file_name, content_type, file_size, storage_path FROM email_attachments WHERE email_message_id = ? AND tenant_id = ?',
    [emailMessageId, tenantId]
  );
}
