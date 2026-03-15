import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';

const TABLE = 'default_disposition_actions_map';
const MAX_ACTIONS_PER_DISPOSITION = 3;

export async function findAll(dispositionId) {
  const sql = `
    SELECT ddam.*, dam.name as action_name, dam.code as action_code
    FROM ${TABLE} ddam
    LEFT JOIN dispo_actions_master dam ON ddam.action_id = dam.id
    WHERE ddam.default_disposition_id = ?
    ORDER BY ddam.priority_order ASC
  `;
  return query(sql, [dispositionId]);
}

export async function findById(id) {
  const [row] = await query(
    `SELECT ddam.*, dam.name as action_name, dam.code as action_code
     FROM ${TABLE} ddam
     LEFT JOIN dispo_actions_master dam ON ddam.action_id = dam.id
     WHERE ddam.id = ?`,
    [id]
  );
  return row || null;
}

export async function findByDispositionAndAction(dispositionId, actionId) {
  const [row] = await query(
    `SELECT * FROM ${TABLE} WHERE default_disposition_id = ? AND action_id = ?`,
    [dispositionId, actionId]
  );
  return row || null;
}

export async function countByDisposition(dispositionId) {
  const [result] = await query(
    `SELECT COUNT(*) as cnt FROM ${TABLE} WHERE default_disposition_id = ?`,
    [dispositionId]
  );
  return result.cnt;
}

export async function create(data) {
  const id = generateUUID();
  const { default_disposition_id, action_id, priority_order } = data;
  
  const count = await countByDisposition(default_disposition_id);
  if (count >= MAX_ACTIONS_PER_DISPOSITION) {
    const err = new Error(`Maximum ${MAX_ACTIONS_PER_DISPOSITION} actions per disposition allowed`);
    err.status = 400;
    throw err;
  }
  
  const existing = await findByDispositionAndAction(default_disposition_id, action_id);
  if (existing) {
    const err = new Error('Action already mapped to this disposition');
    err.status = 409;
    throw err;
  }
  
  const orderValue = priority_order ?? await getNextOrderValue(TABLE, null, 'default_disposition_id', default_disposition_id);
  
  await query(
    `INSERT INTO ${TABLE} (id, default_disposition_id, action_id, priority_order)
     VALUES (?, ?, ?, ?)`,
    [id, default_disposition_id, action_id, orderValue]
  );
  
  return findById(id);
}

export async function remove(id) {
  const mapping = await findById(id);
  if (!mapping) {
    const err = new Error('Disposition action mapping not found');
    err.status = 404;
    throw err;
  }
  
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return { success: true };
}

export async function move(id, direction, position) {
  const mapping = await findById(id);
  if (!mapping) {
    const err = new Error('Disposition action mapping not found');
    err.status = 404;
    throw err;
  }
  
  if (position !== undefined) {
    return moveItemTo(TABLE, id, position, null, 'default_disposition_id', mapping.default_disposition_id);
  }
  
  if (direction === 'up') {
    return moveItemUp(TABLE, id, null, 'default_disposition_id', mapping.default_disposition_id);
  }
  
  if (direction === 'down') {
    return moveItemDown(TABLE, id, null, 'default_disposition_id', mapping.default_disposition_id);
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
