import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

export async function findAll(tenantId, includeInactive = false) {
  let sql = `
    SELECT d.*, 
           dt.name as dispo_type_name,
           cs.name as contact_status_name,
           ct.name as contact_temperature_name,
           dd.name as created_from_name
    FROM dispositions d
    LEFT JOIN dispo_types_master dt ON d.dispo_type_id = dt.id
    LEFT JOIN contact_status_master cs ON d.contact_status_id = cs.id
    LEFT JOIN contact_temperature_master ct ON d.contact_temperature_id = ct.id
    LEFT JOIN default_dispositions dd ON d.created_from_default_id = dd.id
    WHERE d.tenant_id = ? AND d.is_deleted = 0
  `;
  const params = [tenantId];

  if (!includeInactive) {
    sql += ' AND d.is_active = 1';
  }

  sql += ' ORDER BY d.name ASC';

  return query(sql, params);
}

/**
 * Paginated list with search and includeInactive
 */
export async function findAllPaginated(tenantId, { search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  let whereClauses = ['d.tenant_id = ?', 'd.is_deleted = 0'];
  const params = [tenantId];

  if (!includeInactive) {
    whereClauses.push('d.is_active = 1');
  }

  if (search && search.trim()) {
    whereClauses.push('(d.name LIKE ? OR d.code LIKE ?)');
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const whereSQL = whereClauses.join(' AND ');
  const fromSQL = `
    FROM dispositions d
    LEFT JOIN dispo_types_master dt ON d.dispo_type_id = dt.id
    LEFT JOIN contact_status_master cs ON d.contact_status_id = cs.id
    LEFT JOIN contact_temperature_master ct ON d.contact_temperature_id = ct.id
    LEFT JOIN default_dispositions dd ON d.created_from_default_id = dd.id
    WHERE ${whereSQL}
  `;

  const [countRow] = await query(`SELECT COUNT(*) as total FROM dispositions d WHERE ${whereSQL}`, params);
  const total = countRow.total;

  const data = await query(
    `SELECT d.*, 
            dt.name as dispo_type_name,
            cs.name as contact_status_name,
            ct.name as contact_temperature_name,
            dd.name as created_from_name
     ${fromSQL}
     ORDER BY d.name ASC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

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

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT d.*, 
            dt.name as dispo_type_name,
            cs.name as contact_status_name,
            ct.name as contact_temperature_name,
            dd.name as created_from_name
     FROM dispositions d
     LEFT JOIN dispo_types_master dt ON d.dispo_type_id = dt.id
     LEFT JOIN contact_status_master cs ON d.contact_status_id = cs.id
     LEFT JOIN contact_temperature_master ct ON d.contact_temperature_id = ct.id
     LEFT JOIN default_dispositions dd ON d.created_from_default_id = dd.id
     WHERE d.id = ? AND d.tenant_id = ? AND d.is_deleted = 0`,
    [id, tenantId]
  );
  return row || null;
}

export async function findByCode(tenantId, code) {
  const [row] = await query(
    'SELECT * FROM dispositions WHERE tenant_id = ? AND code = ? AND is_deleted = 0',
    [tenantId, code]
  );
  return row || null;
}

export async function create(tenantId, data, createdBy) {
  const id = generateUUID();
  const {
    dispo_type_id,
    contact_status_id = null,
    contact_temperature_id = null,
    name,
    code,
    next_action = null,
    is_connected = 0,
    actions = null,
    created_from_default_id = null,
    is_active = 1,
  } = data;

  const existing = await findByCode(tenantId, code);
  if (existing) {
    const err = new Error('Disposition code already exists for this tenant');
    err.status = 409;
    throw err;
  }

  const actionsJson = actions ? JSON.stringify(actions) : null;

  await query(
    `INSERT INTO dispositions 
     (id, tenant_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, created_from_default_id, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      dispo_type_id,
      contact_status_id,
      contact_temperature_id,
      name,
      code,
      next_action,
      is_connected ? 1 : 0,
      actionsJson,
      created_from_default_id,
      is_active ?? 1,
      createdBy,
      createdBy,
    ]
  );

  const row = await findById(tenantId, id);
  await safeLogTenantActivity(tenantId, createdBy, {
    event_category: 'disposition',
    event_type: 'disposition.created',
    summary: `Disposition created: ${name} (${code})`,
    entity_type: 'disposition',
    payload_json: { disposition_id: id, code },
  });
  return row;
}

export async function update(tenantId, id, data, updatedBy) {
  const disposition = await findById(tenantId, id);
  if (!disposition) {
    const err = new Error('Disposition not found');
    err.status = 404;
    throw err;
  }
  
  const {
    dispo_type_id,
    contact_status_id,
    contact_temperature_id,
    name,
    code,
    next_action,
    is_connected,
    actions,
    is_active,
  } = data;
  
  if (code && code !== disposition.code) {
    const existing = await findByCode(tenantId, code);
    if (existing && existing.id !== id) {
      const err = new Error('Disposition code already exists for this tenant');
      err.status = 409;
      throw err;
    }
  }
  
  const updates = [];
  const params = [];
  
  if (dispo_type_id !== undefined) { updates.push('dispo_type_id = ?'); params.push(dispo_type_id); }
  if (contact_status_id !== undefined) { updates.push('contact_status_id = ?'); params.push(contact_status_id); }
  if (contact_temperature_id !== undefined) { updates.push('contact_temperature_id = ?'); params.push(contact_temperature_id); }
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (code !== undefined) { updates.push('code = ?'); params.push(code); }
  if (next_action !== undefined) { updates.push('next_action = ?'); params.push(next_action); }
  if (is_connected !== undefined) { updates.push('is_connected = ?'); params.push(is_connected ? 1 : 0); }
  if (actions !== undefined) { updates.push('actions = ?'); params.push(actions ? JSON.stringify(actions) : null); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  params.push(tenantId);
  
  await query(`UPDATE dispositions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

  const row = await findById(tenantId, id);
  await safeLogTenantActivity(tenantId, updatedBy, {
    event_category: 'disposition',
    event_type: 'disposition.updated',
    summary: `Disposition updated: ${row?.name || disposition.name} (${row?.code || disposition.code})`,
    entity_type: 'disposition',
    payload_json: { disposition_id: id },
  });
  return row;
}

export async function remove(tenantId, id, deletedByUserId = null) {
  const disposition = await findById(tenantId, id);
  if (!disposition) {
    const err = new Error('Disposition not found');
    err.status = 404;
    throw err;
  }

  const inUseRows = await query(
    'SELECT COUNT(*) as cnt FROM dialing_set_dispositions WHERE tenant_id = ? AND disposition_id = ?',
    [tenantId, id]
  );
  const count = inUseRows[0]?.cnt ?? 0;
  if (count > 0) {
    const err = new Error('Cannot delete: this disposition is assigned to one or more dialing sets. Remove it from dialing sets first.');
    err.status = 409;
    throw err;
  }

  const dispName = disposition.name;
  const dispCode = disposition.code;
  await query(
    'UPDATE dispositions SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  await safeLogTenantActivity(tenantId, deletedByUserId, {
    event_category: 'disposition',
    event_type: 'disposition.deleted',
    summary: `Disposition deleted: ${dispName} (${dispCode})`,
    entity_type: 'disposition',
    payload_json: { disposition_id: id, code: dispCode },
  });
  return { success: true };
}
