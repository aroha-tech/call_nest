import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { Skeleton } from '../ui/Skeleton';
import { Spinner } from '../ui/Spinner';
import { EMPTY_PLANS } from '../../constants/emptyCollections';
import { PLAN_CATEGORY } from '../../constants/telephonyProductTypes';
import { TenantTelephonyPlansPanel } from './TenantTelephonyPlansPanel';
import { TelephonySubscriptionCatalog } from './TelephonySubscriptionCatalog';
import { CreditPurchasePricingGrid } from './CreditPurchasePricingGrid';
import { SeatPurchasePricingGrid } from './SeatPurchasePricingGrid';
import styles from './TelephonyPlanTenantPreview.module.scss';

function PreviewShell({ loading, refreshing, hasData, children }) {
  const showInitialSkeleton = loading && !hasData;
  const showOverlay = (loading || refreshing) && hasData;

  if (showInitialSkeleton) {
    return (
      <div className={styles.previewShell}>
        <Skeleton height={360} className={styles.previewSkeleton} />
      </div>
    );
  }

  return (
    <div className={styles.previewShell}>
      <div className={showOverlay ? styles.previewContentDimmed : undefined}>{children}</div>
      {showOverlay ? (
        <div className={styles.previewOverlay} aria-busy="true" aria-live="polite">
          <Spinner size="md" />
          <span>Updating preview…</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Presentational preview only — data comes from parent (no extra API calls).
 */
export function TelephonyPlanTenantPreview({
  plan,
  highlightPlanId,
  category,
  subscriptionPlans = EMPTY_PLANS,
  purchasePlans = EMPTY_PLANS,
  seatPlans = EMPTY_PLANS,
  billingPlanTypeFilter = '',
  hideSectionHead = false,
  loading = false,
  refreshing = false,
  fullCatalog = false,
  subscriptionCyclesVisible = null,
}) {
  const cat = category || plan?.plan_category || PLAN_CATEGORY.SUBSCRIPTION;
  const focusId = highlightPlanId ?? plan?.id ?? null;

  const subscriptionCatalog = useMemo(() => {
    const panelVisible = (p) => p.visible_on_panel !== 0 && p.visible_on_panel !== false;
    const filtered = (billingPlanTypeFilter
      ? subscriptionPlans.filter((p) => p.plan_type === billingPlanTypeFilter)
      : subscriptionPlans
    ).filter(panelVisible);

    if (cat !== PLAN_CATEGORY.SUBSCRIPTION || !plan) {
      return filtered;
    }
    if (filtered.some((p) => Number(p.id) === Number(plan.id))) {
      return filtered;
    }
    return [plan, ...filtered];
  }, [cat, plan, subscriptionPlans, billingPlanTypeFilter]);

  const focusPlan = useMemo(() => {
    if (focusId == null) return subscriptionCatalog[0] ?? null;
    return (
      subscriptionCatalog.find((p) => Number(p.id) === Number(focusId)) ??
      subscriptionCatalog[0] ??
      null
    );
  }, [focusId, subscriptionCatalog]);

  const mode = focusPlan?.plan_type || billingPlanTypeFilter || 'credit';
  const showCreditPacks = mode === 'credit';

  const hasPreviewData = useMemo(() => {
    if (fullCatalog) {
      return (
        subscriptionCatalog.length > 0 || purchasePlans.length > 0 || seatPlans.length > 0
      );
    }
    if (cat === PLAN_CATEGORY.SUBSCRIPTION) return subscriptionCatalog.length > 0;
    if (cat === PLAN_CATEGORY.CREDIT_TOP_UP) return purchasePlans.length > 0;
    if (cat === PLAN_CATEGORY.SEAT_ADD_ON) return seatPlans.length > 0;
    return false;
  }, [fullCatalog, cat, subscriptionCatalog, purchasePlans, seatPlans]);

  const isBusy = loading || refreshing;

  if (fullCatalog) {
    if (!isBusy && !hasPreviewData) {
      return (
        <Card className={styles.emptyPreview}>
          <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
          <p>No active plans to preview. Add and activate plans in the tabs above.</p>
        </Card>
      );
    }

    return (
      <PreviewShell loading={loading} refreshing={refreshing} hasData={hasPreviewData}>
        <Card className={styles.previewCard}>
          <TenantTelephonyPlansPanel
            preview
            callBillingMode={mode}
            tenantBillingPlans={subscriptionCatalog}
            assignedBillingPlanId={focusId ?? subscriptionCatalog[0]?.id}
            creditPurchasePlans={showCreditPacks ? purchasePlans : EMPTY_PLANS}
            creditPurchaseEligible={showCreditPacks && purchasePlans.length > 0}
            creditPurchaseReason={
              showCreditPacks ? null : 'Credit top-up packs appear only on credit billing.'
            }
            seatPurchasePlans={seatPlans}
            seatPurchaseEligible={seatPlans.length > 0}
            razorpayConfigured
            freePlanAdminOnly={false}
            subscriptionCyclesVisible={subscriptionCyclesVisible}
          />
        </Card>
      </PreviewShell>
    );
  }

  if (cat === PLAN_CATEGORY.SUBSCRIPTION) {
    if (!isBusy && !subscriptionCatalog.length) {
      return (
        <Card className={styles.emptyPreview}>
          <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
          <p>No active subscription plans to preview. Add plans in the table above or activate existing ones.</p>
        </Card>
      );
    }

    return (
      <PreviewShell loading={loading} refreshing={refreshing} hasData={hasPreviewData}>
        <section className={styles.section}>
          {!hideSectionHead ? (
            <header className={styles.sectionHead}>
              <MaterialSymbol name="preview" size="sm" />
              <div>
                <h2 className={styles.sectionTitle}>Tenant admin preview</h2>
                <p className={styles.previewNote}>
                  Subscription plans only, as shown on Plans &amp; billing.
                  {focusId != null ? ' Highlighted card matches the selected table row.' : null}
                </p>
              </div>
            </header>
          ) : null}
          <Card className={styles.previewCard}>
            <TelephonySubscriptionCatalog
              plans={subscriptionCatalog}
              assignedPlanId={focusId ?? subscriptionCatalog[0]?.id}
              preview
              razorpayConfigured
              freePlanAdminOnly={false}
              subscriptionCyclesVisible={subscriptionCyclesVisible}
            />
          </Card>
        </section>
      </PreviewShell>
    );
  }

  if (cat === PLAN_CATEGORY.CREDIT_TOP_UP) {
    if (!isBusy && !purchasePlans.length) {
      return (
        <Card className={styles.emptyPreview}>
          <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
          <p>No active credit top-up packs to preview.</p>
        </Card>
      );
    }

    return (
      <PreviewShell loading={loading} refreshing={refreshing} hasData={hasPreviewData}>
        <section className={styles.section}>
          {!hideSectionHead ? (
            <header className={styles.sectionHead}>
              <MaterialSymbol name="preview" size="sm" />
              <div>
                <h2 className={styles.sectionTitle}>Tenant admin preview</h2>
                <p className={styles.previewNote}>
                  Credit top-up packs only, as tenants see when buying wallet credit.
                  {focusId != null ? ' Highlighted card matches the selected table row.' : null}
                </p>
              </div>
            </header>
          ) : null}
          <Card className={styles.previewCard}>
            <CreditPurchasePricingGrid plans={purchasePlans} preview razorpayConfigured />
          </Card>
        </section>
      </PreviewShell>
    );
  }

  if (cat === PLAN_CATEGORY.SEAT_ADD_ON) {
    if (!isBusy && !seatPlans.length) {
      return (
        <Card className={styles.emptyPreview}>
          <MaterialSymbol name="visibility" size="md" className={styles.emptyIcon} />
          <p>No active seat add-on plans to preview.</p>
        </Card>
      );
    }

    return (
      <PreviewShell loading={loading} refreshing={refreshing} hasData={hasPreviewData}>
        <section className={styles.section}>
          {!hideSectionHead ? (
            <header className={styles.sectionHead}>
              <MaterialSymbol name="preview" size="sm" />
              <div>
                <h2 className={styles.sectionTitle}>Tenant admin preview</h2>
                <p className={styles.previewNote}>
                  Seat &amp; channel add-ons only, as tenants see on Plans &amp; billing.
                  {focusId != null ? ' Highlighted card matches the selected table row.' : null}
                </p>
              </div>
            </header>
          ) : null}
          <Card className={styles.previewCard}>
            <SeatPurchasePricingGrid plans={seatPlans} preview razorpayConfigured />
          </Card>
        </section>
      </PreviewShell>
    );
  }

  return null;
}
