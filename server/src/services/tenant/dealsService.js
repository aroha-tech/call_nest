import { query, withConnection } from '../../config/db.js';
import { buildOwnershipWhere } from './contactsService.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';
import { createAndDispatchNotification } from './notificationService.js';

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function trimColorHex(v) {
  const t = trimStr(v);
  if (!t) return null;
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toUpperCase();
  return null;
}

async function assertDealOwnerUserId(tenantId, userId) {
  if (userId == null || userId === '') return null;
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid owner_user_id');
    err.status = 400;
    throw err;
  }
  const [r] = await query(
    `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
    [id, tenantId]
  );
  if (!r) {
    const err = new Error('owner_user_id must be a user in this organization');
    err.status = 400;
    throw err;
  }
  return id;
}

function normalizeProbabilityMode(raw) {
  const s = String(raw || 'stage').toLowerCase();
  if (s === 'custom') return 'custom';
  return 'stage';
}

function normalizeVisibility(raw) {
  const s = String(raw || 'private').toLowerCase();
  if (s === 'workspace' || s === 'public') return 'workspace';
  return 'private';
}

function parseOptionalMoneyGoal(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) {
    const err = new Error('goal_amount must be a non-negative number');
    err.status = 400;
    throw err;
  }
  return n;
}

function parseOptionalIntGoal(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    const err = new Error('goal_deals must be a non-negative integer');
    err.status = 400;
    throw err;
  }
  return n;
}

let opportunitiesIsDraftColumnCache = null;

async function opportunitiesTableHasIsDraftColumn() {
  if (opportunitiesIsDraftColumnCache !== null) return opportunitiesIsDraftColumnCache;
  try {
    const [row] = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'opportunities'
         AND COLUMN_NAME = 'is_draft'
       LIMIT 1`
    );
    opportunitiesIsDraftColumnCache = !!row?.ok;
  } catch {
    opportunitiesIsDraftColumnCache = false;
  }
  return opportunitiesIsDraftColumnCache;
}

function validateStagePercentSum(stages, probabilityMode) {
  if (probabilityMode !== 'stage') return;
  let sumOpen = 0;
  for (const s of stages) {
    const won = Number(s?.is_closed_won) === 1 || s?.is_closed_won === true;
    const lost = Number(s?.is_closed_lost) === 1 || s?.is_closed_lost === true;
    const p = Number(s?.progression_percent);
    if (won || lost) {
      if (won && Math.abs(p - 100) > 0.01) {
        const err = new Error('Closed-won stage must use 100% progression');
        err.status = 400;
        throw err;
      }
      continue;
    }
    if (Number.isFinite(p)) sumOpen += p;
  }
  if (Math.abs(sumOpen - 100) > 0.01) {
    const err = new Error('Open stage probabilities must total 100% for standard (per-stage) mode');
    err.status = 400;
    throw err;
  }
}

async function countOpportunitiesOnDeal(tenantId, dealId) {
  if (await opportunitiesTableHasIsDraftColumn()) {
    const [row] = await query(
      `SELECT COUNT(*) AS n FROM opportunities
       WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL AND COALESCE(is_draft,0) = 0`,
      [tenantId, dealId]
    );
    return Number(row?.n ?? 0);
  }
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM opportunities
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  return Number(row?.n ?? 0);
}

async function countOpportunitiesOnStage(tenantId, stageId) {
  if (await opportunitiesTableHasIsDraftColumn()) {
    const [row] = await query(
      `SELECT COUNT(*) AS n FROM opportunities
       WHERE tenant_id = ? AND stage_id = ? AND deleted_at IS NULL AND COALESCE(is_draft,0) = 0`,
      [tenantId, stageId]
    );
    return Number(row?.n ?? 0);
  }
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
    `SELECT d.id, d.tenant_id, d.name, d.description, d.is_active,
            d.owner_user_id, d.currency_code, d.probability_mode, d.goal_amount, d.goal_deals, d.visibility,
            d.created_at, d.updated_at
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
            is_closed_won, is_closed_lost, color_hex, created_at, updated_at
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
    `SELECT id, tenant_id, name, description, is_active,
            owner_user_id, currency_code, probability_mode, goal_amount, goal_deals, visibility,
            created_at, updated_at
     FROM deals
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  if (!row) return null;
  const stages = await query(
    `SELECT id, tenant_id, deal_id, name, sort_order, progression_percent,
            is_closed_won, is_closed_lost, color_hex, created_at, updated_at
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
  const boardParams = [tenantId, dealId, ...params];

  /** After migration 055; falls back if columns (e.g. owner_id) are not applied yet. */
  const sqlExtendedBase = `SELECT o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.updated_at,
            o.closing_date, o.expected_revenue, o.probability_percent,
            o.owner_id, ou.name AS owner_name,
            o.priority, o.amount_currency, o.value_type,
            COALESCE(o.probability_percent, s.progression_percent) AS effective_probability,
            ct.display_name, ct.type AS contact_type, ct.email, ct.company AS account_name
     FROM opportunities o
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     INNER JOIN deal_stages s ON s.id = o.stage_id AND s.tenant_id = o.tenant_id AND s.deleted_at IS NULL
     LEFT JOIN users ou ON ou.id = o.owner_id
     WHERE o.tenant_id = ? AND o.deal_id = ? AND o.deleted_at IS NULL
       AND (${ctWhere})`;

  const sqlExtendedDraft = `${sqlExtendedBase}
       AND COALESCE(o.is_draft,0) = 0
     ORDER BY o.updated_at DESC`;

  const sqlExtended = `${sqlExtendedBase}
     ORDER BY o.updated_at DESC`;

  const sqlLegacy = `SELECT o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.updated_at,
            NULL AS priority, NULL AS amount_currency, NULL AS value_type,
            ct.display_name, ct.type AS contact_type, ct.email, ct.company AS account_name
     FROM opportunities o
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     WHERE o.tenant_id = ? AND o.deal_id = ? AND o.deleted_at IS NULL
       AND (${ctWhere})
     ORDER BY o.updated_at DESC`;

  let opps;
  try {
    if (await opportunitiesTableHasIsDraftColumn()) {
      try {
        opps = await query(sqlExtendedDraft, boardParams);
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
          opps = await query(sqlExtended, boardParams);
        } else {
          throw err;
        }
      }
    } else {
      opps = await query(sqlExtended, boardParams);
    }
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
      opps = await query(sqlLegacy, boardParams);
    } else {
      throw err;
    }
  }

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

  /** Per-stage amounts grouped by effective currency (opp amount_currency or pipeline currency). No FX conversion. */
  const totalsSqlWithCurrency = `SELECT o.stage_id,
       UPPER(TRIM(COALESCE(NULLIF(TRIM(o.amount_currency), ''), d.currency_code, 'INR'))) AS currency_code,
       COALESCE(SUM(COALESCE(o.amount, 0)), 0) AS total_amount
     FROM opportunities o
     INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     WHERE o.tenant_id = ? AND o.deal_id = ? AND o.deleted_at IS NULL
       AND (${ctWhere})`;

  let totalsRows;
  try {
    if (await opportunitiesTableHasIsDraftColumn()) {
      try {
        totalsRows = await query(
          `${totalsSqlWithCurrency} AND COALESCE(o.is_draft,0) = 0
     GROUP BY o.stage_id, UPPER(TRIM(COALESCE(NULLIF(TRIM(o.amount_currency), ''), d.currency_code, 'INR')))`,
          boardParams
        );
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
          totalsRows = await query(
            `${totalsSqlWithCurrency}
     GROUP BY o.stage_id, UPPER(TRIM(COALESCE(NULLIF(TRIM(o.amount_currency), ''), d.currency_code, 'INR')))`,
            boardParams
          );
        } else {
          throw err;
        }
      }
    } else {
      totalsRows = await query(
        `${totalsSqlWithCurrency}
     GROUP BY o.stage_id, UPPER(TRIM(COALESCE(NULLIF(TRIM(o.amount_currency), ''), d.currency_code, 'INR')))`,
        boardParams
      );
    }
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
      const legacyTotals = `SELECT o.stage_id,
         UPPER(TRIM(COALESCE(d.currency_code, 'INR'))) AS currency_code,
         COALESCE(SUM(COALESCE(o.amount, 0)), 0) AS total_amount
         FROM opportunities o
         INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
         INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
         WHERE o.tenant_id = ? AND o.deal_id = ? AND o.deleted_at IS NULL
           AND (${ctWhere})
         GROUP BY o.stage_id, UPPER(TRIM(COALESCE(d.currency_code, 'INR')))`;
      totalsRows = await query(legacyTotals, boardParams);
    } else {
      throw err;
    }
  }

  const totalsLinesByStage = new Map();
  for (const r of totalsRows || []) {
    const sid = Number(r.stage_id);
    if (!totalsLinesByStage.has(sid)) totalsLinesByStage.set(sid, []);
    totalsLinesByStage.get(sid).push({
      currency_code: String(r.currency_code || 'INR').toUpperCase(),
      total_amount: Number(r.total_amount) || 0,
    });
  }

  const columns = deal.stages.map((s) => {
    const lines = totalsLinesByStage.get(Number(s.id)) || [];
    lines.sort((a, b) => String(a.currency_code).localeCompare(String(b.currency_code)));
    return {
      ...s,
      opportunities: byStage.get(Number(s.id)) || [],
      stage_amount_totals: lines,
    };
  });

  return {
    deal: {
      id: deal.id,
      name: deal.name,
      description: deal.description,
      is_active: deal.is_active,
      currency_code: deal.currency_code ?? 'INR',
      owner_user_id: deal.owner_user_id ?? null,
    },
    columns,
  };
}

function normalizeCurrencyCode(raw) {
  const t = trimStr(raw) || 'INR';
  const u = t.toUpperCase();
  if (u.length > 8) {
    const err = new Error('currency_code is too long');
    err.status = 400;
    throw err;
  }
  return u;
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

  let ownerUserId = null;
  if (payload?.owner_user_id !== undefined && payload?.owner_user_id !== null && payload?.owner_user_id !== '') {
    ownerUserId = await assertDealOwnerUserId(tenantId, payload.owner_user_id);
  }

  const currencyCode = normalizeCurrencyCode(payload?.currency_code);
  const probabilityMode = normalizeProbabilityMode(payload?.probability_mode);
  const visibility = normalizeVisibility(payload?.visibility);
  const goalAmount = parseOptionalMoneyGoal(payload?.goal_amount);
  const goalDeals = parseOptionalIntGoal(payload?.goal_deals);

  const stagesIn = Array.isArray(payload?.stages) ? payload.stages : null;
  if (stagesIn?.length) {
    validateStagePercentSum(stagesIn, probabilityMode);
    return createDealWithStagesTx(tenantId, user, {
      name,
      description,
      isActive,
      uid,
      ownerUserId,
      currencyCode,
      probabilityMode,
      visibility,
      goalAmount,
      goalDeals,
      stages: stagesIn,
    });
  }

  const result = await query(
    `INSERT INTO deals (
       tenant_id, name, description, is_active,
       owner_user_id, currency_code, probability_mode, goal_amount, goal_deals, visibility,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      description,
      isActive,
      ownerUserId,
      currencyCode,
      probabilityMode,
      goalAmount,
      goalDeals,
      visibility,
      uid,
      uid,
    ]
  );
  const dealId = result.insertId;
  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.created',
    summary: `Pipeline created: ${out?.name || name}`,
    entity_type: 'deal',
    entity_id: dealId,
    payload_json: { is_active: !!isActive },
  });
  await createAndDispatchNotification(tenantId, user?.id, {
    moduleKey: 'deals',
    eventType: 'deal_created',
    severity: 'normal',
    title: `Pipeline created: ${out?.name || name}`,
    body: 'A new deal pipeline has been created.',
    entityType: 'deal',
    entityId: dealId,
    ctaPath: '/deals',
    eventHash: `deal:create:${tenantId}:${dealId}`,
  });
  return out;
}

async function createDealWithStagesTx(tenantId, user, bundle) {
  const {
    name,
    description,
    isActive,
    uid,
    ownerUserId,
    currencyCode,
    probabilityMode,
    visibility,
    goalAmount,
    goalDeals,
    stages,
  } = bundle;

  const dealId = await withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const [ins] = await conn.execute(
        `INSERT INTO deals (
           tenant_id, name, description, is_active,
           owner_user_id, currency_code, probability_mode, goal_amount, goal_deals, visibility,
           created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          name,
          description,
          isActive,
          ownerUserId,
          currencyCode,
          probabilityMode,
          goalAmount,
          goalDeals,
          visibility,
          uid,
          uid,
        ]
      );
      const newDealId = ins.insertId;
      let sortOrder = 0;
      for (const st of stages) {
        const { name: stName, progression, isClosedWon, isClosedLost, colorHex } = validateStagePayload(st, false);
        await conn.execute(
          `INSERT INTO deal_stages (
             tenant_id, deal_id, name, sort_order, progression_percent, is_closed_won, is_closed_lost, color_hex,
             created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, newDealId, stName, sortOrder, progression, isClosedWon, isClosedLost, colorHex, uid, uid]
        );
        sortOrder += 1;
      }
      await conn.commit();
      return newDealId;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });

  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.created',
    summary: `Pipeline created: ${out?.name || name}`,
    entity_type: 'deal',
    entity_id: dealId,
    payload_json: { is_active: !!isActive, stages: stages.length },
  });
  await createAndDispatchNotification(tenantId, user?.id, {
    moduleKey: 'deals',
    eventType: 'deal_created',
    severity: 'normal',
    title: `Pipeline created: ${out?.name || name}`,
    body: 'A new deal pipeline has been created.',
    entityType: 'deal',
    entityId: dealId,
    ctaPath: '/deals',
    eventHash: `deal:create:${tenantId}:${dealId}`,
  });
  return out;
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
  if (payload.owner_user_id !== undefined) {
    if (payload.owner_user_id === null || payload.owner_user_id === '') {
      updates.push('owner_user_id = ?');
      params.push(null);
    } else {
      const oid = await assertDealOwnerUserId(tenantId, payload.owner_user_id);
      updates.push('owner_user_id = ?');
      params.push(oid);
    }
  }
  if (payload.currency_code !== undefined) {
    updates.push('currency_code = ?');
    params.push(normalizeCurrencyCode(payload.currency_code));
  }
  if (payload.probability_mode !== undefined) {
    updates.push('probability_mode = ?');
    params.push(normalizeProbabilityMode(payload.probability_mode));
  }
  if (payload.visibility !== undefined) {
    updates.push('visibility = ?');
    params.push(normalizeVisibility(payload.visibility));
  }
  if (payload.goal_amount !== undefined) {
    if (payload.goal_amount === null || payload.goal_amount === '') {
      updates.push('goal_amount = ?');
      params.push(null);
    } else {
      updates.push('goal_amount = ?');
      params.push(parseOptionalMoneyGoal(payload.goal_amount));
    }
  }
  if (payload.goal_deals !== undefined) {
    if (payload.goal_deals === null || payload.goal_deals === '') {
      updates.push('goal_deals = ?');
      params.push(null);
    } else {
      updates.push('goal_deals = ?');
      params.push(parseOptionalIntGoal(payload.goal_deals));
    }
  }
  if (!updates.length) return existing;

  updates.push('updated_by = ?');
  params.push(user?.id ?? null);
  params.push(tenantId, dealId);

  await query(`UPDATE deals SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`, params);
  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.updated',
    summary: `Pipeline updated: ${out?.name || existing.name}`,
    entity_type: 'deal',
    entity_id: dealId,
  });
  return out;
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
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.deleted',
    summary: `Pipeline deleted: ${existing.name}`,
    entity_type: 'deal',
    entity_id: dealId,
  });
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
  let colorHex = null;
  if (body?.color_hex !== undefined) {
    if (body.color_hex === null || body.color_hex === '') {
      colorHex = partial ? undefined : null;
    } else {
      const c = trimColorHex(body.color_hex);
      if (!c) {
        const err = new Error('color_hex must be a #RRGGBB value');
        err.status = 400;
        throw err;
      }
      colorHex = c;
    }
  } else if (partial) {
    colorHex = undefined;
  }
  return { name, progression, isClosedWon, isClosedLost, colorHex };
}

export async function createStage(tenantId, user, dealId, payload) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const { name, progression, isClosedWon, isClosedLost, colorHex } = validateStagePayload(payload, false);

  const [maxRow] = await query(
    `SELECT COALESCE(MAX(sort_order), -1) AS mx FROM deal_stages
     WHERE tenant_id = ? AND deal_id = ? AND deleted_at IS NULL`,
    [tenantId, dealId]
  );
  const sortOrder = Number(maxRow?.mx ?? -1) + 1;
  const uid = user?.id ?? null;

  await query(
    `INSERT INTO deal_stages (
       tenant_id, deal_id, name, sort_order, progression_percent, is_closed_won, is_closed_lost, color_hex,
       created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, dealId, name, sortOrder, progression, isClosedWon, isClosedLost, colorHex, uid, uid]
  );
  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.stage_created',
    summary: `Pipeline stage added: ${name} (${deal.name})`,
    entity_type: 'deal',
    entity_id: dealId,
    payload_json: { stage_name: name },
  });
  return out;
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
  if (payload.color_hex !== undefined) {
    if (payload.color_hex === null || payload.color_hex === '') {
      updates.push('color_hex = ?');
      params.push(null);
    } else {
      const c = trimColorHex(payload.color_hex);
      if (!c) {
        const err = new Error('color_hex must be a #RRGGBB value');
        err.status = 400;
        throw err;
      }
      updates.push('color_hex = ?');
      params.push(c);
    }
  }
  let stageSqlUpdated = false;
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
    stageSqlUpdated = true;
  }

  const out = await getDealById(tenantId, dealId);
  if (stageSqlUpdated) {
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'deal',
      event_type: 'pipeline.stage_updated',
      summary: `Pipeline stage updated: ${deal.name}`,
      entity_type: 'deal',
      entity_id: dealId,
      payload_json: { stage_id: stageId },
    });
  }
  return out;
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
  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.stages_reordered',
    summary: `Pipeline stages reordered: ${deal.name}`,
    entity_type: 'deal',
    entity_id: dealId,
  });
  return out;
}

export async function softDeleteStage(tenantId, user, dealId, stageId) {
  const deal = await getDealById(tenantId, dealId);
  if (!deal) return null;

  const [st] = await query(
    `SELECT id, name FROM deal_stages WHERE tenant_id = ? AND deal_id = ? AND id = ? AND deleted_at IS NULL`,
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
  const out = await getDealById(tenantId, dealId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'pipeline.stage_deleted',
    summary: `Pipeline stage deleted: ${st.name || 'Stage'} (${deal.name})`,
    entity_type: 'deal',
    entity_id: dealId,
    payload_json: { stage_id: stageId },
  });
  return out;
}
