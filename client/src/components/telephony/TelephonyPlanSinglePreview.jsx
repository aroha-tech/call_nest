import React from 'react';
import { TelephonySubscriptionCatalog } from './TelephonySubscriptionCatalog';
import { CreditPurchasePricingGrid } from './CreditPurchasePricingGrid';
import styles from './TelephonyPlanSinglePreview.module.scss';

/**
 * Live preview of one plan only (admin form editor).
 */
export function TelephonyPlanSinglePreview({ plan, category }) {
  if (!plan) {
    return <p className={styles.empty}>Start filling the form to see a preview.</p>;
  }

  const isSubscription = category === 'tenant_billing';

  return (
    <div className={styles.wrap}>
      {isSubscription ? (
        <TelephonySubscriptionCatalog plans={[plan]} preview razorpayConfigured />
      ) : (
        <CreditPurchasePricingGrid plans={[plan]} singlePlan preview razorpayConfigured />
      )}
    </div>
  );
}
