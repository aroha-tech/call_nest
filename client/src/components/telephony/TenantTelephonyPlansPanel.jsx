import React from 'react';
import { Alert } from '../ui/Alert';
import { TelephonySubscriptionCatalog } from './TelephonySubscriptionCatalog';
import { CreditPurchasePricingGrid } from './CreditPurchasePricingGrid';
import styles from './TenantTelephonyPlansPanel.module.scss';

/**
 * 1) Main subscription plans (tenant_billing) — website / Plans & billing
 * 2) Credit purchase packs (nested) — only for credit subscribers + platform calling
 */
export function TenantTelephonyPlansPanel({
  callBillingMode = 'credit',
  tenantBillingPlans = [],
  assignedBillingPlanId = null,
  creditPurchasePlans = [],
  creditPurchaseEligible = false,
  creditPurchaseReason = null,
  razorpayConfigured = true,
  payingId = null,
  onPurchase,
  onSubscribe,
  preview = false,
  freePlanAdminOnly = true,
  subscribePayError = null,
}) {
  const assigned = tenantBillingPlans.find(
    (p) => assignedBillingPlanId != null && Number(p.id) === Number(assignedBillingPlanId)
  );
  const isCredit = assigned?.plan_type === 'credit' || callBillingMode === 'credit';

  return (
    <div className={styles.panel}>
      {subscribePayError ? <Alert variant="error">{subscribePayError}</Alert> : null}
      <TelephonySubscriptionCatalog
        plans={tenantBillingPlans}
        assignedPlanId={assignedBillingPlanId}
        preview={preview}
        razorpayConfigured={razorpayConfigured}
        payingId={payingId}
        onSubscribe={onSubscribe}
        freePlanAdminOnly={freePlanAdminOnly}
      />

      {isCredit ? (
        <section className={styles.nestedSection}>
          <div className={styles.nestedDivider} aria-hidden />
          <h3 className={styles.nestedTitle}>Call credit top-up packs</h3>
          <p className={styles.nestedHint}>
            Extra wallet credit for credit-based subscriptions (monthly, yearly, or one-time).
          </p>
          {creditPurchaseEligible || preview ? (
            <CreditPurchasePricingGrid
              plans={creditPurchasePlans}
              preview={preview}
              razorpayConfigured={razorpayConfigured}
              payingId={payingId}
              onPurchase={onPurchase}
              emptyMessage="No call credit packs yet. Your platform admin can add them under Telephony plans → Credit purchase packs."
            />
          ) : creditPurchaseReason ? (
            <Alert variant="info">{creditPurchaseReason}</Alert>
          ) : null}
        </section>
      ) : (
        <Alert variant="info" className={styles.unlimitedNote}>
          {preview
            ? 'Unlimited subscriptions do not show wallet top-up packs below.'
            : 'Unlimited calling plans do not use wallet credit packs.'}
        </Alert>
      )}
    </div>
  );
}
