import { query } from '../../config/db.js';
import {
  PLAN_BILLING_CYCLES,
  planHasAnySalePrice,
} from '../../utils/planCyclePricing.js';

const PLAN_TYPES = ['credit', 'unlimited'];
const PLAN_CATEGORIES = ['tenant_billing', 'credit_purchase'];
const BILLING_INTERVALS = [...PLAN_BILLING_CYCLES, 'one_time'];

const CYCLE_PRICE_DB_KEYS = [];
for (const iv of PLAN_BILLING_CYCLES) {
  CYCLE_PRICE_DB_KEYS.push(
    `price_${iv}_original_paise`,
    `price_${iv}_sale_paise`,
    `price_${iv}_discount_percent`
  );
}

function computeDiscountPercent(originalPaise, salePaise) {
  const orig = Number(originalPaise);
  const sale = Number(salePaise);
  if (!Number.isFinite(orig) || orig <= 0 || !Number.isFinite(sale) || sale >= orig) return null;
  return Math.min(100, Math.max(0, Math.round((1 - sale / orig) * 100)));
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseNonNegInt(v, fieldName) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${fieldName} must be a non-negative integer`);
    err.status = 400;
    throw err;
  }
  return Math.floor(n);
}

function validatePlanPayload(data, { partial = false } = {}) {
  const out = {};
  const has = (k) => data[k] !== undefined;

  if (has('code')) {
    const code = normalizeCode(data.code);
    if (!code) {
      const err = new Error('code is required');
      err.status = 400;
      throw err;
    }
    out.code = code;
  } else if (!partial) {
    const err = new Error('code is required');
    err.status = 400;
    throw err;
  }

  if (has('name')) {
    const name = String(data.name || '').trim();
    if (!name) {
      const err = new Error('name is required');
      err.status = 400;
      throw err;
    }
    out.name = name;
  } else if (!partial) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  if (has('description')) {
    out.description = data.description == null || data.description === '' ? null : String(data.description);
  }

  if (has('plan_category')) {
    const cat = String(data.plan_category);
    if (!PLAN_CATEGORIES.includes(cat)) {
      const err = new Error('plan_category must be tenant_billing or credit_purchase');
      err.status = 400;
      throw err;
    }
    out.plan_category = cat;
  } else if (!partial) {
    out.plan_category = 'tenant_billing';
  }

  if (has('plan_type')) {
    const planType = String(data.plan_type);
    if (!PLAN_TYPES.includes(planType)) {
      const err = new Error('plan_type must be credit or unlimited');
      err.status = 400;
      throw err;
    }
    out.plan_type = planType;
  } else if (!partial) {
    const err = new Error('plan_type is required');
    err.status = 400;
    throw err;
  }

  const category = out.plan_category ?? data.plan_category ?? 'tenant_billing';
  const planType = out.plan_type ?? data.plan_type;

  if (category === 'credit_purchase') {
    out.plan_type = 'credit';
  }

  if (has('billing_interval')) {
    const iv = data.billing_interval;
    if (iv === null || iv === '') {
      out.billing_interval = null;
    } else if (!BILLING_INTERVALS.includes(String(iv))) {
      const err = new Error('billing_interval must be month, quarter, semiannual, year, or one_time');
      err.status = 400;
      throw err;
    } else {
      out.billing_interval = String(iv);
    }
  }

  for (const key of ['original_price_paise', 'sale_price_paise', 'wallet_credit_paise']) {
    if (has(key)) {
      out[key] = parseNonNegInt(data[key], key);
    }
  }

  if (has('subscription_tier')) {
    const tier = data.subscription_tier;
    out.subscription_tier =
      tier == null || tier === '' ? null : String(tier).trim().slice(0, 64);
  }

  if (has('is_free_trial')) {
    out.is_free_trial =
      data.is_free_trial === true || data.is_free_trial === 1 || data.is_free_trial === '1' ? 1 : 0;
  }

  for (const key of CYCLE_PRICE_DB_KEYS) {
    if (has(key)) {
      if (key.endsWith('_discount_percent')) {
        const dp = data[key];
        if (dp === null || dp === '') {
          out[key] = null;
        } else {
          const n = Number(dp);
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            const err = new Error(`${key} must be between 0 and 100`);
            err.status = 400;
            throw err;
          }
          out[key] = Math.floor(n);
        }
      } else {
        out[key] = parseNonNegInt(data[key], key);
      }
    }
  }

  if (has('trial_duration_days')) {
    out.trial_duration_days = parseNonNegInt(data.trial_duration_days, 'trial_duration_days');
  }

  for (const key of ['included_wallet_credit_paise']) {
    if (has(key)) {
      out[key] = parseNonNegInt(data[key], key);
    }
  }

  for (const key of ['seat_limit_admins', 'seat_limit_managers', 'seat_limit_users']) {
    if (has(key)) {
      const v = data[key];
      if (v === null || v === '') {
        out[key] = null;
      } else {
        out[key] = parseNonNegInt(v, key);
      }
    }
  }

  if (has('features_html')) {
    const html = data.features_html;
    out.features_html = html == null || html === '' ? null : String(html);
  }

  if (has('features_json')) {
    const fj = data.features_json;
    if (fj == null || fj === '') {
      out.features_json = null;
    } else if (typeof fj === 'string') {
      try {
        const parsed = JSON.parse(fj);
        out.features_json = JSON.stringify(parsed);
      } catch {
        const err = new Error('features_json must be valid JSON');
        err.status = 400;
        throw err;
      }
    } else {
      out.features_json = JSON.stringify(fj);
    }
  }

  if (has('is_contact_sales')) {
    out.is_contact_sales =
      data.is_contact_sales === true || data.is_contact_sales === 1 || data.is_contact_sales === '1'
        ? 1
        : 0;
  }

  if (has('discount_percent')) {
    const dp = data.discount_percent;
    if (dp === null || dp === '') {
      out.discount_percent = null;
    } else {
      const n = Number(dp);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        const err = new Error('discount_percent must be between 0 and 100');
        err.status = 400;
        throw err;
      }
      out.discount_percent = Math.floor(n);
    }
  }

  if (has('sort_order')) {
    out.sort_order = parseNonNegInt(data.sort_order, 'sort_order') ?? 0;
  }

  if (has('is_active')) {
    out.is_active = data.is_active === true || data.is_active === 1 || data.is_active === '1' ? 1 : 0;
  }

  if (has('call_rate_paise_per_minute')) {
    out.call_rate_paise_per_minute = parseNonNegInt(
      data.call_rate_paise_per_minute,
      'call_rate_paise_per_minute'
    );
  }
  if (has('byo_platform_fee_paise_per_minute')) {
    out.byo_platform_fee_paise_per_minute = parseNonNegInt(
      data.byo_platform_fee_paise_per_minute,
      'byo_platform_fee_paise_per_minute'
    );
  }
  if (has('call_min_balance_paise')) {
    out.call_min_balance_paise = parseNonNegInt(data.call_min_balance_paise, 'call_min_balance_paise');
  }
  if (has('unlimited_minutes_cap_per_month')) {
    out.unlimited_minutes_cap_per_month = parseNonNegInt(
      data.unlimited_minutes_cap_per_month,
      'unlimited_minutes_cap_per_month'
    );
  }

  if (category === 'credit_purchase') {
    if (!partial) {
      if (!out.billing_interval && !data.billing_interval) {
        const err = new Error('billing_interval is required for credit purchase plans');
        err.status = 400;
        throw err;
      }
      if (out.sale_price_paise === undefined && data.sale_price_paise === undefined) {
        const err = new Error('sale_price_paise is required for credit purchase plans');
        err.status = 400;
        throw err;
      }
      if (out.wallet_credit_paise === undefined && data.wallet_credit_paise === undefined) {
        const err = new Error('wallet_credit_paise is required for credit purchase plans');
        err.status = 400;
        throw err;
      }
    }
    out.plan_type = 'credit';
    out.unlimited_minutes_cap_per_month = null;
    out.call_rate_paise_per_minute = null;
    out.byo_platform_fee_paise_per_minute = null;
    out.call_min_balance_paise = null;
  } else {
    const isFree =
      out.is_free_trial === 1 ||
      data.is_free_trial === 1 ||
      data.is_free_trial === true;
    const contactSales =
      out.is_contact_sales === 1 ||
      data.is_contact_sales === 1 ||
      data.is_contact_sales === true;

    if (!partial && isFree) {
      if (
        out.trial_duration_days === undefined &&
        data.trial_duration_days === undefined
      ) {
        const err = new Error('trial_duration_days is required for free trial plans');
        err.status = 400;
        throw err;
      }
    }

    if (!partial && !isFree && !contactSales) {
      const merged = { ...data, ...out };
      if (!planHasAnySalePrice(merged)) {
        const err = new Error(
          'Set at least one billing cycle sale price (monthly, quarterly, 6-month, or yearly)'
        );
        err.status = 400;
        throw err;
      }
    }

    out.billing_interval = null;

    if (!partial && planType === 'credit') {
      for (const key of [
        'call_rate_paise_per_minute',
        'byo_platform_fee_paise_per_minute',
        'call_min_balance_paise',
      ]) {
        if (out[key] === undefined && data[key] === undefined) {
          const err = new Error(`${key} is required for credit subscription plans`);
          err.status = 400;
          throw err;
        }
      }
      out.unlimited_minutes_cap_per_month = null;
    } else if (!partial && planType === 'unlimited') {
      if (
        out.unlimited_minutes_cap_per_month === undefined &&
        data.unlimited_minutes_cap_per_month === undefined &&
        !contactSales
      ) {
        const err = new Error(
          'unlimited_minutes_cap_per_month is required for unlimited plans (use 0 for no cap)'
        );
        err.status = 400;
        throw err;
      }
      out.call_rate_paise_per_minute = null;
      out.byo_platform_fee_paise_per_minute = null;
      out.call_min_balance_paise = null;
    }

    out.wallet_credit_paise = null;
  }

  if (out.original_price_paise != null && out.sale_price_paise != null && out.discount_percent == null) {
    out.discount_percent = computeDiscountPercent(out.original_price_paise, out.sale_price_paise);
  }

  return out;
}

export async function findById(id) {
  const [row] = await query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return row || null;
}

export async function findByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const [row] = await query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE code = ? AND deleted_at IS NULL
     LIMIT 1`,
    [c]
  );
  return row || null;
}

export async function findAll({
  search = '',
  planType = '',
  planCategory = '',
  includeInactive = false,
  page = 1,
  limit = 20,
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = ['deleted_at IS NULL'];
  const params = [];

  if (!includeInactive) {
    where.push('is_active = 1');
  }
  if (planType && PLAN_TYPES.includes(planType)) {
    where.push('plan_type = ?');
    params.push(planType);
  }
  if (planCategory && PLAN_CATEGORIES.includes(planCategory)) {
    where.push('plan_category = ?');
    params.push(planCategory);
  }
  if (search) {
    where.push('(name LIKE ? OR code LIKE ? OR description LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const whereSQL = `WHERE ${where.join(' AND ')}`;
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM telephony_billing_plans ${whereSQL}`,
    params
  );
  const total = countRow?.total ?? 0;

  const data = await query(
    `SELECT *
     FROM telephony_billing_plans
     ${whereSQL}
     ORDER BY sort_order ASC, name ASC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

export async function findAllActiveOptions({ planType = '', planCategory = 'tenant_billing' } = {}) {
  const where = ['deleted_at IS NULL', 'is_active = 1'];
  const params = [];
  if (planType && PLAN_TYPES.includes(planType)) {
    where.push('plan_type = ?');
    params.push(planType);
  }
  if (planCategory && PLAN_CATEGORIES.includes(planCategory)) {
    where.push('plan_category = ?');
    params.push(planCategory);
  }
  return query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE ${where.join(' AND ')}
     ORDER BY sort_order ASC, name ASC`,
    params
  );
}

async function nextSortOrderForCategory(planCategory) {
  const [maxRow] = await query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m
     FROM telephony_billing_plans
     WHERE deleted_at IS NULL AND plan_category = ?`,
    [planCategory]
  );
  return Number(maxRow?.m ?? 0) + 10;
}

/**
 * Set sort_order from drag-and-drop order (10, 20, 30, …).
 * All ids must belong to the same plan_category and match current list filters.
 */
export async function reorderPlans(
  { planCategory, planType = '', includeInactive = false, orderedIds },
  userId
) {
  if (!planCategory || !PLAN_CATEGORIES.includes(planCategory)) {
    const err = new Error('Invalid plan_category');
    err.status = 400;
    throw err;
  }

  const ids = [
    ...new Set(
      (Array.isArray(orderedIds) ? orderedIds : [])
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (!ids.length) {
    const err = new Error('ordered_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const where = ['deleted_at IS NULL', 'plan_category = ?'];
  const params = [planCategory];
  if (!includeInactive) {
    where.push('is_active = 1');
  }
  if (planType && PLAN_TYPES.includes(planType)) {
    where.push('plan_type = ?');
    params.push(planType);
  }

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM telephony_billing_plans WHERE ${where.join(' AND ')}`,
    params
  );
  const expectedTotal = Number(countRow?.total ?? 0);
  if (ids.length !== expectedTotal) {
    const err = new Error(
      'ordered_ids must include every plan in this list. Clear search and billing-type filters, then reorder.'
    );
    err.status = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT id FROM telephony_billing_plans
     WHERE ${where.join(' AND ')} AND id IN (${placeholders})`,
    [...params, ...ids]
  );
  if (rows.length !== ids.length) {
    const err = new Error('One or more plan ids are invalid for this category');
    err.status = 400;
    throw err;
  }

  let sortOrder = 10;
  for (const id of ids) {
    await query(
      `UPDATE telephony_billing_plans SET sort_order = ?, updated_by = ? WHERE id = ?`,
      [sortOrder, userId, id]
    );
    sortOrder += 10;
  }

  return findAll({
    planCategory,
    planType,
    includeInactive,
    page: 1,
    limit: Math.max(ids.length, 20),
  });
}

export async function create(data, userId) {
  const body = validatePlanPayload(data, { partial: false });
  const existing = await findByCode(body.code);
  if (existing) {
    const err = new Error('Plan code already exists');
    err.status = 409;
    throw err;
  }

  if (body.sort_order == null || body.sort_order === undefined || body.sort_order === 0) {
    body.sort_order = await nextSortOrderForCategory(body.plan_category ?? 'tenant_billing');
  }

  const result = await query(
    `INSERT INTO telephony_billing_plans (
       code, name, description, plan_type, plan_category, subscription_tier, is_free_trial,
       call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
       unlimited_minutes_cap_per_month, billing_interval, trial_duration_days,
       original_price_paise, sale_price_paise, discount_percent, wallet_credit_paise,
       price_month_original_paise, price_month_sale_paise, price_month_discount_percent,
       price_quarter_original_paise, price_quarter_sale_paise, price_quarter_discount_percent,
       price_semiannual_original_paise, price_semiannual_sale_paise, price_semiannual_discount_percent,
       price_year_original_paise, price_year_sale_paise, price_year_discount_percent,
       included_wallet_credit_paise, seat_limit_admins, seat_limit_managers, seat_limit_users,
       features_html, features_json, is_contact_sales,
       sort_order, is_active, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.code,
      body.name,
      body.description ?? null,
      body.plan_type,
      body.plan_category ?? 'tenant_billing',
      body.subscription_tier ?? null,
      body.is_free_trial ?? 0,
      body.call_rate_paise_per_minute ?? null,
      body.byo_platform_fee_paise_per_minute ?? null,
      body.call_min_balance_paise ?? null,
      body.unlimited_minutes_cap_per_month ?? null,
      body.billing_interval ?? null,
      body.trial_duration_days ?? null,
      body.original_price_paise ?? null,
      body.sale_price_paise ?? null,
      body.discount_percent ?? null,
      body.wallet_credit_paise ?? null,
      body.price_month_original_paise ?? null,
      body.price_month_sale_paise ?? null,
      body.price_month_discount_percent ?? null,
      body.price_quarter_original_paise ?? null,
      body.price_quarter_sale_paise ?? null,
      body.price_quarter_discount_percent ?? null,
      body.price_semiannual_original_paise ?? null,
      body.price_semiannual_sale_paise ?? null,
      body.price_semiannual_discount_percent ?? null,
      body.price_year_original_paise ?? null,
      body.price_year_sale_paise ?? null,
      body.price_year_discount_percent ?? null,
      body.included_wallet_credit_paise ?? null,
      body.seat_limit_admins ?? null,
      body.seat_limit_managers ?? null,
      body.seat_limit_users ?? null,
      body.features_html ?? null,
      body.features_json ?? null,
      body.is_contact_sales ?? 0,
      body.sort_order ?? 0,
      body.is_active ?? 1,
      userId,
      userId,
    ]
  );
  return findById(result.insertId);
}

export async function update(id, data, userId) {
  const current = await findById(id);
  if (!current) {
    const err = new Error('Telephony billing plan not found');
    err.status = 404;
    throw err;
  }

  const body = validatePlanPayload({ ...current, ...data }, { partial: true });
  const mergedCategory = body.plan_category ?? current.plan_category;
  const mergedType = body.plan_type ?? current.plan_type;

  if (mergedCategory === 'credit_purchase') {
    body.plan_type = 'credit';
    body.unlimited_minutes_cap_per_month = null;
    body.call_rate_paise_per_minute = null;
    body.byo_platform_fee_paise_per_minute = null;
    body.call_min_balance_paise = null;
  } else if (mergedType === 'credit') {
    body.unlimited_minutes_cap_per_month = null;
  } else if (mergedType === 'unlimited') {
    body.call_rate_paise_per_minute = null;
    body.byo_platform_fee_paise_per_minute = null;
    body.call_min_balance_paise = null;
  }

  if (body.original_price_paise != null && body.sale_price_paise != null) {
    body.discount_percent =
      body.discount_percent ??
      computeDiscountPercent(body.original_price_paise, body.sale_price_paise);
  }

  if (body.code && body.code !== current.code) {
    const dup = await findByCode(body.code);
    if (dup && Number(dup.id) !== Number(id)) {
      const err = new Error('Plan code already exists');
      err.status = 409;
      throw err;
    }
  }

  const sets = [];
  const params = [];
  for (const key of [
    'code',
    'name',
    'description',
    'plan_type',
    'plan_category',
    'subscription_tier',
    'is_free_trial',
    ...CYCLE_PRICE_DB_KEYS,
    'call_rate_paise_per_minute',
    'byo_platform_fee_paise_per_minute',
    'call_min_balance_paise',
    'unlimited_minutes_cap_per_month',
    'billing_interval',
    'trial_duration_days',
    'original_price_paise',
    'sale_price_paise',
    'discount_percent',
    'wallet_credit_paise',
    'included_wallet_credit_paise',
    'seat_limit_admins',
    'seat_limit_managers',
    'seat_limit_users',
    'features_html',
    'features_json',
    'is_contact_sales',
    'sort_order',
    'is_active',
  ]) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(body[key]);
    }
  }
  if (!sets.length) {
    return current;
  }
  sets.push('updated_by = ?');
  params.push(userId, id);
  await query(`UPDATE telephony_billing_plans SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export async function toggleActive(id, userId) {
  const row = await findById(id);
  if (!row) {
    const err = new Error('Telephony billing plan not found');
    err.status = 404;
    throw err;
  }
  const next = row.is_active === 1 ? 0 : 1;
  await query(
    `UPDATE telephony_billing_plans SET is_active = ?, updated_by = ? WHERE id = ?`,
    [next, userId, id]
  );
  return findById(id);
}

export async function remove(id, userId) {
  const row = await findById(id);
  if (!row) {
    const err = new Error('Telephony billing plan not found');
    err.status = 404;
    throw err;
  }
  const [assigned] = await query(
    `SELECT COUNT(*) AS c FROM tenants
     WHERE telephony_billing_plan_id = ? AND is_deleted = 0`,
    [id]
  );
  if (Number(assigned?.c) > 0) {
    const err = new Error(
      'Cannot delete plan while tenants are assigned. Deactivate it or reassign tenants first.'
    );
    err.status = 409;
    throw err;
  }
  await query(
    `UPDATE telephony_billing_plans
     SET deleted_at = NOW(), deleted_by = ?, is_active = 0, updated_by = ?
     WHERE id = ?`,
    [userId, userId, id]
  );
  return { success: true };
}

/** Apply plan template to tenant row (billing mode + subscription period + included wallet credit). */
export async function applyPlanToTenant(tenantId, planId, userId = null) {
  if (planId === null || planId === '' || planId === undefined) {
    await query(
      `UPDATE tenants SET telephony_billing_plan_id = NULL, updated_at = NOW() WHERE id = ?`,
      [tenantId]
    );
    return null;
  }
  const plan = await findById(planId);
  if (!plan) {
    const err = new Error('Telephony billing plan not found');
    err.status = 404;
    throw err;
  }
  if (plan.is_active !== 1) {
    const err = new Error('Cannot assign an inactive telephony billing plan');
    err.status = 400;
    throw err;
  }
  if (String(plan.plan_category) !== 'tenant_billing') {
    const err = new Error('Only tenant billing plans can be assigned to a tenant');
    err.status = 400;
    throw err;
  }

  const { activateFromAdminAssign } = await import('../billing/telephonySubscriptionService.js');
  await activateFromAdminAssign(tenantId, plan.id, userId);
  return plan;
}

function parseFeaturesJson(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializePlanForClient(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    plan_type: plan.plan_type,
    plan_category: plan.plan_category || 'tenant_billing',
    subscription_tier: plan.subscription_tier || null,
    is_free_trial: plan.is_free_trial === 1 ? 1 : 0,
    price_month_original_paise: plan.price_month_original_paise,
    price_month_sale_paise: plan.price_month_sale_paise,
    price_month_discount_percent: plan.price_month_discount_percent,
    price_quarter_original_paise: plan.price_quarter_original_paise,
    price_quarter_sale_paise: plan.price_quarter_sale_paise,
    price_quarter_discount_percent: plan.price_quarter_discount_percent,
    price_semiannual_original_paise: plan.price_semiannual_original_paise,
    price_semiannual_sale_paise: plan.price_semiannual_sale_paise,
    price_semiannual_discount_percent: plan.price_semiannual_discount_percent,
    price_year_original_paise: plan.price_year_original_paise,
    price_year_sale_paise: plan.price_year_sale_paise,
    price_year_discount_percent: plan.price_year_discount_percent,
    call_rate_paise_per_minute: plan.call_rate_paise_per_minute,
    byo_platform_fee_paise_per_minute: plan.byo_platform_fee_paise_per_minute,
    call_min_balance_paise: plan.call_min_balance_paise,
    unlimited_minutes_cap_per_month: plan.unlimited_minutes_cap_per_month,
    billing_interval: plan.billing_interval,
    trial_duration_days: plan.trial_duration_days,
    original_price_paise: plan.original_price_paise,
    sale_price_paise: plan.sale_price_paise,
    discount_percent: plan.discount_percent,
    wallet_credit_paise: plan.wallet_credit_paise,
    included_wallet_credit_paise: plan.included_wallet_credit_paise,
    seat_limit_admins: plan.seat_limit_admins,
    seat_limit_managers: plan.seat_limit_managers,
    seat_limit_users: plan.seat_limit_users,
    features_html: plan.features_html,
    features_json: parseFeaturesJson(plan.features_json),
    is_contact_sales: plan.is_contact_sales,
    sort_order: plan.sort_order,
    is_active: plan.is_active,
  };
}
