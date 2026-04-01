import { query } from '../../config/db.js';
import { buildOwnershipWhere } from './contactsService.js';

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

async function countOpportunitiesOnDeal(tenantId, dealId) {
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM opportunities
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  return Number(row?.n ?? 0);
}

async function countOpportunitiesOnStage(tenantId, stageId) {
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM opportunities
     WHERE tenant_id = ? AND stage_id = ? AND deleted_at IS NULL`,
    [tenantId, stageId]
  );
  return Number(row?.n ?? 0);
}

export async function listDeals(tenantId, { includeInactive = false } = {}) {
  const activeClause = includeInactive ? '' : ' AND d.is_active = 1';
  const rows = await query(
    `SELECT d.id, d.tenant_id, d.name, d.description, d.is_active, d.created_at, d.updated_at
     FROM deals d
     WHERE d.tenant_id = ? AND d.deleted_at IS NULL${activeClause}
     ORDER BY d.name ASC`,
    [tenantId]
  );
  if (!rows.length) return [];

  const dealIds = rows.map((r) => r.id);
  const placeholders = dealIds.map(() => '?').join(',');
  const stages = await query(
    `SELECT id, tenant_id, deal_id, name, sort_order, progression_percent,
            is_closed_won, is_closed_lost, created_at, updated_at
     FROM deal_stages
     WHERE tenant_id = ? AND deal_id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY deal_id ASC, sort_order ASC, id ASC`,
    [tenantId, ...dealIds]
  );
  const byDeal = new Map();
  for (const s of stages) {
    if (!byDeal.has(s.deal_id)) byDeal.set(s.deal_id, []);
    byDeal.get(s.deal_id).push(s);
  }
  return rows.map((d) => ({
    ...d,
    stages: byDeal.get(d.id) || [],
  }));
}

export async function getDealById(tenantId, dealId) {
  const [row] = await query(
    `SELECT id, tenant_id, name, description, is_active, created_at, updated_at
     FROM deals
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  if (!row) return null;
  const stages = await query(
    `SELECT id, tenant_id, deal_id, name, sort_order, progression_percent,
            is_closed_won, is_closed_lost, created_at, updated_at
     FROM deal_stages
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, id ASC`,
    [tenantId, dealId]
  );
  return { ...row, stages };
}

/**
 * Board data: stages with opportunities (contact display + amount) for one deal.
 * Respects contact visibility via join + ownership clause.
 */
export async function getDealBoard(tenantId, user, dealId) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const { whereSQL, params } = buildOwnershipWhere(user);
  const ctWhere = whereSQL.replace(/\bc\./g, 'ct.');
  const opps = await query(
    `SELECT o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.updated_at,
            ct.display_name, ct.type AS contact_type, ct.email
     FROM opportunities o
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     WHERE o.tenant_id = ? AND o.deal_id = ? AND o.deleted_at IS NULL
       AND (${ctWhere})
     ORDER BY o.updated_at DESC`,
    [tenantId, dealId, ...params]
  );

  const byStage = new Map();
  for (const s of deal.stages) {
    byStage.set(Number(s.id), []);
  }
  for (const o of opps) {
    const sid = Number(o.stage_id);
    if (byStage.has(sid)) {
      byStage.get(sid).push(o);
    }
  }

  const columns = deal.stages.map((s) => ({
    ...s,
    opportunities: byStage.get(Number(s.id)) || [],
  }));

  return { deal: { id: deal.id, name: deal.name, description: deal.description, is_active: deal.is_active }, columns };
}

export async function createDeal(tenantId, user, payload) {
  const name = trimStr(payload?.name);
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const description = trimStr(payload?.description);
  const isActive = payload?.is_active === false ? 0 : 1;
  const uid = user?.id ?? null;

  const result = await query(
    `INSERT INTO deals (tenant_id, name, description, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, name, description, isActive, uid, uid]
  );
  const dealId = result.insertId;
  return getDealById(tenantId, dealId);
}

export async function updateDeal(tenantId, user, dealId, payload) {
  const existing = await getDealById(tenantId, dealId);
  if (!existing) return null;

  const updates = [];
  const params = [];
  if (payload.name !== undefined) {
    const name = trimStr(payload.name);
    if (!name) {
      const err = new Error('name cannot be empty');
      err.status = 400;
      throw err;
    }
    updates.push('name = ?');
    params.push(name);
  }
  if (payload.description !== undefined) {
    updates.push('description = ?');
    params.push(trimStr(payload.description));
  }
  if (payload.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(payload.is_active ? 1 : 0);
  }
  if (!updates.length) return existing;

  updates.push('updated_by = ?');
  params.push(user?.id ?? null);
  params.push(tenantId, dealId);

  await query(`UPDATE deals SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`, params);
  return getDealById(tenantId, dealId);
}

export async function softDeleteDeal(tenantId, user, dealId) {
  const existing = await getDealById(tenantId, dealId);
  if (!existing) return null;

  const n = await countOpportunitiesOnDeal(tenantId, dealId);
  if (n > 0) {
    const err = new Error('Cannot delete pipeline: move or remove opportunities first');
    err.status = 400;
    throw err;
  }

  const uid = user?.id ?? null;
  await query(
    `UPDATE deal_stages SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, dealId]
  );
  await query(
    `UPDATE deals SET deleted_at = NOW(), deleted_by = ?, updated_by = ? WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, dealId]
  );
  return { id: dealId };
}

function validateStagePayload(body, partial) {
  const name = trimStr(body?.name);
  if (!partial && !name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  let progression = body?.progression_percent;
  if (progression !== undefined && progression !== null && progression !== '') {
    progression = Number(progression);
    if (Number.isNaN(progression) || progression < 0 || progression > 100) {
      const err = new Error('progression_percent must be between 0 and 100');
      err.status = 400;
      throw err;
    }
  } else if (!partial) {
    progression = 0;
  }
  const isClosedWon = body?.is_closed_won ? 1 : 0;
  const isClosedLost = body?.is_closed_lost ? 1 : 0;
  if (isClosedWon && isClosedLost) {
    const err = new Error('Stage cannot be both closed won and closed lost');
    err.status = 400;
    throw err;
  }
  return { name, progression, isClosedWon, isClosedLost };
}

export async function createStage(tenantId, user, dealId, payload) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const { name, progression, isClosedWon, isClosedLost } = validateStagePayload(payload, false);

  const [maxRow] = await query(
    `SELECT COALESCE(MAX(sort_order), -1) AS mx FROM deal_stages
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  const sortOrder = Number(maxRow?.mx ?? -1) + 1;
  const uid = user?.id ?? null;

  await query(
    `INSERT INTO deal_stages (
       tenant_id, deal_id, name, sort_order, progression_percent, is_closed_won, is_closed_lost,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, dealId, name, sortOrder, progression, isClosedWon, isClosedLost, uid, uid]
  );
  return getDealById(tenantId, dealId);
}

export async function updateStage(tenantId, user, dealId, stageId, payload) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const [st] = await query(
    `SELECT id FROM deal_stages
     WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
    [tenantId, dealId, stageId]
  );
  if (!st) return null;

  const updates = [];
  const params = [];
  if (payload.name !== undefined) {
    const name = trimStr(payload.name);
    if (!name) {
      const err = new Error('name cannot be empty');
      err.status = 400;
      throw err;
    }
    updates.push('name = ?');
    params.push(name);
  }
  if (payload.progression_percent !== undefined) {
    const progression = Number(payload.progression_percent);
    if (Number.isNaN(progression) || progression < 0 || progression > 100) {
      const err = new Error('progression_percent must be between 0 and 100');
      err.status = 400;
      throw err;
    }
    updates.push('progression_percent = ?');
    params.push(progression);
  }
  if (payload.is_closed_won !== undefined) {
    updates.push('is_closed_won = ?');
    params.push(payload.is_closed_won ? 1 : 0);
  }
  if (payload.is_closed_lost !== undefined) {
    updates.push('is_closed_lost = ?');
    params.push(payload.is_closed_lost ? 1 : 0);
  }
  if (updates.length) {
    const isWon = payload.is_closed_won !== undefined ? (payload.is_closed_won ? 1 : 0) : undefined;
    const isLost = payload.is_closed_lost !== undefined ? (payload.is_closed_lost ? 1 : 0) : undefined;
    const [cur] = await query(
      `SELECT is_closed_won, is_closed_lost FROM deal_stages WHERE id = ? AND tenant_id = ?`,
      [stageId, tenantId]
    );
    const w = isWon !== undefined ? isWon : cur?.is_closed_won;
    const l = isLost !== undefined ? isLost : cur?.is_closed_lost;
    if (w && l) {
      const err = new Error('Stage cannot be both closed won and closed lost');
      err.status = 400;
      throw err;
    }
    updates.push('updated_by = ?');
    params.push(user?.id ?? null);
    params.push(tenantId, dealId, stageId);
    await query(
      `UPDATE deal_stages SET ${updates.join(', ')} WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
      params
    );
  }

  return getDealById(tenantId, dealId);
}

export async function reorderStages(tenantId, user, dealId, stageIdsOrdered) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  if (!Array.isArray(stageIdsOrdered) || !stageIdsOrdered.length) {
    const err = new Error('stage_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const ids = stageIdsOrdered.map((id) => Number(id)).filter((n) => Number.isFinite(n));
  const existingIds = new Set(deal.stages.map((s) => Number(s.id)));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
    const err = new Error('stage_ids must list every stage of this deal exactly once');
    err.status = 400;
    throw err;
  }

  const uid = user?.id ?? null;
  let order = 0;
  for (const sid of ids) {
    await query(
      `UPDATE deal_stages SET sort_order = ?, updated_by = ?
       WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
      [order, uid, tenantId, dealId, sid]
    );
    order += 1;
  }
  return getDealById(tenantId, dealId);
}

export async function softDeleteStage(tenantId, user, dealId, stageId) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const [st] = await query(
    `SELECT id FROM deal_stages WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
    [tenantId, dealId, stageId]
  );
  if (!st) return null;

  const n = await countOpportunitiesOnStage(tenantId, stageId);
  if (n > 0) {
    const err = new Error('Cannot delete stage: opportunities are still in this stage');
    err.status = 400;
    throw err;
  }

  const uid = user?.id ?? null;
  await query(
    `UPDATE deal_stages SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, dealId, stageId]
  );
  return getDealById(tenantId, dealId);
}
