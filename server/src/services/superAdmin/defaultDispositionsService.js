import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

export async function findAll(industryId = undefined, includeInactive = false) {
  let sql = `
    SELECT dd.*, 
           i.name as industry_name,
           dt.name as dispo_type_name,
           cs.name as contact_status_name,
           ct.name as contact_temperature_name
    FROM default_dispositions dd
    LEFT JOIN industries i ON dd.industry_id = i.id
    LEFT JOIN dispo_types_master dt ON dd.dispo_type_id = dt.id
    LEFT JOIN contact_status_master cs ON dd.contact_status_id = cs.id
    LEFT JOIN contact_temperature_master ct ON dd.contact_temperature_id = ct.id
    WHERE 1=1
  `;
  const params = [];

  if (!includeInactive) {
    sql += ' AND dd.is_active = 1';
  }

  if (industryId === null) {
    sql += ' AND dd.industry_id IS NULL';
  } else if (industryId !== undefined) {
    sql += ' AND dd.industry_id = ?';
    params.push(industryId);
  }

  sql += ' ORDER BY dd.name ASC';

  return query(sql, params);
}

/**
 * Paginated list with search and includeInactive
 */
export async function findAllPaginated(industryId = undefined, { search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  let whereClauses = ['1=1'];
  const params = [];

  if (!includeInactive) {
    whereClauses.push('dd.is_active = 1');
  }

  if (industryId === null) {
    whereClauses.push('dd.industry_id IS NULL');
  } else if (industryId !== undefined) {
    whereClauses.push('dd.industry_id = ?');
    params.push(industryId);
  }

  if (search && search.trim()) {
    whereClauses.push('(dd.name LIKE ? OR dd.code LIKE ?)');
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const whereSQL = whereClauses.join(' AND ');
  const fromSQL = `
    FROM default_dispositions dd
    LEFT JOIN industries i ON dd.industry_id = i.id
    LEFT JOIN dispo_types_master dt ON dd.dispo_type_id = dt.id
    LEFT JOIN contact_status_master cs ON dd.contact_status_id = cs.id
    LEFT JOIN contact_temperature_master ct ON dd.contact_temperature_id = ct.id
    WHERE ${whereSQL}
  `;

  const [countRow] = await query(`SELECT COUNT(*) as total FROM default_dispositions dd WHERE ${whereSQL}`, params);
  const total = countRow.total;

  const data = await query(
    `SELECT dd.*, 
            i.name as industry_name,
            dt.name as dispo_type_name,
            cs.name as contact_status_name,
            ct.name as contact_temperature_name
     ${fromSQL}
     ORDER BY dd.name ASC
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

export async function findById(id) {
  const [row] = await query(
    `SELECT dd.*, 
            i.name as industry_name,
            dt.name as dispo_type_name,
            cs.name as contact_status_name,
            ct.name as contact_temperature_name
     FROM default_dispositions dd
     LEFT JOIN industries i ON dd.industry_id = i.id
     LEFT JOIN dispo_types_master dt ON dd.dispo_type_id = dt.id
     LEFT JOIN contact_status_master cs ON dd.contact_status_id = cs.id
     LEFT JOIN contact_temperature_master ct ON dd.contact_temperature_id = ct.id
     WHERE dd.id = ?`,
    [id]
  );
  return row || null;
}

export async function findByIndustryAndCode(industryId, code) {
  let sql = 'SELECT * FROM default_dispositions WHERE code = ?';
  const params = [code];
  
  if (industryId === null) {
    sql += ' AND industry_id IS NULL';
  } else {
    sql += ' AND industry_id = ?';
    params.push(industryId);
  }
  
  const [row] = await query(sql, params);
  return row || null;
}

export async function create(data, createdBy) {
  const id = generateUUID();
  const {
    industry_id = null,
    dispo_type_id,
    contact_status_id = null,
    contact_temperature_id = null,
    name,
    code,
    next_action = null,
    is_connected = 0,
    actions = null,
    is_active = 1,
  } = data;

  const existing = await findByIndustryAndCode(industry_id, code);
  if (existing) {
    const err = new Error('Disposition code already exists for this industry');
    err.status = 409;
    throw err;
  }

  const actionsJson = actions ? JSON.stringify(actions) : null;

  await query(
    `INSERT INTO default_dispositions 
     (id, industry_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, industry_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected ? 1 : 0, actionsJson, is_active ?? 1, createdBy, createdBy]
  );

  return findById(id);
}

export async function update(id, data, updatedBy) {
  const disposition = await findById(id);
  if (!disposition) {
    const err = new Error('Default disposition not found');
    err.status = 404;
    throw err;
  }
  
  const {
    industry_id,
    dispo_type_id,
    contact_status_id,
    contact_temperature_id,
    name,
    code,
    next_action,
    is_connected,
    actions,
    is_active
  } = data;
  
  if (code && (code !== disposition.code || industry_id !== disposition.industry_id)) {
    const targetIndustry = industry_id || disposition.industry_id;
    const existing = await findByIndustryAndCode(targetIndustry, code);
    if (existing && existing.id !== id) {
      const err = new Error('Disposition code already exists for this industry');
      err.status = 409;
      throw err;
    }
  }
  
  const updates = [];
  const params = [];
  
  if (industry_id !== undefined) { updates.push('industry_id = ?'); params.push(industry_id); }
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
  
  await query(`UPDATE default_dispositions SET ${updates.join(', ')} WHERE id = ?`, params);
  
  return findById(id);
}

export async function remove(id) {
  const disposition = await findById(id);
  if (!disposition) {
    const err = new Error('Default disposition not found');
    err.status = 404;
    throw err;
  }

  const inUseRows = await query(
    'SELECT COUNT(*) as cnt FROM default_dialing_set_dispositions WHERE default_disposition_id = ?',
    [id]
  );
  const count = inUseRows[0]?.cnt ?? 0;
  if (count > 0) {
    const err = new Error('Cannot delete: this disposition is assigned to one or more default dialing sets. Remove it from dialing sets first.');
    err.status = 409;
    throw err;
  }

  await query('UPDATE default_dispositions SET is_active = 0 WHERE id = ?', [id]);
  return { success: true };
}
