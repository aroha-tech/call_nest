import { query } from '../../config/db.js';

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
    const parsed = parseFiltersJSON(filters_json);
    filtersStored = Object.keys(parsed).length ? JSON.stringify(parsed) : '{}';
  }

  const result = await query(
    `INSERT INTO campaigns (tenant_id, name, type, manager_id, created_by, updated_by, filters_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      String(name).trim(),
      type,
      resolvedManagerId,
      user.id,
      user.id,
      filtersStored,
      statusNorm,
    ]
  );

  const [campaign] = await query(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [result.insertId, tenantId]
  );

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
      `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, tenantId]
    );
    return row || null;
  }

  if (user.role === 'manager') {
    const [row] = await query(
      `SELECT * FROM campaigns
       WHERE id = ? AND tenant_id = ? AND manager_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [id, tenantId, user.id]
    );
    return row || null;
  }

  const managerId = await getUserManagerId(tenantId, user.id);
  if (!managerId) return null;

  const [row] = await query(
    `SELECT c.*
     FROM campaigns c
     WHERE c.id = ? AND c.tenant_id = ?
       AND (c.manager_id IS NULL OR c.manager_id = ?)
       AND c.deleted_at IS NULL
       AND (
         c.type = 'filter'
         OR (
           c.type = 'static'
           AND EXISTS (
             SELECT 1 FROM contacts ct
             WHERE ct.tenant_id = c.tenant_id
               AND ct.campaign_id = c.id
               AND ct.assigned_user_id = ?
           )
         )
       )
     LIMIT 1`,
    [id, tenantId, managerId, user.id]
  );
  return row || null;
}

export async function listCampaigns(tenantId, user) {
  if (user.role === 'admin') {
    return query(
      `SELECT * FROM campaigns
       WHERE tenant_id = ? AND deleted_at IS NULL AND status IN ('active','paused')
       ORDER BY created_at DESC`,
      [tenantId]
    );
  }

  if (user.role === 'manager') {
    return query(
      `SELECT * FROM campaigns
       WHERE tenant_id = ? AND manager_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId, user.id]
    );
  }

  // agent
  const managerId = await getUserManagerId(tenantId, user.id);
  if (!managerId) return [];

  return query(
    `SELECT c.*
     FROM campaigns c
     WHERE c.tenant_id = ?
       AND (c.manager_id IS NULL OR c.manager_id = ?)
       AND c.deleted_at IS NULL
       AND (
         c.type = 'filter'
         OR (
           c.type = 'static'
           AND EXISTS (
             SELECT 1 FROM contacts ct
             WHERE ct.tenant_id = c.tenant_id
               AND ct.campaign_id = c.id
               AND ct.assigned_user_id = ?
           )
         )
       )
     ORDER BY c.created_at DESC`,
    [tenantId, managerId, user.id]
  );
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
  } = payload || {};

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (type !== undefined) {
    if (!['static', 'filter'].includes(type)) {
      const err = new Error('type must be static or filter');
      err.status = 400;
      throw err;
    }
    updates.push('type = ?');
    params.push(type);
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
      const parsed = parseFiltersJSON(filters_json);
      toStore = Object.keys(parsed).length ? JSON.stringify(parsed) : '{}';
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

  // Apply update
  if (updates.length > 0) {
    updates.push('updated_by = ?');
    params.push(user.id);
    params.push(campaignId, tenantId);
    await query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      params
    );
  }

  // Scenario 10: reassign campaign manager => reassign static campaign leads
  // We keep contacts.campaign_id unchanged, but move leads to the new manager's team.
  const updated = await query(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
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
  if (!agentManagerId) {
    const err = new Error('Agent must have manager_id assigned');
    err.status = 400;
    throw err;
  }

  const [campaign] = await query(
    `SELECT * FROM campaigns
     WHERE id = ? AND tenant_id = ? AND status = 'active' AND deleted_at IS NULL
       AND (manager_id IS NULL OR manager_id = ?)
     LIMIT 1`,
    [campaignId, tenantId, agentManagerId]
  );

  if (!campaign) return null;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const finalLimit = Math.floor(Number(limitNum)) || 20;
  const finalOffset = Math.floor(Number(offset)) || 0;

  const where = ['c.tenant_id = ?', 'c.assigned_user_id = ?'];
  const params = [tenantId, user.id];

  if (campaign.type === 'static') {
    where.push('c.campaign_id = ?');
    params.push(campaign.id);
  } else {
    const filters = parseFiltersJSON(campaign.filters_json);
    if (filters.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    if (filters.status_id) {
      where.push('c.status_id = ?');
      params.push(filters.status_id);
    }
    if (filters.source) {
      where.push('c.source = ?');
      params.push(filters.source);
    }
  }

  if (search) {
    where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSQL = `WHERE ${where.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM contacts c
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
        c.status_id,
        c.campaign_id,
        p.phone AS primary_phone
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
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

