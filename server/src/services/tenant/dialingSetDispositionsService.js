import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';
import { moveItemUp, moveItemDown, moveItemTo, getNextOrderValue } from '../../utils/orderHelper.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

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

export async function create(tenantId, data, actorUserId = null) {
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

  const row = await findById(tenantId, id);
  const [dsn] = await query(`SELECT name FROM dialing_sets WHERE id = ? AND tenant_id = ? LIMIT 1`, [
    dialing_set_id,
    tenantId,
  ]);
  await safeLogTenantActivity(tenantId, actorUserId, {
    event_category: 'dialing_set',
    event_type: 'dialing_set.disposition_added',
    summary: `Disposition added to set: ${row?.disposition_name || '—'} (${dsn?.name || 'Dialing set'})`,
    entity_type: 'dialing_set',
    payload_json: { dialing_set_id, disposition_id, mapping_id: id },
  });
  return row;
}

export async function remove(tenantId, id, actorUserId = null) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  const [dsn] = await query(`SELECT name FROM dialing_sets WHERE id = ? AND tenant_id = ? LIMIT 1`, [
    mapping.dialing_set_id,
    tenantId,
  ]);
  await query(`DELETE FROM ${TABLE} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  await safeLogTenantActivity(tenantId, actorUserId, {
    event_category: 'dialing_set',
    event_type: 'dialing_set.disposition_removed',
    summary: `Disposition removed from set: ${mapping.disposition_name || '—'} (${dsn?.name || 'Dialing set'})`,
    entity_type: 'dialing_set',
    payload_json: { dialing_set_id: mapping.dialing_set_id, disposition_id: mapping.disposition_id },
  });
  return { success: true };
}

export async function move(tenantId, id, direction, position, actorUserId = null) {
  const mapping = await findById(tenantId, id);
  if (!mapping) {
    const err = new Error('Dialing set disposition mapping not found');
    err.status = 404;
    throw err;
  }
  
  if (position !== undefined) {
    const r = await moveItemTo(TABLE, id, position, tenantId, 'dialing_set_id', mapping.dialing_set_id);
    const [dsn] = await query(`SELECT name FROM dialing_sets WHERE id = ? AND tenant_id = ? LIMIT 1`, [
      mapping.dialing_set_id,
      tenantId,
    ]);
    await safeLogTenantActivity(tenantId, actorUserId, {
      event_category: 'dialing_set',
      event_type: 'dialing_set.dispositions_reordered',
      summary: `Dialing set disposition order changed (${dsn?.name || 'Dialing set'})`,
      entity_type: 'dialing_set',
      payload_json: { dialing_set_id: mapping.dialing_set_id },
    });
    return r;
  }

  if (direction === 'up') {
    const r = await moveItemUp(TABLE, id, tenantId, 'dialing_set_id', mapping.dialing_set_id);
    const [dsn] = await query(`SELECT name FROM dialing_sets WHERE id = ? AND tenant_id = ? LIMIT 1`, [
      mapping.dialing_set_id,
      tenantId,
    ]);
    await safeLogTenantActivity(tenantId, actorUserId, {
      event_category: 'dialing_set',
      event_type: 'dialing_set.dispositions_reordered',
      summary: `Dialing set disposition order changed (${dsn?.name || 'Dialing set'})`,
      entity_type: 'dialing_set',
      payload_json: { dialing_set_id: mapping.dialing_set_id },
    });
    return r;
  }

  if (direction === 'down') {
    const r = await moveItemDown(TABLE, id, tenantId, 'dialing_set_id', mapping.dialing_set_id);
    const [dsn] = await query(`SELECT name FROM dialing_sets WHERE id = ? AND tenant_id = ? LIMIT 1`, [
      mapping.dialing_set_id,
      tenantId,
    ]);
    await safeLogTenantActivity(tenantId, actorUserId, {
      event_category: 'dialing_set',
      event_type: 'dialing_set.dispositions_reordered',
      summary: `Dialing set disposition order changed (${dsn?.name || 'Dialing set'})`,
      entity_type: 'dialing_set',
      payload_json: { dialing_set_id: mapping.dialing_set_id },
    });
    return r;
  }
  
  const err = new Error('Invalid move direction. Use "up", "down", or specify "position"');
  err.status = 400;
  throw err;
}
