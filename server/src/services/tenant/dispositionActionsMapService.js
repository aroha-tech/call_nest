import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';

const TABLE = 'disposition_actions_map';
const MAX_ACTIONS_PER_DISPOSITION = 3;

export async function findAll(tenantId, dispositionId) {
  const sql = `
    SELECT dam.*, 
           dam2.name as action_name, 
           dam2.code as action_code,
           et.name as email_template_name,
           wt.name as whatsapp_template_name
    FROM ${TABLE} dam
    LEFT JOIN dispo_actions_master dam2 ON dam.action_id = dam2.id
    LEFT JOIN email_templates et ON dam.email_template_id = et.id
    LEFT JOIN whatsapp_templates wt ON dam.whatsapp_template_id = wt.id
    WHERE dam.tenant_id = ? AND dam.disposition_id = ?
    ORDER BY dam.priority_order ASC
  `;
  return query(sql, [tenantId, dispositionId]);
}

export async function findById(tenantId, id) {
  const [row] = await query(
    `SELECT dam.*, 
            dam2.name as action_name, 
            dam2.code as action_code,
            et.name as email_template_name,
            wt.name as whatsapp_template_name
     FROM ${TABLE} dam
     LEFT JOIN dispo_actions_master dam2 ON dam.action_id = dam2.id
     LEFT JOIN email_templates et ON dam.email_template_id = et.id
     LEFT JOIN whatsapp_templates wt ON dam.whatsapp_template_id = wt.id
     WHERE dam.id = ? AND dam.tenant_id = ?`,
    [id, tenantId]
  );
  return row || null;
}

export async function findByDispositionAndAction(tenantId, dispositionId, actionId) {
  const [row] = await query(
    `SELECT * FROM ${TABLE} WHERE tenant_id = ? AND disposition_id = ? AND action_id = ?`,
    [tenantId, dispositionId, actionId]
  );
  return row || null;
}

export async function countByDisposition(tenantId, dispositionId) {
  const [result] = await query(
    `SELECT COUNT(*) as cnt FROM ${TABLE} WHERE tenant_id = ? AND disposition_id = ?`,
    [tenantId, dispositionId]
  );
  return result.cnt;
}

export async function create(tenantId, data) {
  const id = generateUUID();
  const { disposition_id, action_id, priority_order, email_template_id, whatsapp_template_id } = data;
  
  const count = await countByDisposition(tenantId, disposition_id);
  if (count >= MAX_ACTIONS_PER_DISPOSITION) {
    const err = new Error(`Maximum ${MAX_ACTIONS_PER_DISPOSITION} actions per disposition allowed`);
    err.status = 400;
    throw err;
  }
  
  const existing = await findByDispositionAndAction(tenantId, disposition_id, action_id);
  if (existing) {
    const err = new Error('Action already mapped to this disposition');
    err.status = 409;
    throw err;
  }
  
  const orderValue = priority_order ?? await getNextOrderValue(TABLE, tenantId, 'disposition_id', disposition_id);
  
  await query(
    `INSERT INTO ${TABLE} (id, tenant_id, disposition_id, action_id, priority_order, email_template_id, whatsapp_template_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, disposition_id, action_id, orderValue, email_template_id || null, whatsapp_template_id || null]
  );
  
  return findById(tenantId, id);
}

export async function updateTemplates(tenantId, id, data) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Disposition action mapping not found');
    err.status = 404;
    throw err;
  }
  
  const { email_template_id, whatsapp_template_id } = data;
  const updates = [];
  const params = [];
  
  if (email_template_id !== undefined) {
    updates.push('email_template_id = ?');
    params.push(email_template_id || null);
  }
  if (whatsapp_template_id !== undefined) {
    updates.push('whatsapp_template_id = ?');
    params.push(whatsapp_template_id || null);
  }
  
  if (updates.length === 0) {
    return mapping;
  }
  
  params.push(id, tenantId);
  await query(`UPDATE ${TABLE} SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
  
  return findById(tenantId, id);
}

export async function remove(tenantId, id) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Disposition action mapping not found');
    err.status = 404;
    throw err;
  }
  
  await query(`DELETE FROM ${TABLE} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  return { success: true };
}

export async function move(tenantId, id, direction, position) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Disposition action mapping not found');
    err.status = 404;
    throw err;
  }
  
  if (position !== undefined) {
    return moveItemTo(TABLE, id, position, tenantId, 'disposition_id', mapping.disposition_id);
  }
  
  if (direction === 'up') {
    return moveItemUp(TABLE, id, tenantId, 'disposition_id', mapping.disposition_id);
  }
  
  if (direction === 'down') {
    return moveItemDown(TABLE, id, tenantId, 'disposition_id', mapping.disposition_id);
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
