import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';

const TABLE = 'default_dialing_set_dispositions';

export async function findAll(dialingSetId) {
  const sql = `
    SELECT ddsd.*, dd.name as disposition_name, dd.code as disposition_code
    FROM ${TABLE} ddsd
    LEFT JOIN default_dispositions dd ON ddsd.default_disposition_id = dd.id
    WHERE ddsd.default_dialing_set_id = ?
    ORDER BY ddsd.order_index ASC
  `;
  return query(sql, [dialingSetId]);
}

export async function findById(id) {
  const [row] = await query(
    `SELECT ddsd.*, dd.name as disposition_name, dd.code as disposition_code
     FROM ${TABLE} ddsd
     LEFT JOIN default_dispositions dd ON ddsd.default_disposition_id = dd.id
     WHERE ddsd.id = ?`,
    [id]
  );
  return row || null;
}

export async function findByDialingSetAndDisposition(dialingSetId, dispositionId) {
  const [row] = await query(
    `SELECT * FROM ${TABLE} WHERE default_dialing_set_id = ? AND default_disposition_id = ?`,
    [dialingSetId, dispositionId]
  );
  return row || null;
}

export async function create(data) {
  const id = generateUUID();
  const { default_dialing_set_id, default_disposition_id, order_index } = data;
  
  const existing = await findByDialingSetAndDisposition(default_dialing_set_id, default_disposition_id);
  if (existing) {
    const err = new Error('Disposition already exists in this dialing set');
    err.status = 409;
    throw err;
  }
  
  const orderValue = order_index ?? await getNextOrderValue(TABLE, null, 'default_dialing_set_id', default_dialing_set_id);
  
  await query(
    `INSERT INTO ${TABLE} (id, default_dialing_set_id, default_disposition_id, order_index)
     VALUES (?, ?, ?, ?)`,
    [id, default_dialing_set_id, default_disposition_id, orderValue]
  );
  
  return findById(id);
}

export async function remove(id) {
  const mapping = await findById(id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return { success: true };
}

export async function move(id, direction, position) {
  const mapping = await findById(id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  if (position !== undefined) {
    return moveItemTo(TABLE, id, position, null, 'default_dialing_set_id', mapping.default_dialing_set_id);
  }
  
  if (direction === 'up') {
    return moveItemUp(TABLE, id, null, 'default_dialing_set_id', mapping.default_dialing_set_id);
  }
  
  if (direction === 'down') {
    return moveItemDown(TABLE, id, null, 'default_dialing_set_id', mapping.default_dialing_set_id);
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
