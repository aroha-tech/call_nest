/** Subscription catalog structure (credit + unlimited × tiers × billing cycles). */

export const SUBSCRIPTION_BILLING_INTERVALS = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'semiannual', label: '6 months' },
  { value: 'year', label: 'Yearly' },
];

export const PAID_BILLING_INTERVALS = SUBSCRIPTION_BILLING_INTERVALS;

export const CREDIT_SUBSCRIPTION_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'go', label: 'Go' },
  { value: 'premium', label: 'Premium' },
  { value: 'enterprise', label: 'Enterprise' },
];

export const UNLIMITED_SUBSCRIPTION_TIERS = [
  { value: 'go', label: 'Go' },
  { value: 'premium', label: 'Premium' },
];

/** @param {string | null | undefined} tier */
export function normalizeSubscriptionTier(tier) {
  const t = String(tier || '').toLowerCase();
  if (t === 'standard') return 'go';
  if (t === 'custom') return 'enterprise';
  return t || 'go';
}

/** @param {string | null | undefined} interval */
export function billingIntervalLabel(interval) {
  const found = SUBSCRIPTION_BILLING_INTERVALS.find((o) => o.value === interval);
  if (found) return found.label;
  if (interval === 'one_time') return 'One-time';
  return interval || '—';
}

/** Short suffix for price display (e.g. /mo, /yr). */
export function billingIntervalPriceSuffix(interval) {
  switch (interval) {
    case 'year':
      return 'year';
    case 'quarter':
      return 'quarter';
    case 'semiannual':
      return '6 mo';
    case 'month':
    default:
      return 'month';
  }
}

export function isEnterpriseTier(tier) {
  return normalizeSubscriptionTier(tier) === 'enterprise';
}

export function isFreeTier(tier) {
  return normalizeSubscriptionTier(tier) === 'free';
}
