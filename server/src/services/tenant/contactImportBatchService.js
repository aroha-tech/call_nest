import { query } from '../../config/db.js';

/**
 * @param {object} params
 * @param {Array<{ row: number, error: string }>} [params.errorSample]
 */
export async function insertContactImportBatch(
  tenantId,
  createdByUserId,
  {
    contactType = 'lead',
    originalFilename = null,
    mode = 'skip',
    defaultCountryCode = '+91',
    rowCount = 0,
    created = 0,
    updated = 0,
    skipped = 0,
    failed = 0,
    errorSample = null,
  } = {}
) {
  const errJson =
    errorSample && Array.isArray(errorSample) && errorSample.length > 0
      ? JSON.stringify(errorSample.slice(0, 50))
      : null;

  await query(
    `INSERT INTO contact_import_batches (
       tenant_id, created_by_user_id, contact_type, original_filename, mode, default_country_code,
       row_count, created_count, updated_count, skipped_count, failed_count, error_sample_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      createdByUserId || null,
      contactType,
      originalFilename ? String(originalFilename).slice(0, 512) : null,
      mode,
      defaultCountryCode || '+91',
      rowCount,
      created,
      updated,
      skipped,
      failed,
      errJson,
    ]
  );
}

export async function listContactImportBatches(tenantId, { page = 1, limit = 20, contactType } = {}) {
  const pageNum = Math.max(1, Math.floor(Number.parseInt(String(page), 10)) || 1);
  const limitNum = Math.min(Math.max(1, Math.floor(Number.parseInt(String(limit), 10)) || 20), 100);
  const offset = Math.max(0, (pageNum - 1) * limitNum);

  const where = ['b.tenant_id = ?'];
  const params = [tenantId];
  if (contactType && String(contactType).trim()) {
    where.push('b.contact_type = ?');
    params.push(String(contactType).trim());
  }

  const whereSql = where.join(' AND ');

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM contact_import_batches b WHERE ${whereSql}`,
    params
  );
  const total = countRow?.total ?? 0;

  // LIMIT/OFFSET as literals: mysql2 prepared statements often reject ? placeholders here (ER_WRONG_ARGUMENTS).
  const rows = await query(
    `SELECT
        b.id,
        b.tenant_id,
        b.created_by_user_id,
        u.name AS created_by_name,
        b.contact_type,
        b.original_filename,
        b.mode,
        b.default_country_code,
        b.row_count,
        b.created_count,
        b.updated_count,
        b.skipped_count,
        b.failed_count,
        b.error_sample_json,
        b.created_at
     FROM contact_import_batches b
     LEFT JOIN users u ON u.id = b.created_by_user_id AND u.tenant_id = b.tenant_id
     WHERE ${whereSql}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    data: rows,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  };
}
