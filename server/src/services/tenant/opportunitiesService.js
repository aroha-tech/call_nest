import { query } from '../../config/db.js';
import { getContactById, buildOwnershipWhere } from './contactsService.js';
import { getDealById } from './dealsService.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';

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

/** Shape after migration 055 (no 096 wizard columns). */
const OPP_SELECT_055 = `o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.lead_id,
            o.owner_id, o.closing_date, o.probability_percent, o.expected_revenue,
            o.lead_source, o.deal_type, o.next_step, o.description, o.campaign_id,
            NULL AS priority, NULL AS tags_json, NULL AS amount_currency, NULL AS value_type,
            __DRAFT_COL__,
            o.created_at, o.updated_at,
            d.name AS deal_name,
            s.name AS stage_name, s.sort_order AS stage_sort_order,
            s.progression_percent, s.is_closed_won, s.is_closed_lost,
            COALESCE(o.probability_percent, s.progression_percent) AS effective_probability,
            ou.name AS owner_name,
            camp.name AS campaign_name`;

/** Full shape including migration 096 columns. */
const OPP_SELECT_FULL = `o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.lead_id,
            o.owner_id, o.closing_date, o.probability_percent, o.expected_revenue,
            o.lead_source, o.deal_type, o.next_step, o.description, o.campaign_id,
            o.priority, o.tags_json, o.amount_currency, o.value_type,
            __DRAFT_COL__,
            o.created_at, o.updated_at,
            d.name AS deal_name,
            s.name AS stage_name, s.sort_order AS stage_sort_order,
            s.progression_percent, s.is_closed_won, s.is_closed_lost,
            COALESCE(o.probability_percent, s.progression_percent) AS effective_probability,
            ou.name AS owner_name,
            camp.name AS campaign_name`;

const OPP_JOINS_EXTENDED = `
     INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
     INNER JOIN deal_stages s ON s.id = o.stage_id AND s.tenant_id = o.tenant_id AND s.deleted_at IS NULL
     LEFT JOIN users ou ON ou.id = o.owner_id
     LEFT JOIN campaigns camp ON camp.id = o.campaign_id AND camp.tenant_id = o.tenant_id AND camp.deleted_at IS NULL`;

/** Same column aliases as EXTENDED when only migration 030 exists (no CRM columns on opportunities). */
const OPP_SELECT_LEGACY = `o.id, o.contact_id, o.deal_id, o.stage_id, o.title, o.amount, o.lead_id,
            NULL AS owner_id,
            NULL AS closing_date,
            NULL AS probability_percent,
            NULL AS expected_revenue,
            NULL AS lead_source,
            NULL AS deal_type,
            NULL AS next_step,
            NULL AS description,
            NULL AS campaign_id,
            NULL AS priority, NULL AS tags_json, NULL AS amount_currency, NULL AS value_type,
            o.created_at, o.updated_at,
            d.name AS deal_name,
            s.name AS stage_name, s.sort_order AS stage_sort_order,
            s.progression_percent, s.is_closed_won, s.is_closed_lost,
            s.progression_percent AS effective_probability,
            NULL AS owner_name,
            NULL AS campaign_name`;

const OPP_JOINS_LEGACY = `
     INNER JOIN deals d ON d.id = o.deal_id AND d.tenant_id = o.tenant_id AND d.deleted_at IS NULL
     INNER JOIN deal_stages s ON s.id = o.stage_id AND s.tenant_id = o.tenant_id AND s.deleted_at IS NULL`;

let opportunitySchemaExtendedCache = null;
let opportunityPriorityColumnCache = null;
let opportunityIsDraftColumnCache = null;

/**
 * Migration 055 adds owner_id, probability_percent, etc. Older DBs only have 030 — avoid ER_BAD_FIELD_ERROR.
 */
async function useExtendedOpportunitySchema() {
  if (opportunitySchemaExtendedCache !== null) return opportunitySchemaExtendedCache;
  try {
    const [row] = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'opportunities'
         AND COLUMN_NAME = 'owner_id'
       LIMIT 1`
    );
    opportunitySchemaExtendedCache = !!row?.ok;
  } catch {
    opportunitySchemaExtendedCache = false;
  }
  return opportunitySchemaExtendedCache;
}

/** Migration 096 — priority, tags_json, amount_currency, value_type */
async function useOpportunityPrioritySchema() {
  if (opportunityPriorityColumnCache !== null) return opportunityPriorityColumnCache;
  try {
    const [row] = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'opportunities'
         AND COLUMN_NAME = 'priority'
       LIMIT 1`
    );
    opportunityPriorityColumnCache = !!row?.ok;
  } catch {
    opportunityPriorityColumnCache = false;
  }
  return opportunityPriorityColumnCache;
}

async function useOpportunityIsDraftSchema() {
  if (opportunityIsDraftColumnCache !== null) return opportunityIsDraftColumnCache;
  try {
    const [row] = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'opportunities'
         AND COLUMN_NAME = 'is_draft'
       LIMIT 1`
    );
    opportunityIsDraftColumnCache = !!row?.ok;
  } catch {
    opportunityIsDraftColumnCache = false;
  }
  return opportunityIsDraftColumnCache;
}

async function getOpportunitySelectParts() {
  const draftSql = (await useOpportunityIsDraftSchema()) ? 'o.is_draft' : '0 AS is_draft';
  const has096 = await useOpportunityPrioritySchema();
  if (has096) {
    return { select: OPP_SELECT_FULL.replace('__DRAFT_COL__', draftSql), joins: OPP_JOINS_EXTENDED };
  }
  const has055 = await useExtendedOpportunitySchema();
  if (has055) {
    return { select: OPP_SELECT_055.replace('__DRAFT_COL__', draftSql), joins: OPP_JOINS_EXTENDED };
  }
  return { select: OPP_SELECT_LEGACY.replace('__DRAFT_COL__', draftSql), joins: OPP_JOINS_LEGACY };
}

async function assertTenantUserId(tenantId, userId) {
  if (userId == null) return null;
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid owner_id');
    err.status = 400;
    throw err;
  }
  const [r] = await query(
    `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
    [id, tenantId]
  );
  if (!r) {
    const err = new Error('owner_id must be a user in this organization');
    err.status = 400;
    throw err;
  }
  return id;
}

async function assertTenantCampaignId(tenantId, campaignId) {
  if (campaignId == null || campaignId === '') return null;
  const id = Number(campaignId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid campaign_id');
    err.status = 400;
    throw err;
  }
  const [r] = await query(
    `SELECT id FROM campaigns WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, tenantId]
  );
  if (!r) {
    const err = new Error('campaign_id not found');
    err.status = 400;
    throw err;
  }
  return id;
}

function parseOptionalProbability(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    const err = new Error('probability_percent must be between 0 and 100');
    err.status = 400;
    throw err;
  }
  return n;
}

function parseOptionalMoney(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) {
    const err = new Error('expected_revenue must be a number');
    err.status = 400;
    throw err;
  }
  return n;
}

function parseOptionalDateStr(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const t = String(v).trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const err = new Error('closing_date must be YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  return t;
}

function parseOptionalPriorityField(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).toLowerCase();
  if (!['low', 'medium', 'high'].includes(s)) {
    const err = new Error('priority must be low, medium, or high');
    err.status = 400;
    throw err;
  }
  return s;
}

function parseOptionalCurrencyCode(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const u = String(v).trim().toUpperCase();
  if (u.length > 8) {
    const err = new Error('amount_currency is too long');
    err.status = 400;
    throw err;
  }
  return u;
}

function normalizeTagsJsonPayload(payload) {
  if (payload?.tags_json !== undefined && payload.tags_json !== null) {
    if (typeof payload.tags_json === 'string') {
      try {
        const j = JSON.parse(payload.tags_json);
        if (!Array.isArray(j)) {
          const err = new Error('tags_json must be a JSON array');
          err.status = 400;
          throw err;
        }
        const cleaned = j.map((x) => String(x).trim()).filter(Boolean);
        return cleaned.length ? JSON.stringify(cleaned) : null;
      } catch (e) {
        if (e.status) throw e;
        const err = new Error('tags_json must be valid JSON');
        err.status = 400;
        throw err;
      }
    }
    if (Array.isArray(payload.tags_json)) {
      const cleaned = payload.tags_json.map((x) => String(x).trim()).filter(Boolean);
      return cleaned.length ? JSON.stringify(cleaned) : null;
    }
  }
  if (Array.isArray(payload?.tags)) {
    const cleaned = payload.tags.map((x) => String(x).trim()).filter(Boolean);
    return cleaned.length ? JSON.stringify(cleaned) : null;
  }
  if (typeof payload?.tags === 'string' && payload.tags.trim()) {
    const cleaned = payload.tags.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    return cleaned.length ? JSON.stringify(cleaned) : null;
  }
  return undefined;
}

export async function listOpportunitiesForContact(tenantId, user, contactId) {
  const contact = await getContactById(contactId, tenantId, user);
  if (!contact) return null;

  const { select, joins } = await getOpportunitySelectParts();
  const rows = await query(
    `SELECT ${select}
     FROM opportunities o
     ${joins}
     WHERE o.tenant_id = ? AND o.contact_id = ? AND o.deleted_at IS NULL
     ORDER BY d.name ASC, o.id ASC`,
    [tenantId, contactId]
  );
  return rows;
}

/** Active (non-draft) opportunity on same contact + pipeline — drafts excluded when is_draft exists. */
async function findDuplicateActiveNonDraft(tenantId, contactId, dealId, excludeOpportunityId = null) {
  const has097 = await useOpportunityIsDraftSchema();
  const ex = excludeOpportunityId != null ? Number(excludeOpportunityId) : null;
  if (has097) {
    let sql = `SELECT id FROM opportunities
     WHERE tenant_id = ? AND contact_id = ? AND deal_id = ? AND deleted_at IS NULL
       AND COALESCE(is_draft,0) = 0`;
    const params = [tenantId, contactId, dealId];
    if (ex && Number.isFinite(ex)) {
      sql += ` AND id != ?`;
      params.push(ex);
    }
    sql += ` LIMIT 1`;
    const [row] = await query(sql, params);
    return row?.id ?? null;
  }
  const [row] = await query(
    `SELECT id FROM opportunities
     WHERE tenant_id = ? AND contact_id = ? AND deal_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, contactId, dealId]
  );
  return row?.id ?? null;
}

async function findDraftOpportunityId(tenantId, contactId, dealId) {
  if (!(await useOpportunityIsDraftSchema())) return null;
  const [row] = await query(
    `SELECT id FROM opportunities
     WHERE tenant_id = ? AND contact_id = ? AND deal_id = ? AND deleted_at IS NULL
       AND COALESCE(is_draft,0) = 1
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

  const isDraft =
    payload?.is_draft === true ||
    payload?.is_draft === 1 ||
    String(payload?.is_draft || '').toLowerCase() === 'true';

  const activeDup = await findDuplicateActiveNonDraft(tenantId, contactId, dealId);
  if (activeDup) {
    if (isDraft) {
      const err = new Error('This contact already has an active deal on this pipeline');
      err.status = 400;
      throw err;
    }
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

  let ownerId;
  if (payload?.owner_id !== undefined && payload?.owner_id !== null && payload?.owner_id !== '') {
    ownerId = await assertTenantUserId(tenantId, payload.owner_id);
  } else {
    ownerId = await assertTenantUserId(tenantId, user?.id);
  }

  const closingDate = parseOptionalDateStr(payload?.closing_date) ?? null;

  let probabilityPercent = null;
  if (payload?.probability_percent !== undefined && payload?.probability_percent !== null && payload?.probability_percent !== '') {
    probabilityPercent = parseOptionalProbability(payload.probability_percent);
  }

  let expectedRevenue = null;
  if (payload?.expected_revenue !== undefined && payload?.expected_revenue !== null && payload?.expected_revenue !== '') {
    expectedRevenue = parseOptionalMoney(payload.expected_revenue);
  }

  const leadSource = trimStr(payload?.lead_source);
  const dealType = trimStr(payload?.deal_type);
  const nextStep = trimStr(payload?.next_step);
  const description = trimStr(payload?.description);

  let campaignId = null;
  if (payload?.campaign_id !== undefined && payload?.campaign_id !== null && payload?.campaign_id !== '') {
    campaignId = await assertTenantCampaignId(tenantId, payload.campaign_id);
  }

  const has096 = await useOpportunityPrioritySchema();
  const has055 = await useExtendedOpportunitySchema();
  const has097 = await useOpportunityIsDraftSchema();

  let priority = null;
  let tagsJson = null;
  let amountCurrency = null;
  let valueType = null;
  if (has096) {
    if (payload?.priority !== undefined && payload?.priority !== null && payload?.priority !== '') {
      priority = parseOptionalPriorityField(payload.priority);
    }
    const tagNorm = normalizeTagsJsonPayload(payload);
    if (tagNorm !== undefined) tagsJson = tagNorm;
    if (payload?.amount_currency !== undefined && payload?.amount_currency !== null && payload?.amount_currency !== '') {
      amountCurrency = parseOptionalCurrencyCode(payload.amount_currency);
    }
    valueType = trimStr(payload?.value_type);
  }

  const draftInsertVal = isDraft ? 1 : 0;

  if (isDraft && has097) {
    const draftOid = await findDraftOpportunityId(tenantId, contactId, dealId);
    if (draftOid) {
      return updateOpportunity(
        tenantId,
        user,
        draftOid,
        {
          stage_id: stageId,
          title,
          amount,
          owner_id: ownerId,
          closing_date: closingDate,
          probability_percent: probabilityPercent,
          expected_revenue: expectedRevenue,
          lead_source: leadSource,
          deal_type: dealType,
          next_step: nextStep,
          description,
          campaign_id: campaignId,
          priority,
          tags: payload?.tags,
          tags_json: payload?.tags_json,
          amount_currency: amountCurrency,
          value_type: valueType,
          is_draft: true,
        },
        { skipTenantActivityLog: true }
      );
    }
  }

  const uid = user?.id ?? null;
  let result;
  if (has096) {
    if (has097) {
      result = await query(
        `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         owner_id, closing_date, probability_percent, expected_revenue,
         lead_source, deal_type, next_step, description, campaign_id,
         priority, tags_json, amount_currency, value_type,
         is_draft,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          dealId,
          stageId,
          title,
          amount,
          leadId,
          ownerId,
          closingDate,
          probabilityPercent,
          expectedRevenue,
          leadSource,
          dealType,
          nextStep,
          description,
          campaignId,
          priority,
          tagsJson,
          amountCurrency,
          valueType,
          draftInsertVal,
          uid,
          uid,
        ]
      );
    } else {
      result = await query(
        `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         owner_id, closing_date, probability_percent, expected_revenue,
         lead_source, deal_type, next_step, description, campaign_id,
         priority, tags_json, amount_currency, value_type,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          dealId,
          stageId,
          title,
          amount,
          leadId,
          ownerId,
          closingDate,
          probabilityPercent,
          expectedRevenue,
          leadSource,
          dealType,
          nextStep,
          description,
          campaignId,
          priority,
          tagsJson,
          amountCurrency,
          valueType,
          uid,
          uid,
        ]
      );
    }
  } else if (has055) {
    if (has097) {
      result = await query(
        `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         owner_id, closing_date, probability_percent, expected_revenue,
         lead_source, deal_type, next_step, description, campaign_id,
         is_draft,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          dealId,
          stageId,
          title,
          amount,
          leadId,
          ownerId,
          closingDate,
          probabilityPercent,
          expectedRevenue,
          leadSource,
          dealType,
          nextStep,
          description,
          campaignId,
          draftInsertVal,
          uid,
          uid,
        ]
      );
    } else {
      result = await query(
        `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         owner_id, closing_date, probability_percent, expected_revenue,
         lead_source, deal_type, next_step, description, campaign_id,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          dealId,
          stageId,
          title,
          amount,
          leadId,
          ownerId,
          closingDate,
          probabilityPercent,
          expectedRevenue,
          leadSource,
          dealType,
          nextStep,
          description,
          campaignId,
          uid,
          uid,
        ]
      );
    }
  } else if (has097) {
    result = await query(
      `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         is_draft,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, contactId, dealId, stageId, title, amount, leadId, draftInsertVal, uid, uid]
    );
  } else {
    result = await query(
      `INSERT INTO opportunities (
         tenant_id, contact_id, deal_id, stage_id, title, amount, lead_id,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, contactId, dealId, stageId, title, amount, leadId, uid, uid]
    );
  }

  const oppOut = await getOpportunityById(tenantId, user, result.insertId);
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'opportunity.created',
    summary: `Opportunity created: ${oppOut?.title || title || '—'}`,
    entity_type: 'opportunity',
    entity_id: result.insertId,
    contact_id: contactId,
    payload_json: { deal_id: dealId, stage_id: stageId },
  });

  return oppOut;
}

export async function getOpportunityById(tenantId, user, opportunityId) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const ctWhere = whereSQL.replace(/\bc\./g, 'ct.');
  const { select, joins } = await getOpportunitySelectParts();
  const [row] = await query(
    `SELECT ${select}, ct.type AS contact_source_type
     FROM opportunities o
     INNER JOIN contacts ct ON ct.id = o.contact_id AND ct.tenant_id = o.tenant_id AND ct.deleted_at IS NULL
     ${joins}
     WHERE o.tenant_id = ? AND o.id = ? AND o.deleted_at IS NULL AND (${ctWhere})`,
    [tenantId, opportunityId, ...params]
  );
  return row ?? null;
}

export async function updateOpportunity(tenantId, user, opportunityId, payload, options = {}) {
  const { skipTenantActivityLog = false } = options;
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

  if (payload.owner_id !== undefined) {
    if (payload.owner_id === null || payload.owner_id === '') {
      updates.push('owner_id = ?');
      sqlParams.push(null);
    } else {
      const oid = await assertTenantUserId(tenantId, payload.owner_id);
      updates.push('owner_id = ?');
      sqlParams.push(oid);
    }
  }

  if (payload.closing_date !== undefined) {
    if (payload.closing_date === null || payload.closing_date === '') {
      updates.push('closing_date = ?');
      sqlParams.push(null);
    } else {
      const d = parseOptionalDateStr(payload.closing_date);
      updates.push('closing_date = ?');
      sqlParams.push(d ?? null);
    }
  }

  if (payload.probability_percent !== undefined) {
    if (payload.probability_percent === null || payload.probability_percent === '') {
      updates.push('probability_percent = ?');
      sqlParams.push(null);
    } else {
      const p = parseOptionalProbability(payload.probability_percent);
      updates.push('probability_percent = ?');
      sqlParams.push(p);
    }
  }

  if (payload.expected_revenue !== undefined) {
    if (payload.expected_revenue === null || payload.expected_revenue === '') {
      updates.push('expected_revenue = ?');
      sqlParams.push(null);
    } else {
      const er = parseOptionalMoney(payload.expected_revenue);
      updates.push('expected_revenue = ?');
      sqlParams.push(er);
    }
  }

  if (payload.lead_source !== undefined) {
    updates.push('lead_source = ?');
    sqlParams.push(trimStr(payload.lead_source));
  }
  if (payload.deal_type !== undefined) {
    updates.push('deal_type = ?');
    sqlParams.push(trimStr(payload.deal_type));
  }
  if (payload.next_step !== undefined) {
    updates.push('next_step = ?');
    sqlParams.push(trimStr(payload.next_step));
  }
  if (payload.description !== undefined) {
    updates.push('description = ?');
    sqlParams.push(trimStr(payload.description));
  }

  if (await useOpportunityIsDraftSchema()) {
    if (payload.is_draft !== undefined) {
      const nextIsDraft =
        payload.is_draft === true ||
        payload.is_draft === 1 ||
        String(payload.is_draft).toLowerCase() === 'true';
      const wasDraft = Number(existing.is_draft) === 1;
      if (wasDraft && !nextIsDraft) {
        const clash = await findDuplicateActiveNonDraft(
          tenantId,
          existing.contact_id,
          existing.deal_id,
          existing.id
        );
        if (clash) {
          const err = new Error('This contact already has an active deal on this pipeline');
          err.status = 400;
          throw err;
        }
      }
      updates.push('is_draft = ?');
      sqlParams.push(nextIsDraft ? 1 : 0);
    }
  }

  if (await useOpportunityPrioritySchema()) {
    if (payload.priority !== undefined) {
      if (payload.priority === null || payload.priority === '') {
        updates.push('priority = ?');
        sqlParams.push(null);
      } else {
        updates.push('priority = ?');
        sqlParams.push(parseOptionalPriorityField(payload.priority));
      }
    }
    if (payload.tags_json === null && payload.tags === undefined) {
      updates.push('tags_json = ?');
      sqlParams.push(null);
    } else if (payload.tags !== undefined || payload.tags_json !== undefined) {
      const tagNorm = normalizeTagsJsonPayload(payload);
      updates.push('tags_json = ?');
      sqlParams.push(tagNorm === undefined ? null : tagNorm);
    }
    if (payload.amount_currency !== undefined) {
      if (payload.amount_currency === null || payload.amount_currency === '') {
        updates.push('amount_currency = ?');
        sqlParams.push(null);
      } else {
        updates.push('amount_currency = ?');
        sqlParams.push(parseOptionalCurrencyCode(payload.amount_currency));
      }
    }
    if (payload.value_type !== undefined) {
      updates.push('value_type = ?');
      sqlParams.push(trimStr(payload.value_type));
    }
  }

  if (payload.campaign_id !== undefined) {
    if (payload.campaign_id === null || payload.campaign_id === '') {
      updates.push('campaign_id = ?');
      sqlParams.push(null);
    } else {
      const cid = await assertTenantCampaignId(tenantId, payload.campaign_id);
      updates.push('campaign_id = ?');
      sqlParams.push(cid);
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

  const refreshed = await getOpportunityById(tenantId, user, opportunityId);
  if (!skipTenantActivityLog) {
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'deal',
      event_type: 'opportunity.updated',
      summary: `Opportunity updated: ${refreshed?.title || existing.title || '—'}`,
      entity_type: 'opportunity',
      entity_id: Number(opportunityId),
      contact_id: existing.contact_id != null ? Number(existing.contact_id) : null,
      payload_json: { deal_id: existing.deal_id },
    });
  }
  return refreshed;
}

/**
 * When a call disposition is applied: ensure the contact has an opportunity on `dealId`
 * at `stageId` (create if missing, else update stage). Used from callsService; failures are non-fatal for the call.
 */
export async function applyOpportunityFromDisposition(tenantId, user, contactId, dealId, stageId) {
  const cid = Number(contactId);
  const did = Number(dealId);
  const sid = Number(stageId);
  if (!Number.isFinite(cid) || !Number.isFinite(did) || !Number.isFinite(sid)) {
    return { applied: false, reason: 'invalid_ids' };
  }

  const contact = await getContactById(cid, tenantId, user);
  if (!contact) return { applied: false, reason: 'no_contact' };

  try {
    assertCanEditOpportunity(user, contact);
  } catch {
    return { applied: false, reason: 'permission' };
  }

  const deal = await getDealById(tenantId, did);
  if (!deal?.is_active) return { applied: false, reason: 'inactive_deal' };

  const match = deal.stages?.find((s) => Number(s.id) === sid);
  if (!match) return { applied: false, reason: 'bad_stage' };

  const dupId = await findDuplicateActiveNonDraft(tenantId, cid, did);
  if (dupId) {
    await updateOpportunity(tenantId, user, dupId, { stage_id: sid }, { skipTenantActivityLog: true });
    return { applied: true, mode: 'updated', opportunity_id: dupId };
  }

  const row = await createOpportunity(tenantId, user, {
    contact_id: cid,
    deal_id: did,
    stage_id: sid,
    owner_id: user?.id,
  });
  return { applied: true, mode: 'created', opportunity_id: row?.id };
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
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'deal',
    event_type: 'opportunity.deleted',
    summary: `Opportunity removed: ${existing.title || '—'}`,
    entity_type: 'opportunity',
    entity_id: Number(opportunityId),
    contact_id: existing.contact_id != null ? Number(existing.contact_id) : null,
    payload_json: { deal_id: existing.deal_id },
  });
  return { id: opportunityId };
}
