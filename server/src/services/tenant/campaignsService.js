import { query } from '../../config/db.js';
import { buildOwnershipWhere } from './contactsService.js';
import { appendCampaignFilterRules, normalizeFiltersToRules } from '../../utils/campaignFilterSql.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

async function getUserManagerId(tenantId, userId) {
  const [row] = await query(
    `SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
    [userId, tenantId]
  );
  return row?.manager_id ?? null;
}

function parseFiltersJSON(filtersJson) {
  if (!filtersJson) return {};
  if (typeof filtersJson === 'object') return filtersJson;
  try {
    return JSON.parse(filtersJson);
  } catch {
    return {};
  }
}

/** Nullable FK like contacts.manager_id */
function normalizeManagerId(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeOptionalUuid(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return s || null;
}

async function resolveCampaignTypeMasterId(value) {
  const id = normalizeOptionalUuid(value);
  if (!id) return null;
  const [row] = await query(
    `SELECT id FROM campaign_types_master WHERE id = ? AND is_deleted = 0 AND is_active = 1`,
    [id]
  );
  if (!row) {
    const err = new Error('Invalid campaign_type_master_id');
    err.status = 400;
    throw err;
  }
  return id;
}

async function resolveCampaignStatusMasterId(value) {
  const id = normalizeOptionalUuid(value);
  if (!id) return null;
  const [row] = await query(
    `SELECT id FROM campaign_statuses_master WHERE id = ? AND is_deleted = 0 AND is_active = 1`,
    [id]
  );
  if (!row) {
    const err = new Error('Invalid campaign_status_master_id');
    err.status = 400;
    throw err;
  }
  return id;
}

const CAMPAIGN_LIST_SELECT = `c.*,
  ctm.name AS campaign_type_name,
  csm.name AS campaign_status_name`;

const CAMPAIGN_LIST_JOIN = `campaigns c
  LEFT JOIN campaign_types_master ctm ON ctm.id = c.campaign_type_master_id AND ctm.is_deleted = 0
  LEFT JOIN campaign_statuses_master csm ON csm.id = c.campaign_status_master_id AND csm.is_deleted = 0`;

function parseCampaignListQuery(query = {}) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  const offset = (page - 1) * limit;
  const search = String(query.search ?? '').trim();
  const type = String(query.type ?? '').trim();
  const manager_id = query.manager_id;
  const show_paused =
    query.show_paused === true || query.show_paused === 'true' || query.show_paused === '1';
  const include_archived =
    query.include_archived === true ||
    query.include_archived === 'true' ||
    query.include_archived === '1';
  return { page, limit, offset, search, type, manager_id, show_paused, include_archived };
}

function totalPages(total, limit) {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / limit));
}

/**
 * mysql2 prepared statements often reject bound parameters for LIMIT/OFFSET (ER_WRONG_ARGUMENTS).
 * Use validated integer literals instead.
 */
function limitOffsetClause(q) {
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit)) || 20));
  const offset = Math.max(0, Math.floor(Number(q.offset)) || 0);
  return `LIMIT ${limit} OFFSET ${offset}`;
}

/**
 * Paginated campaign list with search and filters (admin: full; manager/agent: scoped).
 */
export async function listCampaigns(tenantId, user, query = {}) {
  const q = parseCampaignListQuery(query);
  const includeArchived = user.role === 'admin' ? q.include_archived : false;

  if (user.role === 'admin') {
    return listCampaignsAdmin(tenantId, q, includeArchived);
  }
  if (user.role === 'manager') {
    return listCampaignsManager(tenantId, user, q);
  }
  return listCampaignsAgent(tenantId, user, q);
}

async function listCampaignsAdmin(tenantId, q, includeArchived) {
  const where = ['c.tenant_id = ?'];
  const params = [tenantId];

  if (!includeArchived) {
    where.push('c.deleted_at IS NULL');
  }
  if (q.show_paused) {
    where.push("c.status IN ('active','paused')");
  } else {
    where.push("c.status = 'active'");
  }
  if (q.search) {
    where.push('c.name LIKE ?');
    params.push(`%${q.search}%`);
  }
  if (q.type === 'static' || q.type === 'filter') {
    where.push('c.type = ?');
    params.push(q.type);
  }
  if (q.manager_id === 'unassigned') {
    where.push('c.manager_id IS NULL');
  } else if (q.manager_id != null && q.manager_id !== '' && q.manager_id !== '__all__') {
    const mid = Number(q.manager_id);
    if (Number.isFinite(mid) && mid > 0) {
      where.push('c.manager_id = ?');
      params.push(mid);
    }
  }

  const whereSql = where.join(' AND ');
  const [countRow] = await query(`SELECT COUNT(*) AS c FROM campaigns c WHERE ${whereSql}`, params);
  const total = Number(countRow?.c ?? 0);

  const rows = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE ${whereSql} ORDER BY c.created_at DESC ${limitOffsetClause(q)}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: totalPages(total, q.limit),
    },
  };
}

async function listCampaignsManager(tenantId, user, q) {
  const where = [
    'c.tenant_id = ?',
    'c.deleted_at IS NULL',
    '(c.manager_id IS NULL OR c.manager_id = ?)',
  ];
  const params = [tenantId, user.id];

  if (q.show_paused) {
    where.push("c.status IN ('active','paused')");
  } else {
    where.push("c.status = 'active'");
  }
  if (q.search) {
    where.push('c.name LIKE ?');
    params.push(`%${q.search}%`);
  }
  if (q.type === 'static' || q.type === 'filter') {
    where.push('c.type = ?');
    params.push(q.type);
  }
  if (q.manager_id === 'unassigned') {
    where.push('c.manager_id IS NULL');
  } else if (q.manager_id != null && q.manager_id !== '' && q.manager_id !== '__all__') {
    const mid = Number(q.manager_id);
    if (Number.isFinite(mid) && mid > 0) {
      if (mid !== Number(user.id)) {
        return {
          data: [],
          pagination: { page: q.page, limit: q.limit, total: 0, totalPages: 1 },
        };
      }
      where.push('c.manager_id = ?');
      params.push(mid);
    }
  }

  const whereSql = where.join(' AND ');
  const [countRow] = await query(`SELECT COUNT(*) AS c FROM campaigns c WHERE ${whereSql}`, params);
  const total = Number(countRow?.c ?? 0);

  const rows = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE ${whereSql} ORDER BY c.created_at DESC ${limitOffsetClause(q)}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: totalPages(total, q.limit),
    },
  };
}

/**
 * Agents see: campaigns with no owning manager (tenant pool), plus campaigns owned by their manager.
 * Agents without a manager only see the unassigned (manager_id IS NULL) pool.
 */
async function listCampaignsAgent(tenantId, user, q) {
  const managerId = await getUserManagerId(tenantId, user.id);

  const where = ['c.tenant_id = ?', 'c.deleted_at IS NULL'];
  const params = [tenantId];

  if (managerId != null) {
    where.push('(c.manager_id IS NULL OR c.manager_id = ?)');
    params.push(managerId);
  } else {
    where.push('c.manager_id IS NULL');
  }

  if (q.show_paused) {
    where.push("c.status IN ('active','paused')");
  } else {
    where.push("c.status = 'active'");
  }
  if (q.search) {
    where.push('c.name LIKE ?');
    params.push(`%${q.search}%`);
  }
  if (q.type === 'static' || q.type === 'filter') {
    where.push('c.type = ?');
    params.push(q.type);
  }

  const whereSql = where.join(' AND ');
  const [countRow] = await query(
    `SELECT COUNT(*) AS c FROM campaigns c WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.c ?? 0);

  const rows = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE ${whereSql} ORDER BY c.created_at DESC ${limitOffsetClause(q)}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: totalPages(total, q.limit),
    },
  };
}

export async function createCampaign(tenantId, user, payload) {
  if (user.role !== 'admin') {
    const err = new Error('Only admin can create campaigns');
    err.status = 403;
    throw err;
  }

  const {
    name,
    type = 'static',
    manager_id,
    filters_json,
    status = 'active',
    description,
    campaign_type_master_id,
    campaign_status_master_id,
  } = payload || {};

  if (!name || !String(name).trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  if (!['static', 'filter'].includes(type)) {
    const err = new Error('type must be static or filter');
    err.status = 400;
    throw err;
  }

  const statusNorm = String(status || 'active').toLowerCase();
  if (!['active', 'paused'].includes(statusNorm)) {
    const err = new Error('status must be active or paused');
    err.status = 400;
    throw err;
  }

  const resolvedManagerId = normalizeManagerId(manager_id);
  if (resolvedManagerId != null) {
    const [managerRow] = await query(
      `SELECT id FROM users
       WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
      [resolvedManagerId, tenantId]
    );

    if (!managerRow) {
      const err = new Error('Invalid manager_id');
      err.status = 400;
      throw err;
    }
  }

  let filtersStored = filters_json ?? null;
  if (type === 'filter') {
    const rules = normalizeFiltersToRules(filters_json);
    if (rules.length === 0) {
      const err = new Error('Filter campaigns need at least one rule.');
      err.status = 400;
      throw err;
    }
    filtersStored = JSON.stringify({ version: 2, rules });
  }

  const desc =
    description !== undefined && description !== null && String(description).trim() !== ''
      ? String(description).trim()
      : null;
  const typeMasterId = await resolveCampaignTypeMasterId(campaign_type_master_id);
  const statusMasterId = await resolveCampaignStatusMasterId(campaign_status_master_id);

  const result = await query(
    `INSERT INTO campaigns (
       tenant_id, name, description, campaign_type_master_id, campaign_status_master_id,
       type, manager_id, created_by, updated_by, filters_json, status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      String(name).trim(),
      desc,
      typeMasterId,
      statusMasterId,
      type,
      resolvedManagerId,
      user.id,
      user.id,
      filtersStored,
      statusNorm,
    ]
  );

  const [campaign] = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE c.id = ? AND c.tenant_id = ? LIMIT 1`,
    [result.insertId, tenantId]
  );

  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'campaign',
    event_type: 'campaign.created',
    summary: `Campaign created: ${String(name).trim()}`,
    entity_type: 'campaign',
    entity_id: result.insertId,
    payload_json: { type, status: statusNorm },
  });

  return campaign;
}

/**
 * Single campaign by id (admin: any; manager: own campaigns; agent: visible campaigns only).
 */
export async function getCampaign(tenantId, user, campaignId) {
  const id = Number(campaignId);
  if (!id) return null;

  if (user.role === 'admin') {
    const [row] = await query(
      `SELECT ${CAMPAIGN_LIST_SELECT}
       FROM ${CAMPAIGN_LIST_JOIN}
       WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [id, tenantId]
    );
    return row || null;
  }

  if (user.role === 'manager') {
    const [row] = await query(
      `SELECT ${CAMPAIGN_LIST_SELECT}
       FROM ${CAMPAIGN_LIST_JOIN}
       WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL
         AND (c.manager_id IS NULL OR c.manager_id = ?)
       LIMIT 1`,
      [id, tenantId, user.id]
    );
    return row || null;
  }

  const managerId = await getUserManagerId(tenantId, user.id);
  if (managerId != null) {
    const [row] = await query(
      `SELECT ${CAMPAIGN_LIST_SELECT}
       FROM ${CAMPAIGN_LIST_JOIN}
       WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL
         AND (c.manager_id IS NULL OR c.manager_id = ?)
       LIMIT 1`,
      [id, tenantId, managerId]
    );
    return row || null;
  }
  const [row] = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL
       AND c.manager_id IS NULL
     LIMIT 1`,
    [id, tenantId]
  );
  return row || null;
}

export async function updateCampaign(tenantId, user, campaignId, payload) {
  if (user.role !== 'admin') {
    const err = new Error('Only admin can update campaigns');
    err.status = 403;
    throw err;
  }

  const campaign = await query(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [campaignId, tenantId]
  );

  const existing = campaign?.[0];
  if (!existing) return null;

  const {
    name,
    type,
    manager_id,
    filters_json,
    status,
    description,
    campaign_type_master_id,
    campaign_status_master_id,
  } = payload || {};

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (description !== undefined) {
    const desc =
      description !== null && String(description).trim() !== '' ? String(description).trim() : null;
    updates.push('description = ?');
    params.push(desc);
  }
  if (campaign_type_master_id !== undefined) {
    const tid = await resolveCampaignTypeMasterId(campaign_type_master_id);
    updates.push('campaign_type_master_id = ?');
    params.push(tid);
  }
  if (campaign_status_master_id !== undefined) {
    const sid = await resolveCampaignStatusMasterId(campaign_status_master_id);
    updates.push('campaign_status_master_id = ?');
    params.push(sid);
  }
  if (type !== undefined) {
    if (!['static', 'filter'].includes(type)) {
      const err = new Error('type must be static or filter');
      err.status = 400;
      throw err;
    }
    if (String(type) !== String(existing.type)) {
      const err = new Error('Campaign type cannot be changed after creation');
      err.status = 400;
      throw err;
    }
  }
  if (manager_id !== undefined) {
    const resolved = normalizeManagerId(manager_id);
    if (resolved != null) {
      const [mgr] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
        [resolved, tenantId]
      );
      if (!mgr) {
        const err = new Error('Invalid manager_id');
        err.status = 400;
        throw err;
      }
    }
    updates.push('manager_id = ?');
    params.push(resolved);
  }
  if (filters_json !== undefined) {
    const nextType = type !== undefined ? type : existing.type;
    let toStore = filters_json;
    if (nextType === 'filter') {
      const rules = normalizeFiltersToRules(filters_json);
      if (rules.length === 0) {
        const err = new Error('Filter campaigns need at least one rule.');
        err.status = 400;
        throw err;
      }
      toStore = JSON.stringify({ version: 2, rules });
    } else if (nextType === 'static') {
      toStore = null;
    }
    updates.push('filters_json = ?');
    params.push(toStore);
  }
  if (status !== undefined) {
    const st = String(status).toLowerCase();
    if (!['active', 'paused'].includes(st)) {
      const err = new Error('status must be active or paused');
      err.status = 400;
      throw err;
    }
    updates.push('status = ?');
    params.push(st);
  }

  if (type === 'static' && filters_json === undefined) {
    updates.push('filters_json = ?');
    params.push(null);
  } else if (type === 'filter' && filters_json === undefined) {
    updates.push('filters_json = ?');
    params.push(existing.filters_json ? existing.filters_json : '{}');
  }

  const touchParts = [];
  if (name !== undefined) touchParts.push('name');
  if (description !== undefined) touchParts.push('description');
  if (campaign_type_master_id !== undefined) touchParts.push('campaign_type');
  if (campaign_status_master_id !== undefined) touchParts.push('campaign_status');
  if (manager_id !== undefined) touchParts.push('manager');
  if (filters_json !== undefined) touchParts.push('filters');
  if (status !== undefined) touchParts.push('status');
  if (type === 'static' && filters_json === undefined) touchParts.push('filters');
  else if (type === 'filter' && filters_json === undefined) touchParts.push('filters');

  // Apply update
  let didUpdate = false;
  if (updates.length > 0) {
    updates.push('updated_by = ?');
    params.push(user.id);
    params.push(campaignId, tenantId);
    await query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      params
    );
    didUpdate = true;
  }

  // Scenario 10: reassign campaign manager => reassign static campaign leads
  // We keep contacts.campaign_id unchanged, but move leads to the new manager's team.
  const updated = await query(
    `SELECT ${CAMPAIGN_LIST_SELECT}
     FROM ${CAMPAIGN_LIST_JOIN}
     WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [campaignId, tenantId]
  );
  const updatedCampaign = updated?.[0];

  const managerChanged =
    manager_id !== undefined &&
    normalizeManagerId(manager_id) !== normalizeManagerId(existing.manager_id);

  if (managerChanged && updatedCampaign?.type === 'static') {
    // Realign contacts with campaign manager (null = unassigned pool); clear agents on change.
    await query(
      `UPDATE contacts
       SET manager_id = ?, assigned_user_id = NULL
       WHERE tenant_id = ? AND campaign_id = ?`,
      [updatedCampaign.manager_id, tenantId, campaignId]
    );
  }

  if (didUpdate && updatedCampaign) {
    const touched = [...new Set(touchParts)];
    const label = updatedCampaign.name || existing.name || '—';
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'campaign',
      event_type: 'campaign.updated',
      summary: `Campaign updated: ${label}`,
      entity_type: 'campaign',
      entity_id: Number(campaignId),
      payload_json: { touched },
    });
  }

  return updatedCampaign;
}

/**
 * Soft-delete campaign (admin only). Sets deleted_at / deleted_by; lists exclude deleted rows.
 */
export async function softDeleteCampaign(tenantId, user, campaignId) {
  if (user.role !== 'admin') {
    const err = new Error('Only admin can delete campaigns');
    err.status = 403;
    throw err;
  }

  const id = Number(campaignId);
  if (!id) return null;

  const [existing] = await query(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, tenantId]
  );
  if (!existing) return null;

  await query(
    `UPDATE campaigns
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [user.id, user.id, id, tenantId]
  );

  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'campaign',
    event_type: 'campaign.archived',
    summary: `Campaign archived: ${existing.name || '—'}`,
    entity_type: 'campaign',
    entity_id: id,
  });

  const [row] = await query(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId]
  );
  return row || null;
}

export async function openCampaignForAgent(tenantId, user, campaignId, { page = 1, limit = 20, search = '' } = {}) {
  if (user.role !== 'agent') {
    const err = new Error('Only agents can open campaigns');
    err.status = 403;
    throw err;
  }

  const agentManagerId = await getUserManagerId(tenantId, user.id);

  const scopeSql =
    agentManagerId != null
      ? '(manager_id IS NULL OR manager_id = ?)'
      : 'manager_id IS NULL';
  const scopeParams =
    agentManagerId != null
      ? [campaignId, tenantId, agentManagerId]
      : [campaignId, tenantId];

  const [campaign] = await query(
    `SELECT * FROM campaigns
     WHERE id = ? AND tenant_id = ? AND status = 'active' AND deleted_at IS NULL
       AND ${scopeSql}
     LIMIT 1`,
    scopeParams
  );

  if (!campaign) return null;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const finalLimit = Math.floor(Number(limitNum)) || 20;
  const finalOffset = Math.floor(Number(offset)) || 0;

  const where = ['c.tenant_id = ?', 'c.assigned_user_id = ?', 'c.deleted_at IS NULL'];
  const params = [tenantId, user.id];

  if (campaign.type === 'static') {
    where.push('c.campaign_id = ?');
    params.push(campaign.id);
  } else {
    appendCampaignFilterRules(where, params, campaign.filters_json);
  }

  if (search) {
    const q = `%${search}%`;
    where.push(
      `(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ? OR p.phone LIKE ? OR EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_s
        INNER JOIN contact_tags ct_s ON ct_s.id = cta_s.tag_id AND ct_s.tenant_id = cta_s.tenant_id
        WHERE cta_s.contact_id = c.id AND cta_s.tenant_id = c.tenant_id AND ct_s.deleted_at IS NULL AND ct_s.name LIKE ?
      ))`
    );
    params.push(q, q, q, q, q, q);
  }

  const whereSQL = `WHERE ${where.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     ${whereSQL}`,
    params
  );

  const total = countRow?.total ?? 0;

  const data = await query(
    `SELECT 
        c.id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        (SELECT GROUP_CONCAT(DISTINCT ct.name ORDER BY ct.name SEPARATOR ', ')
         FROM contact_tag_assignments cta
         INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
         WHERE cta.tenant_id = c.tenant_id AND cta.contact_id = c.id AND ct.deleted_at IS NULL
        ) AS tag_names,
        c.status_id,
        csm.name AS status_name,
        c.campaign_id,
        p.phone AS primary_phone
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0
     ${whereSQL}
     ORDER BY c.created_at DESC
     LIMIT ${finalLimit} OFFSET ${finalOffset}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: finalLimit,
      total,
      totalPages: Math.ceil(total / finalLimit) || 1,
    },
  };
}

/**
 * Preview contacts matching filter rules (respects list visibility like contacts list).
 */
export async function previewFilterCampaignLeads(tenantId, user, { filters_json, page = 1, limit = 20, search = '' } = {}) {
  const rules = normalizeFiltersToRules(filters_json);
  if (rules.length === 0) {
    const err = new Error('At least one filter rule is required for preview.');
    err.status = 400;
    throw err;
  }

  const { whereSQL, params } = buildOwnershipWhere(user);
  const where = [whereSQL];
  appendCampaignFilterRules(where, params, filters_json);

  if (search) {
    const q = `%${search}%`;
    where.push(
      `(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ? OR p.phone LIKE ? OR EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_s
        INNER JOIN contact_tags ct_s ON ct_s.id = cta_s.tag_id AND ct_s.tenant_id = cta_s.tenant_id
        WHERE cta_s.contact_id = c.id AND cta_s.tenant_id = c.tenant_id AND ct_s.deleted_at IS NULL AND ct_s.name LIKE ?
      ))`
    );
    params.push(q, q, q, q, q, q);
  }

  const finalWhere = `WHERE ${where.join(' AND ')}`;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const finalLimit = Math.floor(Number(limitNum)) || 20;
  const finalOffset = Math.floor(Number(offset)) || 0;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     ${finalWhere}`,
    params
  );

  const total = countRow?.total ?? 0;

  const data = await query(
    `SELECT 
        c.id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        (SELECT GROUP_CONCAT(DISTINCT ct.name ORDER BY ct.name SEPARATOR ', ')
         FROM contact_tag_assignments cta
         INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
         WHERE cta.tenant_id = c.tenant_id AND cta.contact_id = c.id AND ct.deleted_at IS NULL
        ) AS tag_names,
        c.status_id,
        csm.name AS status_name,
        c.campaign_id,
        cam.name AS campaign_name,
        p.phone AS primary_phone,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0
     LEFT JOIN campaigns cam
       ON cam.id = c.campaign_id AND cam.tenant_id = c.tenant_id AND cam.deleted_at IS NULL
     ${finalWhere}
     ORDER BY c.created_at DESC
     LIMIT ${finalLimit} OFFSET ${finalOffset}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: finalLimit,
      total,
      totalPages: Math.ceil(total / finalLimit) || 1,
    },
  };
}

