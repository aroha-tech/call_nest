/** Billing cycles on a single subscription plan row (not separate plan records). */

export const PLAN_BILLING_CYCLES = ['month', 'quarter', 'semiannual', 'year'];

const CYCLE_PREFIX = {
  month: 'price_month',
  quarter: 'price_quarter',
  semiannual: 'price_semiannual',
  year: 'price_year',
};

export function resolvePlanCyclePrice(plan, interval = 'month') {
  if (!plan) return null;
  const iv = PLAN_BILLING_CYCLES.includes(interval) ? interval : 'month';
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

export function planHasAnySalePrice(plan) {
  if (!plan) return false;
  if (plan.is_free_trial === 1 || plan.is_free_trial === true) return true;
  if (plan.is_contact_sales === 1) return true;
  for (const iv of PLAN_BILLING_CYCLES) {
    const p = resolvePlanCyclePrice(plan, iv);
    if (p?.sale_price_paise != null && Number(p.sale_price_paise) >= 0) return true;
  }
  return Number.isFinite(Number(plan.sale_price_paise));
}

export function availableBillingCycles(plan) {
  if (!plan || plan.is_free_trial === 1 || plan.is_contact_sales === 1) return [];
  return PLAN_BILLING_CYCLES.filter((iv) => {
    const p = resolvePlanCyclePrice(plan, iv);
    return p?.sale_price_paise != null && Number(p.sale_price_paise) > 0;
  });
}
