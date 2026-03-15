

import { query } from '../config/db.js';

/**
 * Get the order column name for a table
 * Some tables use order_index, others use priority_order
 */
function getOrderColumn(table) {
  const priorityOrderTables = [
    'contact_temperature_master',
    'default_disposition_actions_map',
    'disposition_actions_map'
  ];
  return priorityOrderTables.includes(table) ? 'priority_order' : 'order_index';
}

/**
 * Move item up (swap with previous item in order)
 * @param {string} table - Table name
 * @param {string} id - Item ID (UUID)
 * @param {string|null} tenantId - Tenant ID (null for global tables)
 * @param {string|null} groupColumn - Column name for grouping (e.g., 'dialing_set_id')
 * @param {string|null} groupId - Group ID value
 */
export async function moveItemUp(table, id, tenantId = null, groupColumn = null, groupId = null) {
  const orderColumn = getOrderColumn(table);
  
  let whereClause = '1=1';
  const params = [];
  
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  if (groupColumn && groupId) {
    whereClause += ` AND ${groupColumn} = ?`;
    params.push(groupId);
  }
  
  const [currentItem] = await query(
    `SELECT id, ${orderColumn} as order_val FROM ${table} WHERE id = ? AND ${whereClause}`,
    [id, ...params]
  );
  
  if (!currentItem) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }
  
  const [prevItem] = await query(
    `SELECT id, ${orderColumn} as order_val FROM ${table} 
     WHERE ${orderColumn} < ? AND ${whereClause}
     ORDER BY ${orderColumn} DESC LIMIT 1`,
    [currentItem.order_val, ...params]
  );
  
  if (!prevItem) {
    const err = new Error('Item is already at the top');
    err.status = 400;
    throw err;
  }
  
  await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [prevItem.order_val, id]);
  await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [currentItem.order_val, prevItem.id]);
  
  return { success: true };
}

/**
 * Move item down (swap with next item in order)
 */
export async function moveItemDown(table, id, tenantId = null, groupColumn = null, groupId = null) {
  const orderColumn = getOrderColumn(table);
  
  let whereClause = '1=1';
  const params = [];
  
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  if (groupColumn && groupId) {
    whereClause += ` AND ${groupColumn} = ?`;
    params.push(groupId);
  }
  
  const [currentItem] = await query(
    `SELECT id, ${orderColumn} as order_val FROM ${table} WHERE id = ? AND ${whereClause}`,
    [id, ...params]
  );
  
  if (!currentItem) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }
  
  const [nextItem] = await query(
    `SELECT id, ${orderColumn} as order_val FROM ${table} 
     WHERE ${orderColumn} > ? AND ${whereClause}
     ORDER BY ${orderColumn} ASC LIMIT 1`,
    [currentItem.order_val, ...params]
  );
  
  if (!nextItem) {
    const err = new Error('Item is already at the bottom');
    err.status = 400;
    throw err;
  }
  
  await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [nextItem.order_val, id]);
  await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [currentItem.order_val, nextItem.id]);
  
  return { success: true };
}

/**
 * Move item to specific position
 */
export async function moveItemTo(table, id, newPosition, tenantId = null, groupColumn = null, groupId = null) {
  const orderColumn = getOrderColumn(table);
  
  let whereClause = '1=1';
  const params = [];
  
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  if (groupColumn && groupId) {
    whereClause += ` AND ${groupColumn} = ?`;
    params.push(groupId);
  }
  
  const [currentItem] = await query(
    `SELECT id, ${orderColumn} as order_val FROM ${table} WHERE id = ? AND ${whereClause}`,
    [id, ...params]
  );
  
  if (!currentItem) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }
  
  const currentPosition = currentItem.order_val;
  
  if (currentPosition === newPosition) {
    return { success: true };
  }
  
  if (newPosition < currentPosition) {
    await query(
      `UPDATE ${table} SET ${orderColumn} = ${orderColumn} + 1 
       WHERE ${orderColumn} >= ? AND ${orderColumn} < ? AND ${whereClause}`,
      [newPosition, currentPosition, ...params]
    );
  } else {
    await query(
      `UPDATE ${table} SET ${orderColumn} = ${orderColumn} - 1 
       WHERE ${orderColumn} > ? AND ${orderColumn} <= ? AND ${whereClause}`,
      [currentPosition, newPosition, ...params]
    );
  }
  
  await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [newPosition, id]);
  
  return { success: true };
}

/**
 * Reindex order values to be sequential (0, 1, 2, ...)
 */
export async function reindexOrder(table, tenantId = null, groupColumn = null, groupId = null) {
  const orderColumn = getOrderColumn(table);
  
  let whereClause = '1=1';
  const params = [];
  
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  if (groupColumn && groupId) {
    whereClause += ` AND ${groupColumn} = ?`;
    params.push(groupId);
  }
  
  const items = await query(
    `SELECT id FROM ${table} WHERE ${whereClause} ORDER BY ${orderColumn} ASC`,
    params
  );
  
  for (let i = 0; i < items.length; i++) {
    await query(`UPDATE ${table} SET ${orderColumn} = ? WHERE id = ?`, [i, items[i].id]);
  }
  
  return { success: true, count: items.length };
}

/**
 * Get next order value for new item
 */
export async function getNextOrderValue(table, tenantId = null, groupColumn = null, groupId = null) {
  const orderColumn = getOrderColumn(table);
  
  let whereClause = '1=1';
  const params = [];
  
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  if (groupColumn && groupId) {
    whereClause += ` AND ${groupColumn} = ?`;
    params.push(groupId);
  }
  
  const [result] = await query(
    `SELECT COALESCE(MAX(${orderColumn}), -1) + 1 as next_val FROM ${table} WHERE ${whereClause}`,
    params
  );
  
  return result.next_val;
}
