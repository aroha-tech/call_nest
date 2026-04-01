import { query } from '../../config/db.js';
import { getContactById, buildOwnershipWhere } from './contactsService.js';
import { getDealById } from './dealsService.js';

function assertCanEditOpportunity(user, contact) {
  if (!contact) return;
  const perms = user?.permissions || [];
  if (perms.includes('pipelines.manage')) return;
  if (contact.type === 'lead' && perms.includes('leads.update')) return;
  if (contact.type === 'contact' && perms.includes('contacts.update')) return;
  const err = new Error('Permission denied');
  err.status = 403;
  throw err;
}

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

export async function listOpportunitiesForContact(tenantId, user, contactId) {
  const contact = await getContactById(contactId, tenantId, user);
  if (!contact) return null;

  const rows = await query(
    `SELECT o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.lead_id,
            o.created_at, o.updated_at,
            d.name AS deal_name,
            s.name AS stage_name, s.sort_order AS stage_sort_order,
            s.progression_percent, s.is_closed_won, s.is_closed_lost
     FROM opportunities o
     INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
     INNER JOIN deal_stages s ON s.id = o.stage_id AND s.tenant_id = o.tenant_id AND s.deleted_at IS NULL
     WHERE o.tenant_id = ? AND o.contact_id = ? AND o.deleted_at IS NULL
     ORDER BY d.name ASC, o.id ASC`,
    [tenantId, contactId]
  );
  return rows;
}

async function findDuplicateActive(tenantId, contactId, dealId) {
  const [row] = await query(
    `SELECT id FROM opportunities
     WHERE tenant_id = ? AND contact_id = ? AND deal_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, contactId, dealId]
  );
  return row?.id ?? null;
}

export async function createOpportunity(tenantId, user, payload) {
  const contactId = Number(payload?.contact_id);
  const dealId = Number(payload?.deal_id);
  if (!Number.isFinite(contactId) || !Number.isFinite(dealId)) {
    const err = new Error('contact_id and deal_id are required');
    err.status = 400;
    throw err;
  }

  const contact = await getContactById(contactId, tenantId, user);
  if (!contact) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  assertCanEditOpportunity(user, contact);

  const deal = await getDealById(tenantId, dealId);
  if (!deal || !deal.is_active) {
    const err = new Error('Pipeline not found or inactive');
    err.status = 400;
    throw err;
  }

  const dup = await findDuplicateActive(tenantId, contactId, dealId);
  if (dup) {
    const err = new Error('This contact already has an opportunity on this pipeline');
    err.status = 400;
    throw err;
  }

  let stageId = payload?.stage_id != null ? Number(payload.stage_id) : null;
  if (stageId && !Number.isFinite(stageId)) {
    const err = new Error('Invalid stage_id');
    err.status = 400;
    throw err;
  }
  if (!stageId) {
    const first = deal.stages?.[0];
    if (!first) {
      const err = new Error('Pipeline has no stages; add stages first');
      err.status = 400;
      throw err;
    }
    stageId = first.id;
  } else {
    const match = deal.stages?.find((s) => Number(s.id) === Number(stageId));
    if (!match) {
      const err = new Error('stage_id does not belong to this pipeline');
      err.status = 400;
      throw err;
    }
  }

  let leadId = payload?.lead_id != null ? Number(payload.lead_id) : null;
  if (leadId && !Number.isFinite(leadId)) {
    const err = new Error('Invalid lead_id');
    err.status = 400;
    throw err;
  }
  if (leadId) {
    const [lr] = await query(
      `SELECT id, type FROM contacts WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
      [tenantId, leadId]
    );
    if (!lr) {
      const err = new Error('lead_id contact not found');
      err.status = 400;
      throw err;
    }
  }

  const title = trimStr(payload?.title);
  const amount = payload?.amount != null && payload?.amount !== '' ? Number(payload.amount) : null;
  if (amount != null && Number.isNaN(amount)) {
    const err = new Error('amount must be a number');
    err.status = 400;
    throw err;
  }

  const uid = user?.id ?? null;
  const result = await query(
    `INSERT INTO opportunities (
       tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, contactId, dealId, stageId, title, amount, leadId, uid, uid]
  );

  return getOpportunityById(tenantId, user, result.insertId);
}

export async function getOpportunityById(tenantId, user, opportunityId) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const ctWhere = whereSQL.replace(/\bc\./g, 'ct.');
  const [row] = await query(
    `SELECT o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.lead_id,
            o.created_at, o.updated_at,
            d.name AS deal_name,
            s.name AS stage_name, s.sort_order AS stage_sort_order,
            s.progression_percent, s.is_closed_won, s.is_closed_lost
     FROM opportunities o
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
     INNER JOIN deal_stages s ON s.id = o.stage_id AND s.tenant_id = o.tenant_id AND s.deleted_at IS NULL
     WHERE o.tenant_id = ? AND o.id = ? AND o.deleted_at IS NULL AND (${ctWhere})`,
    [tenantId, opportunityId, ...params]
  );
  return row ?? null;
}

export async function updateOpportunity(tenantId, user, opportunityId, payload) {
  const existing = await getOpportunityById(tenantId, user, opportunityId);
  if (!existing) return null;

  const contact = await getContactById(existing.contact_id, tenantId, user);
  if (!contact) return null;
  assertCanEditOpportunity(user, contact);

  const deal = await getDealById(tenantId, existing.deal_id);
  if (!deal) return null;

  const updates = [];
  const sqlParams = [];

  if (payload.stage_id !== undefined) {
    const stageId = Number(payload.stage_id);
    if (!Number.isFinite(stageId)) {
      const err = new Error('Invalid stage_id');
      err.status = 400;
      throw err;
    }
    const match = deal.stages?.find((s) => Number(s.id) === Number(stageId));
    if (!match) {
      const err = new Error('stage_id does not belong to this pipeline');
      err.status = 400;
      throw err;
    }
    updates.push('stage_id = ?');
    sqlParams.push(stageId);
  }

  if (payload.title !== undefined) {
    updates.push('title = ?');
    sqlParams.push(trimStr(payload.title));
  }

  if (payload.amount !== undefined) {
    if (payload.amount === null || payload.amount === '') {
      updates.push('amount = ?');
      sqlParams.push(null);
    } else {
      const amount = Number(payload.amount);
      if (Number.isNaN(amount)) {
        const err = new Error('amount must be a number');
        err.status = 400;
        throw err;
      }
      updates.push('amount = ?');
      sqlParams.push(amount);
    }
  }

  if (!updates.length) return existing;

  updates.push('updated_by = ?');
  sqlParams.push(user?.id ?? null);
  sqlParams.push(tenantId, opportunityId);

  await query(
    `UPDATE opportunities SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    sqlParams
  );

  return getOpportunityById(tenantId, user, opportunityId);
}

export async function softDeleteOpportunity(tenantId, user, opportunityId) {
  const existing = await getOpportunityById(tenantId, user, opportunityId);
  if (!existing) return null;

  const contact = await getContactById(existing.contact_id, tenantId, user);
  if (!contact) return null;
  assertCanEditOpportunity(user, contact);

  const uid = user?.id ?? null;
  await query(
    `UPDATE opportunities SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [uid, uid, tenantId, opportunityId]
  );
  return { id: opportunityId };
}
