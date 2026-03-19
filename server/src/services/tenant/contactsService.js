import { query } from '../../config/db.js';
import { parse as parseCsv } from 'csv-parse/sync';

function assertUniquePhoneLabels(phones) {
  if (!Array.isArray(phones)) return;
  const seen = new Set();
  for (const p of phones) {
    const label = (p?.label || 'mobile').toLowerCase();
    if (seen.has(label)) {
      const err = new Error(`Only one phone number is allowed per label (${label})`);
      err.status = 400;
      throw err;
    }
    seen.add(label);
  }
}

function buildOwnershipWhere(user) {
  const clauses = ['c.tenant_id = ?', 'c.deleted_at IS NULL'];
  const params = [user.tenantId];

  if (user.role === 'agent') {
    clauses.push('c.assigned_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    clauses.push('c.manager_id = ?');
    params.push(user.id);
  }

  return { whereSQL: clauses.join(' AND '), params };
}

/**
 * Optional list/export filters. Values: undefined (omit), 'unassigned', or positive user id (number).
 * Agents ignore; managers only their team + valid agents; admins validated against tenant users.
 */
async function applyContactListFilters(tenantId, user, whereClauses, params, { filterManagerId, filterAssignedUserId }) {
  if (user.role === 'agent') {
    return;
  }

  if (user.role === 'manager') {
    if (filterManagerId !== undefined && filterManagerId !== 'unassigned') {
      if (Number(filterManagerId) !== Number(user.id)) {
        const err = new Error('Managers can only filter within their team');
        err.status = 403;
        throw err;
      }
    }
    if (filterManagerId === 'unassigned') {
      const err = new Error('Managers cannot filter by unassigned pool');
      err.status = 403;
      throw err;
    }

    if (filterAssignedUserId !== undefined && filterAssignedUserId !== 'unassigned') {
      const [ag] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0 AND manager_id = ?
         LIMIT 1`,
        [filterAssignedUserId, tenantId, user.id]
      );
      if (!ag) {
        const err = new Error('Invalid agent filter');
        err.status = 403;
        throw err;
      }
      whereClauses.push('c.assigned_user_id = ?');
      params.push(Number(filterAssignedUserId));
    } else if (filterAssignedUserId === 'unassigned') {
      whereClauses.push('c.assigned_user_id IS NULL');
    }
    return;
  }

  if (user.role === 'admin') {
    if (filterManagerId === 'unassigned') {
      whereClauses.push('c.manager_id IS NULL');
    } else if (filterManagerId !== undefined) {
      const [m] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0
         LIMIT 1`,
        [filterManagerId, tenantId]
      );
      if (!m) {
        const err = new Error('Invalid manager filter');
        err.status = 400;
        throw err;
      }
      whereClauses.push('c.manager_id = ?');
      params.push(Number(filterManagerId));
    }

    if (filterAssignedUserId === 'unassigned') {
      whereClauses.push('c.assigned_user_id IS NULL');
    } else if (filterAssignedUserId !== undefined) {
      const [ag] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0
         LIMIT 1`,
        [filterAssignedUserId, tenantId]
      );
      if (!ag) {
        const err = new Error('Invalid agent filter');
        err.status = 400;
        throw err;
      }
      whereClauses.push('c.assigned_user_id = ?');
      params.push(Number(filterAssignedUserId));
    }
  }
}

/**
 * When an agent's `users.manager_id` changes, set `contacts.manager_id` on every non-deleted row
 * assigned to that agent so team visibility matches (manager list + reporting).
 */
export async function syncContactsManagerForAgent(tenantId, agentUserId, newManagerId, updatedByUserId = null) {
  const mid = newManagerId === undefined || newManagerId === '' ? null : Number(newManagerId);
  await query(
    `UPDATE contacts
     SET manager_id = ?, updated_by = ?
     WHERE tenant_id = ? AND assigned_user_id = ? AND deleted_at IS NULL`,
    [mid, updatedByUserId, tenantId, agentUserId]
  );
}

export async function listContacts(
  tenantId,
  user,
  { search = '', page = 1, limit = 20, type, statusId, filterManagerId, filterAssignedUserId } = {}
) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;

  const { whereSQL, params } = buildOwnershipWhere(user);
  const whereClauses = [whereSQL];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }

  if (statusId) {
    whereClauses.push('c.status_id = ?');
    params.push(statusId);
  }

  if (search) {
    whereClauses.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  await applyContactListFilters(tenantId, user, whereClauses, params, {
    filterManagerId,
    filterAssignedUserId,
  });

  const finalWhere = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM contacts c
     ${finalWhere}`,
    params
  );
  const total = countRow.total;

  const data = await query(
    `SELECT 
        c.id,
        c.tenant_id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        c.manager_id,
        c.assigned_user_id,
        mgr.name AS manager_name,
        ag.name AS assigned_user_name,
        c.status_id,
        c.campaign_id,
        c.primary_phone_id,
        p.phone AS primary_phone,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN users mgr
       ON mgr.id = c.manager_id AND mgr.tenant_id = c.tenant_id AND mgr.is_deleted = 0
     LEFT JOIN users ag
       ON ag.id = c.assigned_user_id AND ag.tenant_id = c.tenant_id AND ag.is_deleted = 0
     ${finalWhere}
     ORDER BY c.created_at DESC
     LIMIT ${limitInt} OFFSET ${offsetInt}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function getContactById(id, tenantId, user) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const finalWhere = `${whereSQL} AND c.id = ?`;
  params.push(id);

  const [row] = await query(
    `SELECT 
        c.id,
        c.tenant_id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        c.manager_id,
        c.assigned_user_id,
        c.status_id,
        c.campaign_id,
        c.primary_phone_id,
        p.phone AS primary_phone,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     WHERE ${finalWhere}`,
    params
  );

  if (!row) return null;

  const phones = await query(
    `SELECT id, phone, label, is_primary, created_at
     FROM contact_phones
     WHERE tenant_id = ? AND contact_id = ?
     ORDER BY is_primary DESC, id ASC`,
    [tenantId, id]
  );

  return {
    ...row,
    phones,
  };
}

export async function createContact(tenantId, user, payload) {
  const {
    type = 'lead',
    first_name,
    last_name,
    display_name,
    email,
    source,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones = [],
    custom_fields = [],
    created_source,
  } = payload;

  assertUniquePhoneLabels(phones);

  // Determine ownership defaults for agent-created contacts
  let resolvedManagerId = manager_id || null;
  let resolvedAssignedUserId = assigned_user_id || null;

  if (user.role === 'agent') {
    resolvedAssignedUserId = user.id;
    if (!resolvedManagerId) {
      const [userRow] = await query(
        `SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
        [user.id, tenantId]
      );
      resolvedManagerId = userRow?.manager_id ?? null;
    }
  }

  // If a manager creates contacts/leads, default ownership to themselves
  // when manager_id is not explicitly provided.
  if (user.role === 'manager' && !resolvedManagerId) {
    resolvedManagerId = user.id;
  }

  const result = await query(
    `INSERT INTO contacts (
        tenant_id,
        type,
        first_name,
        last_name,
        display_name,
        email,
        source,
        manager_id,
        assigned_user_id,
        status_id,
        campaign_id,
        created_source,
        created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      type,
      first_name || null,
      last_name || null,
      display_name,
      email || null,
      source || null,
      resolvedManagerId,
      resolvedAssignedUserId,
      status_id || null,
      campaign_id || null,
      created_source || 'manual',
      user.id,
    ]
  );

  const contactId = result.insertId;

  // Insert phones
  let primaryPhoneId = null;
  if (Array.isArray(phones) && phones.length > 0) {
    for (const phone of phones) {
      if (!phone?.phone) continue;
      const phoneResult = await query(
        `INSERT INTO contact_phones (
           tenant_id,
           contact_id,
           phone,
           label,
           is_primary
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          phone.phone,
          phone.label || 'mobile',
          phone.is_primary ? 1 : 0,
        ]
      );
      if (phone.is_primary && !primaryPhoneId) {
        primaryPhoneId = phoneResult.insertId;
      }
    }
  }

  if (primaryPhoneId) {
    await query(
      `UPDATE contacts SET primary_phone_id = ? WHERE id = ? AND tenant_id = ?`,
      [primaryPhoneId, contactId, tenantId]
    );
  }

  // Insert custom fields
  if (Array.isArray(custom_fields) && custom_fields.length > 0) {
    for (const field of custom_fields) {
      if (!field?.field_id) continue;
      await query(
        `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [tenantId, contactId, field.field_id, field.value_text ?? null]
      );
    }
  }

  return getContactById(contactId, tenantId, user);
}

function normalizeOptionalUserId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchUserBrief(tenantId, userId) {
  const [row] = await query(
    `SELECT id, role, manager_id FROM users
     WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
    [userId, tenantId]
  );
  return row || null;
}

/**
 * Enforce CRM ownership rules on PATCH (scenarios 6–8).
 */
async function assertCanChangeContactOwnership(tenantId, user, payload, existing) {
  const { manager_id, assigned_user_id } = payload;

  if (user.role === 'admin') {
    if (manager_id !== undefined && manager_id !== null && manager_id !== '') {
      const mid = normalizeOptionalUserId(manager_id);
      if (mid != null) {
        const [mgr] = await query(
          `SELECT id FROM users
           WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
          [mid, tenantId]
        );
        if (!mgr) {
          const err = new Error('Invalid manager_id');
          err.status = 400;
          throw err;
        }
      }
    }
    if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
      const aid = normalizeOptionalUserId(assigned_user_id);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
      }
    }
    return;
  }

  if (user.role === 'agent') {
    if (manager_id !== undefined || assigned_user_id !== undefined) {
      const err = new Error('Agents cannot change manager or assignment');
      err.status = 403;
      throw err;
    }
    return;
  }

  if (user.role === 'manager') {
    if (manager_id !== undefined) {
      if (manager_id === null || manager_id === '') {
        const err = new Error('Managers cannot clear manager_id');
        err.status = 403;
        throw err;
      }
      const mid = normalizeOptionalUserId(manager_id);
      if (mid !== Number(user.id)) {
        const err = new Error('Managers can only set themselves as manager');
        err.status = 403;
        throw err;
      }
    }
    if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
      const aid = normalizeOptionalUserId(assigned_user_id);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
        if (Number(agent.manager_id) !== Number(user.id)) {
          const err = new Error('Managers can only assign agents in their team');
          err.status = 403;
          throw err;
        }
        if (existing.manager_id != null && Number(existing.manager_id) !== Number(user.id)) {
          const err = new Error('Contact is not in your team');
          err.status = 403;
          throw err;
        }
      }
    }
  }
}

export async function updateContact(id, tenantId, user, payload) {
  const existing = await getContactById(id, tenantId, user);
  if (!existing) {
    return null;
  }

  const {
    type,
    first_name,
    last_name,
    display_name,
    email,
    source,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones,
    custom_fields,
  } = payload;

  await assertCanChangeContactOwnership(tenantId, user, payload, existing);

  if (Array.isArray(phones)) {
    assertUniquePhoneLabels(phones);
  }

  const updates = [];
  const params = [];

  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (first_name !== undefined) {
    updates.push('first_name = ?');
    params.push(first_name || null);
  }
  if (last_name !== undefined) {
    updates.push('last_name = ?');
    params.push(last_name || null);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(display_name);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    params.push(email || null);
  }
  if (source !== undefined) {
    updates.push('source = ?');
    params.push(source || null);
  }
  if (status_id !== undefined) {
    updates.push('status_id = ?');
    params.push(status_id || null);
  }
  if (campaign_id !== undefined) {
    updates.push('campaign_id = ?');
    params.push(campaign_id || null);
  }
  if (manager_id !== undefined) {
    updates.push('manager_id = ?');
    params.push(manager_id || null);
  }
  if (assigned_user_id !== undefined) {
    updates.push('assigned_user_id = ?');
    params.push(assigned_user_id || null);
  }

  // Track who performed the update
  updates.push('updated_by = ?');
  params.push(user.id);

  if (updates.length > 0) {
    params.push(id, tenantId);
    await query(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );
  }

  // Update phones if provided (replace strategy)
  if (Array.isArray(phones)) {
    await query(
      `DELETE FROM contact_phones WHERE tenant_id = ? AND contact_id = ?`,
      [tenantId, id]
    );
    let primaryPhoneId = null;
    for (const phone of phones) {
      if (!phone?.phone) continue;
      const phoneResult = await query(
        `INSERT INTO contact_phones (
           tenant_id,
           contact_id,
           phone,
           label,
           is_primary
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          tenantId,
          id,
          phone.phone,
          phone.label || 'mobile',
          phone.is_primary ? 1 : 0,
        ]
      );
      if (phone.is_primary && !primaryPhoneId) {
        primaryPhoneId = phoneResult.insertId;
      }
    }
    if (primaryPhoneId) {
      await query(
        `UPDATE contacts SET primary_phone_id = ? WHERE id = ? AND tenant_id = ?`,
        [primaryPhoneId, id, tenantId]
      );
    } else {
      await query(
        `UPDATE contacts SET primary_phone_id = NULL WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );
    }
  }

  // Update custom fields if provided
  if (Array.isArray(custom_fields)) {
    for (const field of custom_fields) {
      if (!field?.field_id) continue;
      await query(
        `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [tenantId, id, field.field_id, field.value_text ?? null]
      );
    }
  }

  return getContactById(id, tenantId, user);
}

export async function softDeleteContact(id, tenantId, user, { deleted_source = 'manual' } = {}) {
  // Ensure user can access the contact (ownership enforced by getContactById)
  const existing = await getContactById(id, tenantId, user);
  if (!existing) return null;

  await query(
    `UPDATE contacts
     SET deleted_at = NOW(),
         deleted_by = ?,
         deleted_source = ?,
         updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [user.id, deleted_source || 'manual', user.id, id, tenantId]
  );

  // After delete it won't show in getContactById (deleted_at IS NULL), so return minimal
  return { id: Number(id), deleted_at: new Date().toISOString() };
}

export async function assignContacts(tenantId, user, payload) {
  const { contactIds, manager_id, assigned_user_id, campaign_id } = payload || {};

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    const err = new Error('contactIds must be a non-empty array');
    err.status = 400;
    throw err;
  }

  if (user.role === 'agent') {
    const err = new Error('Agents cannot assign or unassign contacts');
    err.status = 403;
    throw err;
  }

  const midProvided = manager_id !== undefined;
  const aidProvided = assigned_user_id !== undefined;
  const cidProvided = campaign_id !== undefined;

  if (!midProvided && !aidProvided && !cidProvided) {
    const err = new Error('Provide at least one of: manager_id, assigned_user_id, campaign_id');
    err.status = 400;
    throw err;
  }

  const normalizedMid = midProvided ? normalizeOptionalUserId(manager_id) : undefined;
  const normalizedAid = aidProvided ? normalizeOptionalUserId(assigned_user_id) : undefined;

  if (user.role === 'manager') {
    if (midProvided && normalizedMid !== null && Number(normalizedMid) !== Number(user.id)) {
      const err = new Error('Managers can only set themselves as owning manager');
      err.status = 403;
      throw err;
    }
    if (midProvided && normalizedMid === null) {
      const err = new Error('Managers cannot clear manager_id (use a tenant admin)');
      err.status = 403;
      throw err;
    }
  }

  const ids = [...new Set(contactIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) {
    const err = new Error('contactIds must contain valid numeric ids');
    err.status = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const contacts = await query(
    `SELECT id, manager_id, assigned_user_id FROM contacts
     WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [tenantId, ...ids]
  );

  if (contacts.length !== ids.length) {
    const err = new Error('One or more contacts were not found');
    err.status = 400;
    throw err;
  }

  if (user.role === 'manager') {
    const foreign = contacts.filter((c) => c.manager_id != null && Number(c.manager_id) !== Number(user.id));
    if (foreign.length > 0) {
      const err = new Error('Managers can only assign contacts in their own team');
      err.status = 403;
      throw err;
    }
  }

  if (midProvided && normalizedMid != null) {
    const [managerRow] = await query(
      `SELECT id FROM users
       WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
      [normalizedMid, tenantId]
    );
    if (!managerRow) {
      const err = new Error('Invalid manager_id');
      err.status = 400;
      throw err;
    }
  }

  if (midProvided && normalizedMid === null && user.role !== 'admin') {
    const err = new Error('Only admins can move contacts to the unassigned pool');
    err.status = 403;
    throw err;
  }

  let agentRow = null;
  if (aidProvided && normalizedAid != null) {
    agentRow = await fetchUserBrief(tenantId, normalizedAid);
    if (!agentRow || agentRow.role !== 'agent') {
      const err = new Error('assigned_user_id must be an agent');
      err.status = 400;
      throw err;
    }
    if (user.role === 'manager' && Number(agentRow.manager_id) !== Number(user.id)) {
      const err = new Error('Managers can only assign agents in their team');
      err.status = 403;
      throw err;
    }
  }

  const setClauses = [];
  const setParams = [];

  let clearAgentForManagerChange = false;
  if (midProvided) {
    if (normalizedMid === null) {
      clearAgentForManagerChange = true;
    } else {
      clearAgentForManagerChange = contacts.some(
        (c) => Number(c.manager_id || 0) !== Number(normalizedMid)
      );
    }
  }

  if (midProvided) {
    setClauses.push('manager_id = ?');
    setParams.push(normalizedMid);
  }

  if (aidProvided) {
    setClauses.push('assigned_user_id = ?');
    setParams.push(normalizedAid);
  } else if (clearAgentForManagerChange) {
    setClauses.push('assigned_user_id = ?');
    setParams.push(null);
  }

  // Assigning an agent without changing manager: contacts must share one team (or all pool) so we know which manager_id to set.
  // Unassigning (assigned_user_id: null) applies to any mix of managers — no same-manager rule.
  if (!midProvided && aidProvided && normalizedAid != null) {
    const mgrKeys = [...new Set(contacts.map((c) => (c.manager_id == null ? 'null' : String(c.manager_id))))];
    if (mgrKeys.length > 1) {
      const err = new Error(
        'Bulk agent assign requires all selected contacts to share the same manager (or all unassigned)'
      );
      err.status = 400;
      throw err;
    }
    const poolMgr = contacts[0].manager_id;

    if (poolMgr == null) {
      if (!setClauses.some((s) => s.startsWith('manager_id'))) {
        setClauses.unshift('manager_id = ?');
        setParams.unshift(agentRow.manager_id);
      }
    } else if (Number(agentRow.manager_id) !== Number(poolMgr)) {
      const err = new Error('Agent does not belong to the manager for these contacts');
      err.status = 400;
      throw err;
    }
  }

  if (midProvided && normalizedMid != null && aidProvided && normalizedAid != null) {
    if (Number(agentRow.manager_id) !== Number(normalizedMid)) {
      const err = new Error('Agent does not belong to the selected manager');
      err.status = 400;
      throw err;
    }
  }

  if (cidProvided) {
    setClauses.push('campaign_id = ?');
    setParams.push(campaign_id || null);
  }

  if (setClauses.length === 0) {
    const err = new Error('Nothing to update');
    err.status = 400;
    throw err;
  }

  setClauses.push('updated_by = ?');
  setParams.push(user.id);

  let whereSql = `tenant_id = ? AND id IN (${placeholders})`;
  let whereParams = [tenantId, ...ids];
  if (user.role === 'manager') {
    whereSql += ' AND (manager_id = ? OR manager_id IS NULL)';
    whereParams.push(user.id);
  }

  const updateResult = await query(
    `UPDATE contacts SET ${setClauses.join(', ')} WHERE ${whereSql}`,
    [...setParams, ...whereParams]
  );

  const affectedRows = updateResult?.affectedRows ?? 0;

  const updated = await query(
    `SELECT id, tenant_id, type, first_name, last_name, display_name, email, source, manager_id, assigned_user_id, status_id, campaign_id, created_at
     FROM contacts
     WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [tenantId, ...ids]
  );

  return { updatedCount: affectedRows, data: updated };
}

function normalizeHeader(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function toE164Phone(raw, defaultCountryCode = '+91') {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Excel sometimes exports long numbers as scientific notation (e.g. 9.19877E+11).
  // Convert that into a full integer string first, then normalize.
  const sciMatch = s.match(/^(\d+(?:\.\d+)?)e\+(\d+)$/i);
  const normalizedRaw = sciMatch
    ? (() => {
        const mantissa = sciMatch[1];
        const exp = parseInt(sciMatch[2], 10);
        const parts = mantissa.split('.');
        const intPart = parts[0] || '0';
        const fracPart = parts[1] || '';
        const digitsOnly = `${intPart}${fracPart}`.replace(/[^\d]/g, '');
        const decimals = fracPart.length;
        const zeros = Math.max(0, exp - decimals);
        return `${digitsOnly}${'0'.repeat(zeros)}`;
      })()
    : s;

  // Keep leading +, strip everything else non-digit
  const hasPlus = normalizedRaw.startsWith('+');
  const digits = normalizedRaw.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (hasPlus) return `+${digits}`;

  // If already looks like country+number without +, treat as full
  if (digits.length > 10) return `+${digits}`;

  const ccDigits = String(defaultCountryCode || '+91').replace(/[^\d]/g, '');
  if (!ccDigits) return `+${digits}`;
  return `+${ccDigits}${digits}`;
}

async function resolveContactStatusIdByName(tenantId, statusNameOrCode) {
  const s = String(statusNameOrCode || '').trim();
  if (!s) return null;
  const lowered = s.toLowerCase();

  // Exact code match first, then name match (case-insensitive)
  const rows = await query(
    `SELECT id
     FROM contact_status_master
     WHERE is_deleted = 0
       AND (LOWER(code) = ? OR LOWER(name) = ?)
     LIMIT 1`,
    [lowered, lowered]
  );
  return rows?.[0]?.id ?? null;
}

async function ensureCustomFieldDefinition(tenantId, { name, label, type }) {
  const safeName = normalizeHeader(name);
  const safeLabel = String(label || safeName).trim() || safeName;
  if (!safeName) return null;

  const existing = await query(
    `SELECT id, name, label
     FROM contact_custom_fields
     WHERE tenant_id = ? AND name = ?
     LIMIT 1`,
    [tenantId, safeName]
  );
  if (existing?.[0]?.id) return existing[0];

  try {
    const result = await query(
      `INSERT INTO contact_custom_fields (tenant_id, name, label, type, is_required, is_active)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [tenantId, safeName, safeLabel, type]
    );
    return { id: result.insertId, name: safeName, label: safeLabel };
  } catch (e) {
    // If another request created it concurrently, fetch again
    const again = await query(
      `SELECT id, name, label
       FROM contact_custom_fields
       WHERE tenant_id = ? AND name = ?
       LIMIT 1`,
      [tenantId, safeName]
    );
    return again?.[0] ?? null;
  }
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportContactsCsv(
  tenantId,
  user,
  {
    search = '',
    type,
    statusId,
    includeCustomFields = true,
    filterManagerId,
    filterAssignedUserId,
  } = {}
) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const whereClauses = [whereSQL];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }

  if (statusId) {
    whereClauses.push('c.status_id = ?');
    params.push(statusId);
  }

  if (search) {
    whereClauses.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  await applyContactListFilters(tenantId, user, whereClauses, params, {
    filterManagerId,
    filterAssignedUserId,
  });

  const finalWhere = `WHERE ${whereClauses.join(' AND ')}`;

  const contacts = await query(
    `SELECT 
        c.id,
        c.type,
        c.display_name,
        c.first_name,
        c.last_name,
        c.email,
        p.phone AS primary_phone,
        c.source,
        c.campaign_id,
        c.status_id,
        c.manager_id,
        c.assigned_user_id,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     ${finalWhere}
     ORDER BY c.created_at DESC`,
    params
  );

  let customFields = [];
  let valuesByContact = new Map();
  if (includeCustomFields) {
    customFields = await query(
      `SELECT id, name, label
       FROM contact_custom_fields
       WHERE tenant_id = ?
       ORDER BY id ASC`,
      [tenantId]
    );

    const ids = contacts.map((c) => c.id);
    if (ids.length > 0 && customFields.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await query(
        `SELECT contact_id, field_id, value_text
         FROM contact_custom_field_values
         WHERE tenant_id = ? AND contact_id IN (${placeholders})`,
        [tenantId, ...ids]
      );

      for (const r of rows) {
        const map = valuesByContact.get(r.contact_id) || new Map();
        map.set(r.field_id, r.value_text);
        valuesByContact.set(r.contact_id, map);
      }
    }
  }

  const baseHeaders = [
    'id',
    'type',
    'display_name',
    'first_name',
    'last_name',
    'email',
    'primary_phone',
    'source',
    'campaign_id',
    'status_id',
    'manager_id',
    'assigned_user_id',
    'created_source',
    'created_by',
    'updated_by',
    'created_at',
  ];

  const customHeaders = includeCustomFields
    ? customFields.map((f) => `cf:${f.name}`)
    : [];

  const headers = [...baseHeaders, ...customHeaders];
  const lines = [];

  // UTF-8 BOM helps Excel
  lines.push(`\uFEFF${headers.map(csvEscape).join(',')}`);

  for (const c of contacts) {
    const base = [
      c.id,
      c.type,
      c.display_name,
      c.first_name,
      c.last_name,
      c.email,
      c.primary_phone,
      c.source,
      c.campaign_id,
      c.status_id,
      c.manager_id,
      c.assigned_user_id,
      c.created_source,
      c.created_by,
      c.updated_by,
      c.created_at ? new Date(c.created_at).toISOString() : '',
    ];

    const cfMap = valuesByContact.get(c.id);
    const cfVals = includeCustomFields
      ? customFields.map((f) => (cfMap ? cfMap.get(f.id) ?? '' : ''))
      : [];

    lines.push([...base, ...cfVals].map(csvEscape).join(','));
  }

  return lines.join('\r\n');
}

export async function importContactsCsv(
  tenantId,
  user,
  { buffer, type = 'lead', mode = 'skip', created_source = 'import', defaultCountryCode = '+91', mapping } = {}
) {
  const csvText = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const records = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  const allFields = await query(
    `SELECT id, name, label
     FROM contact_custom_fields
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const byHeader = new Map();
  for (const f of allFields) {
    byHeader.set(normalizeHeader(f.name), f);
    byHeader.set(normalizeHeader(f.label), f);
  }

  // mapping: { [normalizedHeader]: { target: 'ignore' | 'first_name' | 'last_name' | 'email' | 'primary_phone' | 'source' | 'status' | 'custom', customFieldId?: number } }
  const headerMapping = mapping && typeof mapping === 'object' ? mapping : null;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  // Hard guard to prevent accidental huge imports
  if (records.length > 2000) {
    const err = new Error('CSV import supports up to 2000 rows per upload');
    err.status = 400;
    throw err;
  }

  for (let i = 0; i < records.length; i++) {
    const rowIndex = i + 2; // header row is 1
    const row = records[i] || {};

    try {
      const normalized = {};
      const originalByNormalized = {};
      for (const [k, v] of Object.entries(row)) {
        const nk = normalizeHeader(k);
        normalized[nk] = v;
        originalByNormalized[nk] = k;
      }

      // Apply manual mapping first (if provided)
      let first_name = null;
      let last_name = null;
      let email = null;
      let mappedSource = null;
      let mappedStatusName = null;

      const custom_fields = [];

      if (headerMapping) {
        for (const [nk, cfg] of Object.entries(headerMapping)) {
          const val = normalized[nk];
          if (val === undefined) continue;
          const target = cfg?.target;
          if (!target || target === 'ignore') continue;

          if (target === 'first_name') first_name = val;
          else if (target === 'last_name') last_name = val;
          else if (target === 'email') email = val;
          else if (target === 'source') mappedSource = val;
          else if (target === 'status') mappedStatusName = val;
          else if (target === 'custom' && cfg.customFieldId) {
            custom_fields.push({ field_id: cfg.customFieldId, value_text: val === null ? null : String(val) });
          }
        }
      }

      // Fallback auto-detection if not mapped
      if (!first_name) first_name = normalized.first_name || normalized.firstname || normalized.first || null;
      if (!last_name) last_name = normalized.last_name || normalized.lastname || normalized.last || null;
      if (!email) email = normalized.email || null;

      let display_name =
        normalized.display_name ||
        normalized.displayname ||
        null;

      if (!display_name || !String(display_name).trim()) {
        const composed = [first_name, last_name].filter(Boolean).join(' ').trim();
        display_name = composed || email || null;
      }

      // Phones: support phone / primary_phone / phone:<label> / phone_<label>
      const phones = [];
      const basePhone =
        normalized.primary_phone || normalized.phone || normalized.mobile || normalized.mobileno || normalized.mobile_no;
      const mobilePhone = normalized.mobile_phone || normalized.mobilephone || null;
      if (basePhone) {
        const e164 = toE164Phone(basePhone, defaultCountryCode);
        if (e164) {
          phones.push({ phone: e164, label: 'mobile', is_primary: 1 });
        }
      } else if (mobilePhone) {
        const e164 = toE164Phone(mobilePhone, defaultCountryCode);
        if (e164) {
          phones.push({ phone: e164, label: 'mobile', is_primary: 1 });
        }
      }

      for (const [k, v] of Object.entries(normalized)) {
        const m = k.match(/^phone[:_](.+)$/i);
        if (!m) continue;
        const label = String(m[1] || '').trim().toLowerCase() || 'mobile';
        const e164 = toE164Phone(v, defaultCountryCode);
        if (!e164) continue;
        phones.push({ phone: e164, label, is_primary: 0 });
      }

      // If multiple phones exist, ensure first one primary
      if (phones.length > 0) {
        phones[0].is_primary = 1;
      }

      if (!display_name || !String(display_name).trim()) {
        const err = new Error('display_name is required (or provide first_name/last_name/email)');
        err.status = 400;
        throw err;
      }

      if (!first_name && !email) {
        const err = new Error('Either first_name or email is required');
        err.status = 400;
        throw err;
      }

      const source = normalized.source || null;
      const providerSource = normalized.lead_source || normalized.leadsource || null;
      const finalSource = mappedSource || providerSource || source;

      const status_id = normalized.status_id || undefined; // status_id is CHAR(36)
      const providerStatusName = mappedStatusName || normalized.lead_status || normalized.leadstatus || normalized.status || null;
      const resolvedStatusId =
        status_id || (providerStatusName ? await resolveContactStatusIdByName(tenantId, providerStatusName) : null);
      const campaign_id = normalized.campaign_id ? Number(normalized.campaign_id) : undefined;
      const manager_id = normalized.manager_id ? Number(normalized.manager_id) : undefined;
      const assigned_user_id = normalized.assigned_user_id ? Number(normalized.assigned_user_id) : undefined;

      // Custom fields from headers: cf:<name> or direct name/label header
      for (const [k, v] of Object.entries(normalized)) {
        let header = k;
        if (header.startsWith('cf:')) header = header.slice(3);
        const field = byHeader.get(normalizeHeader(header));
        if (!field) continue;
        if (v === undefined) continue;
        const value_text = v === null ? null : String(v);
        custom_fields.push({ field_id: field.id, value_text });
      }

      // Provider mapping (common India real-estate lead sheets)
      // Auto-create common custom fields if missing so imports don't silently drop important columns.
      const providerColumnsToAutoCF = [
        { key: 'property', label: 'Property', type: 'text' },
        { key: 'budget', label: 'Budget', type: 'number' },
        { key: 'city', label: 'City', type: 'text' },
      ];

      for (const def of providerColumnsToAutoCF) {
        const val = normalized[def.key];
        if (val === undefined) continue;
        const existingField = byHeader.get(def.key);
        const field =
          existingField ||
          (await ensureCustomFieldDefinition(tenantId, { name: def.key, label: def.label, type: def.type }));
        if (!field?.id) continue;
        byHeader.set(def.key, field);
        byHeader.set(normalizeHeader(def.label), field);

        const value_text = val === null ? null : String(val);
        custom_fields.push({ field_id: field.id, value_text });
      }

      const primaryPhone = phones.find((p) => p.is_primary)?.phone || null;

      let existingId = null;
      if (primaryPhone) {
        const rows = await query(
          `SELECT c.id
           FROM contact_phones p
           JOIN contacts c
             ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
           WHERE p.tenant_id = ? AND p.phone = ? AND c.deleted_at IS NULL
           LIMIT 1`,
          [tenantId, primaryPhone]
        );
        existingId = rows?.[0]?.id ?? null;
      }

      if (existingId && mode !== 'update') {
        skipped++;
        continue;
      }

      if (existingId && mode === 'update') {
        const payload = {
          type,
          first_name,
          last_name,
          display_name,
          email,
          source: finalSource,
          ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
          ...(campaign_id !== undefined ? { campaign_id } : {}),
          ...(manager_id !== undefined ? { manager_id } : {}),
          ...(assigned_user_id !== undefined ? { assigned_user_id } : {}),
          ...(phones.length > 0 ? { phones } : {}),
          ...(custom_fields.length > 0 ? { custom_fields } : {}),
        };

        await updateContact(existingId, tenantId, user, payload);
        updated++;
        continue;
      }

      await createContact(tenantId, user, {
        type,
        first_name,
        last_name,
        display_name,
        email,
        source: finalSource,
        ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
        ...(campaign_id !== undefined ? { campaign_id } : {}),
        ...(manager_id !== undefined ? { manager_id } : {}),
        ...(assigned_user_id !== undefined ? { assigned_user_id } : {}),
        phones,
        custom_fields,
        created_source,
      });

      created++;
    } catch (e) {
      errors.push({
        row: rowIndex,
        error: e?.message || 'Import failed',
      });
    }
  }

  return {
    created,
    updated,
    skipped,
    failed: errors.length,
    errors,
  };
}

export async function previewContactsImportCsv(tenantId, { buffer } = {}) {
  const csvText = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const records = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (!records || records.length === 0) {
    return { columns: [], totalRows: 0, customFields: [] };
  }

  const firstRows = records.slice(0, 5);
  const headers = Object.keys(firstRows[0] || {});

  const customFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );

  const columns = headers.map((header) => {
    const normalized = normalizeHeader(header);
    const samples = [];
    for (const row of firstRows) {
      const v = row[header];
      if (v !== undefined && v !== null && String(v).trim()) {
        samples.push(String(v));
      }
    }

    let suggested = 'ignore';
    const n = normalized;
    if (['first_name', 'firstname', 'first'].includes(n)) suggested = 'first_name';
    else if (['last_name', 'lastname', 'last', 'surname'].includes(n)) suggested = 'last_name';
    else if (n === 'email' || n === 'email_id') suggested = 'email';
    else if (['mobile', 'mobile_no', 'mobileno', 'mobilephone', 'mobile_phone', 'phone', 'primary_phone'].includes(n))
      suggested = 'primary_phone';
    else if (n === 'lead_source' || n === 'leadsource' || n === 'source') suggested = 'source';
    else if (n === 'lead_status' || n === 'leadstatus' || n === 'status') suggested = 'status';
    else {
      // Try match a custom field by name/label
      const lower = n.toLowerCase();
      const cf =
        customFields.find((f) => normalizeHeader(f.name) === lower) ||
        customFields.find((f) => normalizeHeader(f.label) === lower);
      if (cf) {
        suggested = `custom:${cf.id}`;
      }
    }

    return {
      header,
      normalized,
      samples,
      suggested,
    };
  });

  return {
    totalRows: records.length,
    columns,
    customFields,
  };
}

