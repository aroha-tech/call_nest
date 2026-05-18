/** Shared form state helpers for platform telephony billing plans. */

import {
  paiseToRupeeInput,
  rupeeToPaise,
  safePaisePerMin,
} from './telephonyMoneyUtils';
import { blankCyclePricingForm, PLAN_BILLING_CYCLES } from './planCyclePricing';
import {
  PLAN_CATEGORY,
  SEGMENT_TO_CATEGORY,
  CATEGORY_TO_SEGMENT,
} from '../constants/telephonyProductTypes';

export { SEGMENT_TO_CATEGORY, CATEGORY_TO_SEGMENT };

export { formatPaiseAsInr, formatRupeeAmount, paiseToRupeeInput, rupeeToPaise, formatPaisePerMinHint } from './telephonyMoneyUtils';

export const PREVIEW_PLAN_ID = 0;

/** Which plan-features editor is active (only one is saved / shown to tenants). */
export const FEATURES_FORMAT = {
  HTML: 'html',
  JSON: 'json',
};

const CYCLE_INTERVALS = PLAN_BILLING_CYCLES.map((c) => c.value);

export function safeNumber(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function parseFeaturesJson(str) {
  if (!str?.trim()) return null;
  try {
    return JSON.parse(str.trim());
  } catch {
    return null;
  }
}

function rowHasFeaturesJson(row) {
  const fj = row?.features_json;
  if (fj == null || fj === '') return false;
  if (typeof fj === 'string') return fj.trim().length > 0;
  if (Array.isArray(fj)) return fj.length > 0;
  return true;
}

/** Pick HTML vs JSON editor when loading an existing plan. */
export function inferFeaturesFormat(row) {
  if (row?.features_html?.trim()) return FEATURES_FORMAT.HTML;
  if (rowHasFeaturesJson(row)) return FEATURES_FORMAT.JSON;
  return FEATURES_FORMAT.HTML;
}

/** Active features fields for preview / save (clears the non-selected format). */
export function resolveFeaturesFields(form) {
  const useJson = form.features_format === FEATURES_FORMAT.JSON;
  if (useJson) {
    const parsed = parseFeaturesJson(form.features_json);
    return {
      features_html: null,
      features_json: parsed,
      features_json_raw: form.features_json?.trim() ? form.features_json.trim() : null,
    };
  }
  return {
    features_html: form.features_html?.trim() ? form.features_html.trim() : null,
    features_json: null,
    features_json_raw: null,
  };
}

function cycleFieldsFromRow(row) {
  const out = {};
  for (const iv of CYCLE_INTERVALS) {
    for (const kind of ['original', 'sale']) {
      const key = `price_${iv}_${kind}_paise`;
      out[key] = row[key] == null ? '' : paiseToRupeeInput(row[key]);
    }
    const dk = `price_${iv}_discount_percent`;
    out[dk] = row[dk] == null ? '' : String(row[dk]);
    const ik = `included_wallet_credit_${iv}_paise`;
    out[ik] =
      row[ik] == null
        ? iv === 'month' && row.included_wallet_credit_paise != null
          ? paiseToRupeeInput(row.included_wallet_credit_paise)
          : ''
        : paiseToRupeeInput(row[ik]);
  }
  return out;
}

function cycleFieldsToPaise(form) {
  const out = {};
  for (const iv of CYCLE_INTERVALS) {
    for (const kind of ['original', 'sale']) {
      const key = `price_${iv}_${kind}_paise`;
      out[key] = rupeeToPaise(form[key]);
    }
    const dk = `price_${iv}_discount_percent`;
    out[dk] = safeNumber(form[dk]);
    const ik = `included_wallet_credit_${iv}_paise`;
    out[ik] = rupeeToPaise(form[ik]);
  }
  return out;
}

function rowToFormFields(row, category) {
  const base = {
    code: row.code || '',
    name: row.name || '',
    description: row.description || '',
    plan_type: row.plan_type || 'credit',
    plan_category: row.plan_category || category,
    billing_interval: row.billing_interval || 'month',
    original_price_paise:
      row.original_price_paise == null ? '' : paiseToRupeeInput(row.original_price_paise),
    sale_price_paise: row.sale_price_paise == null ? '' : paiseToRupeeInput(row.sale_price_paise),
    discount_percent: row.discount_percent == null ? '' : String(row.discount_percent),
    wallet_credit_paise:
      row.wallet_credit_paise == null ? '' : paiseToRupeeInput(row.wallet_credit_paise),
    gst_percent: row.gst_percent == null ? '18' : String(row.gst_percent),
    prices_include_gst: row.prices_include_gst !== 0 && row.prices_include_gst !== false,
    is_active: row.is_active === 1 || row.is_active === true,
  };
  if (category === PLAN_CATEGORY.CREDIT_TOP_UP) {
    return { ...base, billing_interval: 'one_time' };
  }
  if (category === PLAN_CATEGORY.SEAT_ADD_ON) {
    return {
      ...base,
      billing_interval: 'one_time',
      seat_role: row.seat_role || 'agent',
      includes_unlimited_channels:
        row.includes_unlimited_channels === 1 || row.includes_unlimited_channels === true,
    };
  }
  return {
    ...base,
    ...cycleFieldsFromRow(row),
    subscription_tier: row.subscription_tier || '',
    is_free_trial: row.is_free_trial === 1 || row.is_free_trial === true,
    trial_duration_days: row.trial_duration_days == null ? '' : String(row.trial_duration_days),
    included_wallet_credit_paise:
      row.included_wallet_credit_paise == null
        ? ''
        : paiseToRupeeInput(row.included_wallet_credit_paise),
    seat_limit_admins: row.seat_limit_admins == null ? '' : String(row.seat_limit_admins),
    seat_limit_managers: row.seat_limit_managers == null ? '' : String(row.seat_limit_managers),
    seat_limit_agents:
      row.seat_limit_agents == null
        ? row.seat_limit_users == null
          ? ''
          : String(row.seat_limit_users)
        : String(row.seat_limit_agents),
    seat_limit_channels:
      row.seat_limit_channels == null ? '' : String(row.seat_limit_channels),
    features_format: inferFeaturesFormat(row),
    features_html: row.features_html || '',
    features_json: row.features_json
      ? typeof row.features_json === 'string'
        ? row.features_json
        : JSON.stringify(row.features_json, null, 2)
      : '',
    is_contact_sales: row.is_contact_sales === 1 || row.is_contact_sales === true,
    call_rate_paise_per_minute:
      row.call_rate_paise_per_minute == null ? '' : String(row.call_rate_paise_per_minute),
    byo_platform_fee_paise_per_minute:
      row.byo_platform_fee_paise_per_minute == null
        ? ''
        : String(row.byo_platform_fee_paise_per_minute),
    call_min_balance_paise:
      row.call_min_balance_paise == null ? '' : paiseToRupeeInput(row.call_min_balance_paise),
    unlimited_minutes_cap_per_month:
      row.unlimited_minutes_cap_per_month == null
        ? ''
        : String(row.unlimited_minutes_cap_per_month),
  };
}

export function blankForm(category) {
  const base = {
    code: '',
    name: '',
    description: '',
    plan_type: 'credit',
    plan_category: category,
    billing_interval: 'month',
    original_price_paise: '',
    sale_price_paise: '',
    discount_percent: '',
    wallet_credit_paise: '',
    gst_percent: '18',
    prices_include_gst: true,
    is_active: true,
  };
  if (category === PLAN_CATEGORY.CREDIT_TOP_UP) {
    return { ...base, billing_interval: 'one_time' };
  }
  if (category === PLAN_CATEGORY.SEAT_ADD_ON) {
    return {
      ...base,
      billing_interval: 'one_time',
      seat_role: 'agent',
      includes_unlimited_channels: false,
    };
  }
  return {
    ...base,
    ...blankCyclePricingForm(),
    subscription_tier: '',
    is_free_trial: false,
    trial_duration_days: '',
    included_wallet_credit_paise: '',
    seat_limit_admins: '',
    seat_limit_managers: '',
    seat_limit_agents: '',
    seat_limit_channels: '',
    features_format: FEATURES_FORMAT.HTML,
    features_html: '',
    features_json: '',
    is_contact_sales: false,
    call_rate_paise_per_minute: '',
    byo_platform_fee_paise_per_minute: '',
    call_min_balance_paise: '',
    unlimited_minutes_cap_per_month: '',
  };
}

export function planToForm(row, category) {
  if (!row) return blankForm(category);
  return rowToFormFields(row, category);
}

function formRupeeFieldsToPaise(form) {
  return {
    original_price_paise: rupeeToPaise(form.original_price_paise),
    sale_price_paise: rupeeToPaise(form.sale_price_paise),
    wallet_credit_paise: rupeeToPaise(form.wallet_credit_paise),
    included_wallet_credit_paise: rupeeToPaise(form.included_wallet_credit_paise),
    call_min_balance_paise: rupeeToPaise(form.call_min_balance_paise),
  };
}

/** Plan-shaped object for live tenant preview (API expects paise). */
export function formToPreviewPlan(form, editing) {
  const id = editing?.id ?? PREVIEW_PLAN_ID;
  const features = resolveFeaturesFields(form);
  const money = formRupeeFieldsToPaise(form);
  const cycles = cycleFieldsToPaise(form);

  return {
    id,
    code: form.code || 'draft_plan',
    name: form.name?.trim() || 'Untitled plan',
    description: form.description || null,
    plan_type: form.plan_type || 'credit',
    plan_category: form.plan_category,
    billing_interval:
      form.plan_category === PLAN_CATEGORY.CREDIT_TOP_UP ||
      form.plan_category === PLAN_CATEGORY.SEAT_ADD_ON
        ? 'one_time'
        : form.billing_interval || 'month',
    original_price_paise: money.original_price_paise,
    sale_price_paise: money.sale_price_paise,
    discount_percent: safeNumber(form.discount_percent),
    wallet_credit_paise: money.wallet_credit_paise,
    ...cycles,
    subscription_tier: form.subscription_tier || null,
    is_free_trial: form.is_free_trial ? 1 : 0,
    trial_duration_days: safeNumber(form.trial_duration_days),
    included_wallet_credit_paise:
      cycles.included_wallet_credit_month_paise ?? money.included_wallet_credit_paise,
    seat_limit_admins: safeNumber(form.seat_limit_admins),
    seat_limit_managers: safeNumber(form.seat_limit_managers),
    seat_limit_agents: safeNumber(form.seat_limit_agents),
    seat_limit_channels: safeNumber(form.seat_limit_channels),
    seat_role: form.seat_role || null,
    includes_unlimited_channels: form.includes_unlimited_channels ? 1 : 0,
    features_html: features.features_html,
    features_json: features.features_json,
    is_contact_sales: form.is_contact_sales ? 1 : 0,
    gst_percent: safeNumber(form.gst_percent) ?? 18,
    prices_include_gst: form.prices_include_gst ? 1 : 0,
    call_rate_paise_per_minute: safePaisePerMin(form.call_rate_paise_per_minute),
    byo_platform_fee_paise_per_minute: safePaisePerMin(form.byo_platform_fee_paise_per_minute),
    call_min_balance_paise: money.call_min_balance_paise,
    unlimited_minutes_cap_per_month: safeNumber(form.unlimited_minutes_cap_per_month),
    sort_order: editing?.sort_order ?? 0,
    is_active: form.is_active ? 1 : 0,
  };
}

export function mergePreviewIntoPlans(plans, previewPlan, editing) {
  const list = Array.isArray(plans) ? plans : [];
  if (editing?.id != null) {
    const hasRow = list.some((p) => Number(p.id) === Number(editing.id));
    if (hasRow) {
      return list.map((p) => (Number(p.id) === Number(editing.id) ? previewPlan : p));
    }
    return [previewPlan, ...list];
  }
  const withoutDraft = list.filter((p) => Number(p.id) !== PREVIEW_PLAN_ID);
  return [previewPlan, ...withoutDraft];
}

export function formToBody(form, { isEdit }) {
  const body = {
    name: String(form.name || '').trim(),
    description: form.description || null,
    plan_category: form.plan_category,
    plan_type: form.plan_type,
    gst_percent: safeNumber(form.gst_percent) ?? 18,
    prices_include_gst: form.prices_include_gst ? 1 : 0,
    is_active: form.is_active ? 1 : 0,
  };
  if (!isEdit) body.code = String(form.code || '').trim();

  const money = formRupeeFieldsToPaise(form);

  if (form.plan_category === PLAN_CATEGORY.CREDIT_TOP_UP) {
    body.plan_type = 'credit';
    body.billing_interval = 'one_time';
    body.original_price_paise = money.original_price_paise;
    body.sale_price_paise = money.sale_price_paise;
    body.discount_percent = safeNumber(form.discount_percent);
    body.wallet_credit_paise = money.wallet_credit_paise;
  } else if (form.plan_category === PLAN_CATEGORY.SEAT_ADD_ON) {
    body.plan_type = 'credit';
    body.billing_interval = 'one_time';
    body.seat_role = form.seat_role || 'agent';
    body.includes_unlimited_channels = form.includes_unlimited_channels ? 1 : 0;
    body.original_price_paise = money.original_price_paise;
    body.sale_price_paise = money.sale_price_paise;
    body.discount_percent = safeNumber(form.discount_percent);
  } else {
    Object.assign(body, cycleFieldsToPaise(form));
    body.subscription_tier = form.subscription_tier?.trim() || null;
    body.is_free_trial = form.is_free_trial ? 1 : 0;
    body.billing_interval = null;
    body.trial_duration_days = safeNumber(form.trial_duration_days);
    body.original_price_paise = body.price_month_original_paise ?? null;
    body.sale_price_paise = body.price_month_sale_paise ?? null;
    body.discount_percent = body.price_month_discount_percent ?? null;
    body.included_wallet_credit_paise =
      body.included_wallet_credit_month_paise ?? money.included_wallet_credit_paise;
    body.seat_limit_admins = safeNumber(form.seat_limit_admins);
    body.seat_limit_managers = safeNumber(form.seat_limit_managers);
    body.seat_limit_agents = safeNumber(form.seat_limit_agents);
    body.seat_limit_channels = safeNumber(form.seat_limit_channels);
    const features = resolveFeaturesFields(form);
    body.features_html = features.features_html;
    body.features_json = features.features_json_raw;
    body.is_contact_sales = form.is_contact_sales ? 1 : 0;
    if (form.plan_type === 'credit') {
      body.call_rate_paise_per_minute = safePaisePerMin(form.call_rate_paise_per_minute);
      body.byo_platform_fee_paise_per_minute = safePaisePerMin(form.byo_platform_fee_paise_per_minute);
      body.call_min_balance_paise = money.call_min_balance_paise;
    } else {
      body.unlimited_minutes_cap_per_month = safeNumber(form.unlimited_minutes_cap_per_month);
    }
  }
  return body;
}

