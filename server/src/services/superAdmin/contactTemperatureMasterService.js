import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';

const TABLE = 'contact_temperature_master';

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

  const [countResult] = await query(`SELECT COUNT(*) as total FROM ${TABLE} ${whereSQL}`, params);
  const total = countResult.total;

  const dataSQL = `SELECT * FROM ${TABLE} ${whereSQL} ORDER BY priority_order ASC LIMIT ${limitNum} OFFSET ${offset}`;
  const data = await query(dataSQL, params);

  return {
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export async function findAllActive() {
  return query(`SELECT id, name, code FROM ${TABLE} WHERE is_deleted = 0 AND is_active = 1 ORDER BY priority_order ASC`);
}

export async function findById(id) {
  const [row] = await query(`SELECT * FROM ${TABLE} WHERE id = ? AND is_deleted = 0`, [id]);
  return row || null;
}

export async function findByCode(code) {
  const [row] = await query(`SELECT * FROM ${TABLE} WHERE code = ? AND is_deleted = 0`, [code]);
  return row || null;
}

export async function create(data, createdBy) {
  const id = generateUUID();
  const { name, code, priority_order, is_active = 1 } = data;
  
  const existing = await findByCode(code);
  if (existing) {
    const err = new Error('Contact temperature code already exists');
    err.status = 409;
    throw err;
  }
  
  const orderValue = priority_order ?? await getNextOrderValue(TABLE);
  
  await query(
    `INSERT INTO ${TABLE} (id, name, code, priority_order, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, code, orderValue, is_active, createdBy, createdBy]
  );
  
  return findById(id);
}

export async function update(id, data, updatedBy) {
  const temperature = await findById(id);
  if (!temperature) {
    const err = new Error('Contact temperature not found');
    err.status = 404;
    throw err;
  }
  
  const { name, priority_order, is_active } = data;
  
  const updates = [];
  const params = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (priority_order !== undefined) { updates.push('priority_order = ?'); params.push(priority_order); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  
  await query(`UPDATE ${TABLE} SET ${updates.join(', ')} WHERE id = ?`, params);
  
  return findById(id);
}

export async function toggleActive(id, updatedBy) {
  const temperature = await findById(id);
  if (!temperature) {
    const err = new Error('Contact temperature not found');
    err.status = 404;
    throw err;
  }
  
  const newStatus = temperature.is_active === 1 ? 0 : 1;
  await query(`UPDATE ${TABLE} SET is_active = ?, updated_by = ? WHERE id = ?`, [newStatus, updatedBy, id]);
  
  return findById(id);
}

export async function remove(id) {
  const temperature = await findById(id);
  if (!temperature) {
    const err = new Error('Contact temperature not found');
    err.status = 404;
    throw err;
  }
  
  await query(`UPDATE ${TABLE} SET is_deleted = 1, deleted_at = NOW() WHERE id = ?`, [id]);
  return { success: true };
}

export async function move(id, direction, position) {
  if (position !== undefined) {
    return moveItemTo(TABLE, id, position);
  }
  
  if (direction === 'up') {
    return moveItemUp(TABLE, id);
  }
  
  if (direction === 'down') {
    return moveItemDown(TABLE, id);
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
