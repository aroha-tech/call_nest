import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

export async function findAll({ search = '', includeInactive = false, page = 1, limit = 10 } = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;
  
  let whereClauses = ['is_deleted = 0'];
  const params = [];

  if (!includeInactive) {
    whereClauses.push('is_active = 1');
  }

  if (search) {
    whereClauses.push('(name LIKE ? OR code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const [countResult] = await query(`SELECT COUNT(*) as total FROM dispo_types_master ${whereSQL}`, params);
  const total = countResult.total;

  const dataSQL = `SELECT * FROM dispo_types_master ${whereSQL} ORDER BY name ASC LIMIT ${limitNum} OFFSET ${offset}`;
  const data = await query(dataSQL, params);

  return {
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export async function findAllActive() {
  return query('SELECT id, name, code FROM dispo_types_master WHERE is_deleted = 0 AND is_active = 1 ORDER BY name ASC');
}

export async function findById(id) {
  const [row] = await query('SELECT * FROM dispo_types_master WHERE id = ? AND is_deleted = 0', [id]);
  return row || null;
}

export async function findByCode(code) {
  const [row] = await query('SELECT * FROM dispo_types_master WHERE code = ? AND is_deleted = 0', [code]);
  return row || null;
}

export async function create(data, createdBy) {
  const id = generateUUID();
  const { name, code, is_active = 1 } = data;
  
  const existing = await findByCode(code);
  if (existing) {
    const err = new Error('Disposition type code already exists');
    err.status = 409;
    throw err;
  }
  
  await query(
    `INSERT INTO dispo_types_master (id, name, code, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, code, is_active, createdBy, createdBy]
  );
  
  return findById(id);
}

export async function update(id, data, updatedBy) {
  const dispoType = await findById(id);
  if (!dispoType) {
    const err = new Error('Disposition type not found');
    err.status = 404;
    throw err;
  }
  
  const { name, is_active } = data;
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  
  await query(`UPDATE dispo_types_master SET ${updates.join(', ')} WHERE id = ?`, params);
  
  return findById(id);
}

export async function toggleActive(id, updatedBy) {
  const dispoType = await findById(id);
  if (!dispoType) {
    const err = new Error('Disposition type not found');
    err.status = 404;
    throw err;
  }
  
  const newStatus = dispoType.is_active === 1 ? 0 : 1;
  await query('UPDATE dispo_types_master SET is_active = ?, updated_by = ? WHERE id = ?', [newStatus, updatedBy, id]);
  
  return findById(id);
}

export async function remove(id) {
  const dispoType = await findById(id);
  if (!dispoType) {
    const err = new Error('Disposition type not found');
    err.status = 404;
    throw err;
  }
  
  await query('UPDATE dispo_types_master SET is_deleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}
