/** Billing cycles on a single subscription plan row (mirrors server/src/utils/planCyclePricing.js). */

export const PLAN_BILLING_CYCLES = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'semiannual', label: '6 months' },
  { value: 'year', label: 'Yearly' },
];

const CYCLE_VALUES = PLAN_BILLING_CYCLES.map((c) => c.value);

const CYCLE_PREFIX = {
  month: 'price_month',
  quarter: 'price_quarter',
  semiannual: 'price_semiannual',
  year: 'price_year',
};

export function billingIntervalLabel(interval) {
  return PLAN_BILLING_CYCLES.find((c) => c.value === interval)?.label || interval || '—';
}

export function billingIntervalPriceSuffix(interval) {
  switch (interval) {
    case 'year':
      return 'year';
    case 'quarter':
      return 'quarter';
    case 'semiannual':
      return '6 mo';
    default:
      return 'month';
  }
}

export function resolvePlanCyclePrice(plan, interval = 'month') {
  if (!plan) return null;
  const iv = CYCLE_VALUES.includes(interval) ? interval : 'month';
  const prefix = CYCLE_PREFIX[iv];
  const sale =
    plan[`${prefix}_sale_paise`] ??
    (iv === plan.billing_interval ? plan.sale_price_paise : null);
  const original =
    plan[`${prefix}_original_paise`] ??
    (iv === plan.billing_interval ? plan.original_price_paise : null);
  let discount =
    plan[`${prefix}_discount_percent`] ??
    (iv === plan.billing_interval ? plan.discount_percent : null);
  if (discount == null && original != null && sale != null && original > sale && sale >= 0) {
    discount = Math.min(100, Math.max(0, Math.round((1 - sale / original) * 100)));
  }
  return {
    billing_interval: iv,
    original_price_paise: original,
    sale_price_paise: sale,
    discount_percent: discount,
  };
}

export function availableBillingCycles(plan) {
  if (!plan || plan.is_free_trial === 1 || plan.is_contact_sales === 1) return [];
  return CYCLE_VALUES.filter((iv) => {
    const p = resolvePlanCyclePrice(plan, iv);
    return p?.sale_price_paise != null && Number(p.sale_price_paise) > 0;
  });
}

export function isFreePlan(plan) {
  return plan?.is_free_trial === 1 || plan?.is_free_trial === true;
}

export function isContactSalesPlan(plan) {
  return plan?.is_contact_sales === 1 || plan?.is_contact_sales === true;
}

/** Form field keys for one cycle (values in rupees in the form). */
export function cycleFormKeys(interval) {
  const p = CYCLE_PREFIX[interval] || CYCLE_PREFIX.month;
  return {
    original: `${p}_original_paise`,
    sale: `${p}_sale_paise`,
    discount: `${p}_discount_percent`,
  };
}

export function blankCyclePricingForm() {
  const out = {};
  for (const { value } of PLAN_BILLING_CYCLES) {
    const k = cycleFormKeys(value);
    out[k.original] = '';
    out[k.sale] = '';
    out[k.discount] = '';
  }
  return out;
}
