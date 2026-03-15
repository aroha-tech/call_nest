import { query } from '../../config/db.js';

export async function create(tenantId, data) {
  const {
    whatsapp_account_id = null,
    direction = 'outbound',
    endpoint,
    method,
    request_body = null,
    response_status = null,
    response_body = null,
    error_message = null,
  } = data;

  const result = await query(
    `INSERT INTO whatsapp_api_logs
     (tenant_id, whatsapp_account_id, direction, endpoint, method, request_body, response_status, response_body, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      whatsapp_account_id,
      direction,
      endpoint || null,
      method || null,
      request_body ? JSON.stringify(request_body) : null,
      response_status,
      response_body ? JSON.stringify(response_body) : null,
      error_message,
    ]
  );
  return result?.insertId ?? null;
}

export async function findAll(tenantId, filters = {}) {
  const { whatsapp_account_id, search, limit = 50, offset = 0 } = filters;
  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  let sql = `
    SELECT l.*, wa.phone_number AS account_phone
    FROM whatsapp_api_logs l
    LEFT JOIN whatsapp_accounts wa ON wa.id = l.whatsapp_account_id
    WHERE l.tenant_id = ?
  `;
  const params = [tenantId];
  if (whatsapp_account_id != null && whatsapp_account_id !== '') {
    sql += ' AND l.whatsapp_account_id = ?';
    params.push(whatsapp_account_id);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql += ' AND (l.endpoint LIKE ? OR l.error_message LIKE ? OR l.request_body LIKE ? OR l.response_body LIKE ?)';
    params.push(term, term, term, term);
  }
  sql += ` ORDER BY l.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
  const rows = await query(sql, params);
  return rows.map((row) => ({
    ...row,
    request_body: row.request_body ? (typeof row.request_body === 'string' ? JSON.parse(row.request_body) : row.request_body) : null,
    response_body: row.response_body ? (typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body) : null,
  }));
}

export async function countAll(tenantId, filters = {}) {
  const { whatsapp_account_id, search } = filters;
  let sql = 'SELECT COUNT(*) AS total FROM whatsapp_api_logs l WHERE l.tenant_id = ?';
  const params = [tenantId];
  if (whatsapp_account_id != null && whatsapp_account_id !== '') {
    sql += ' AND l.whatsapp_account_id = ?';
    params.push(whatsapp_account_id);
  }
  if (search && String(search).trim() !== '') {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql += ' AND (l.endpoint LIKE ? OR l.error_message LIKE ? OR l.request_body LIKE ? OR l.response_body LIKE ?)';
    params.push(term, term, term, term);
  }
  const [row] = await query(sql, params);
  return row?.total ?? 0;
}

export async function findById(tenantId, id) {
  const [row] = await query(
    'SELECT * FROM whatsapp_api_logs WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!row) return null;
  return {
    ...row,
    request_body: row.request_body ? (typeof row.request_body === 'string' ? JSON.parse(row.request_body) : row.request_body) : null,
    response_body: row.response_body ? (typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body) : null,
  };
}
