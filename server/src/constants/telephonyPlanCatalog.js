/** Subscription catalog structure (mirrors client/src/constants/telephonyPlanCatalog.js). */

export const SUBSCRIPTION_BILLING_INTERVALS = ['month', 'quarter', 'semiannual', 'year'];
export const CREDIT_SUBSCRIPTION_TIERS = ['free', 'go', 'premium', 'enterprise'];
export const UNLIMITED_SUBSCRIPTION_TIERS = ['go', 'premium'];

export function normalizeSubscriptionTier(tier) {
  const t = String(tier || '').toLowerCase();
  if (t === 'standard') return 'go';
  if (t === 'custom') return 'enterprise';
  return t || 'go';
}

export function tierAllowedForPlanType(planType, tier) {
  const t = normalizeSubscriptionTier(tier);
  if (planType === 'unlimited') {
    return UNLIMITED_SUBSCRIPTION_TIERS.includes(t);
  }
  return CREDIT_SUBSCRIPTION_TIERS.includes(t);
}
