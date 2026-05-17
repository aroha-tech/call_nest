import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { Skeleton } from '../ui/Skeleton';
import { EMPTY_PLANS } from '../../constants/emptyCollections';
import { TenantTelephonyPlansPanel } from './TenantTelephonyPlansPanel';
import styles from './TelephonyPlanTenantPreview.module.scss';

/**
 * Presentational preview only — data comes from parent (no extra API calls).
 */
export function TelephonyPlanTenantPreview({
  plan,
  highlightPlanId,
  category,
  subscriptionPlans = EMPTY_PLANS,
  purchasePlans = EMPTY_PLANS,
  billingPlanTypeFilter = '',
  hideSectionHead = false,
  loading = false,
}) {
  const cat = category || plan?.plan_category || 'tenant_billing';
  const focusId = highlightPlanId ?? plan?.id ?? null;

  const tenantPlans = useMemo(() => {
    const base =
      cat === 'tenant_billing'
        ? subscriptionPlans
        : subscriptionPlans.length
          ? subscriptionPlans
          : purchasePlans;

    const filtered = billingPlanTypeFilter
      ? base.filter((p) => p.plan_type === billingPlanTypeFilter)
      : base;

    if (cat !== 'tenant_billing' || !plan) {
      return filtered;
    }
    if (filtered.some((p) => Number(p.id) === Number(plan.id))) {
      return filtered;
    }
    return [plan, ...filtered];
  }, [cat, plan, subscriptionPlans, purchasePlans, billingPlanTypeFilter]);

  const focusPlan = useMemo(() => {
    if (focusId == null) return tenantPlans[0] ?? null;
    return tenantPlans.find((p) => Number(p.id) === Number(focusId)) ?? tenantPlans[0] ?? null;
  }, [focusId, tenantPlans]);

  const mode =
    cat === 'tenant_billing'
      ? focusPlan?.plan_type || billingPlanTypeFilter || 'credit'
      : 'credit';

  const showCreditPacks = mode === 'credit';

  if (loading) {
    return (
      <Card className={styles.previewCard}>
        <Skeleton height={420} />
      </Card>
    );
  }

  if (cat === 'tenant_billing' && !tenantPlans.length) {
    return (
      <Card className={styles.emptyPreview}>
        <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
        <p>No active subscription plans to preview. Add plans in the table above or activate existing ones.</p>
      </Card>
    );
  }

  if (cat === 'credit_purchase' && !tenantPlans.length) {
    return (
      <Card className={styles.emptyPreview}>
        <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
        <p>No active credit top-up packs to preview.</p>
      </Card>
    );
  }

  return (
    <section className={styles.section}>
      {!hideSectionHead ? (
        <header className={styles.sectionHead}>
          <MaterialSymbol name="preview" size="sm" />
          <div>
            <h2 className={styles.sectionTitle}>Tenant admin preview</h2>
            <p className={styles.previewNote}>
              {cat === 'tenant_billing'
                ? 'Active catalog as shown on Plans & billing (display order from the table above).'
                : 'Active credit packs nested under credit subscriptions.'}
              {focusId != null ? ' Highlighted card matches the selected table row.' : null}
            </p>
          </div>
        </header>
      ) : null}
      <Card className={styles.previewCard}>
        <TenantTelephonyPlansPanel
          preview
          callBillingMode={mode}
          tenantBillingPlans={tenantPlans}
          assignedBillingPlanId={focusId ?? tenantPlans[0]?.id}
          creditPurchasePlans={showCreditPacks ? purchasePlans : EMPTY_PLANS}
          creditPurchaseEligible={showCreditPacks && purchasePlans.length > 0}
          creditPurchaseReason={
            showCreditPacks ? null : 'Credit top-up packs appear only on credit billing.'
          }
          razorpayConfigured
          freePlanAdminOnly={false}
        />
      </Card>
    </section>
  );
}
