import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';

const TABLE = 'dialing_set_dispositions';

export async function findAll(tenantId, dialingSetId) {
  const sql = `
    SELECT dsd.*, d.name as disposition_name, d.code as disposition_code, d.next_action
    FROM ${TABLE} dsd
    LEFT JOIN dispositions d ON dsd.disposition_id = d.id
    WHERE dsd.tenant_id = ? AND dsd.dialing_set_id = ?
    ORDER BY dsd.order_index ASC
  `;
  return query(sql, [tenantId, dialingSetId]);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT dsd.*, d.name as disposition_name, d.code as disposition_code
     FROM ${TABLE} dsd
     LEFT JOIN dispositions d ON dsd.disposition_id = d.id
     WHERE dsd.id = ? AND dsd.tenant_id = ?`,
    [id, tenantId]
  );
  return row || null;
}

export async function findByDialingSetAndDisposition(tenantId, dialingSetId, dispositionId) {
  const [row] = await query(
    `SELECT * FROM ${TABLE} WHERE tenant_id = ? AND dialing_set_id = ? AND disposition_id = ?`,
    [tenantId, dialingSetId, dispositionId]
  );
  return row || null;
}

export async function create(tenantId, data) {
  const id = generateUUID();
  const { dialing_set_id, disposition_id, order_index } = data;
  
  const existing = await findByDialingSetAndDisposition(tenantId, dialing_set_id, disposition_id);
  if (existing) {
    const err = new Error('Disposition already exists in this dialing set');
    err.status = 409;
    throw err;
  }
  
  const orderValue = order_index ?? await getNextOrderValue(TABLE, tenantId, 'dialing_set_id', dialing_set_id);
  
  await query(
    `INSERT INTO ${TABLE} (id, tenant_id, dialing_set_id, disposition_id, order_index)
     VALUES (?, ?, ?, ?, ?)`,
    [id, tenantId, dialing_set_id, disposition_id, orderValue]
  );
  
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  await query(`DELETE FROM ${TABLE} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  return { success: true };
}

export async function move(tenantId, id, direction, position) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  if (position !== undefined) {
    return moveItemTo(TABLE, id, position, tenantId, 'dialing_set_id', mapping.dialing_set_id);
  }
  
  if (direction === 'up') {
    return moveItemUp(TABLE, id, tenantId, 'dialing_set_id', mapping.dialing_set_id);
  }
  
  if (direction === 'down') {
    return moveItemDown(TABLE, id, tenantId, 'dialing_set_id', mapping.dialing_set_id);
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
