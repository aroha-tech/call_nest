import {
  CREDIT_SUBSCRIPTION_TIERS,
  UNLIMITED_SUBSCRIPTION_TIERS,
  PAID_BILLING_INTERVALS,
  normalizeSubscriptionTier,
  isEnterpriseTier,
  isFreeTier,
} from '../constants/telephonyPlanCatalog';

export { normalizeSubscriptionTier, isEnterpriseTier, isFreeTier };

/**
 * @param {object[]} plans
 * @param {'credit'|'unlimited'} planType
 */
export function groupSubscriptionPlans(plans, planType) {
  const tiers =
    planType === 'unlimited' ? UNLIMITED_SUBSCRIPTION_TIERS : CREDIT_SUBSCRIPTION_TIERS;
  const filtered = (plans || []).filter((p) => p.plan_type === planType);

  return tiers.map((tierDef) => {
    const tier = tierDef.value;
    const tierPlans = filtered.filter(
      (p) => normalizeSubscriptionTier(p.subscription_tier) === tier
    );
    const byInterval = {};
    for (const p of tierPlans) {
      if (p.billing_interval) byInterval[p.billing_interval] = p;
    }
    const singleton =
      isFreeTier(tier) || isEnterpriseTier(tier)
        ? tierPlans[0] || null
        : null;

    return {
      tier,
      label: tierDef.label,
      singleton,
      byInterval,
      plans: tierPlans,
    };
  });
}

/**
 * Resolve plan for tier + billing cycle (tenant catalog).
 */
export function pickPlanForCycle(tierGroup, billingInterval) {
  if (!tierGroup) return null;
  if (tierGroup.singleton) return tierGroup.singleton;
  return tierGroup.byInterval[billingInterval] || null;
}

export function missingPaidIntervals(tierGroup) {
  if (!tierGroup || tierGroup.singleton) return [];
  return PAID_BILLING_INTERVALS.filter((iv) => !tierGroup.byInterval[iv.value]).map(
    (iv) => iv.value
  );
}
