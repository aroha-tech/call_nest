import { PLAN_BILLING_CYCLES } from './planCyclePricing.js';

export const SUBSCRIPTION_CYCLES_SETTING_KEY = 'billing.subscription_cycles_visible';

export const DEFAULT_SUBSCRIPTION_CYCLES_VISIBLE = Object.freeze({
  month: true,
  quarter: true,
  semiannual: true,
  year: true,
});

export function normalizeSubscriptionCyclesVisible(raw) {
  const out = { ...DEFAULT_SUBSCRIPTION_CYCLES_VISIBLE };
  if (!raw || typeof raw !== 'object') return out;
  for (const iv of PLAN_BILLING_CYCLES) {
    if (raw[iv] === false || raw[iv] === 0 || raw[iv] === '0') out[iv] = false;
    else if (raw[iv] === true || raw[iv] === 1 || raw[iv] === '1') out[iv] = true;
  }
  return out;
}

export function isSubscriptionCycleEnabled(visible, interval) {
  const normalized = normalizeSubscriptionCyclesVisible(visible);
  return normalized[interval] !== false;
}
