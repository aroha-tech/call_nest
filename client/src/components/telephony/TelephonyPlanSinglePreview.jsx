import React from 'react';
import { TelephonySubscriptionCatalog } from './TelephonySubscriptionCatalog';
import { CreditPurchasePricingGrid } from './CreditPurchasePricingGrid';
import { SeatPlanPreviewCard } from './SeatPlanPreviewCard';
import { PLAN_CATEGORY } from '../../constants/telephonyProductTypes';
import styles from './TelephonyPlanSinglePreview.module.scss';

/**
 * Live preview of one plan only (admin form editor).
 */
export function TelephonyPlanSinglePreview({ plan, category }) {
  if (!plan) {
    return <p className={styles.empty}>Start filling the form to see a preview.</p>;
  }

  return (
    <div className={styles.wrap}>
      {category === PLAN_CATEGORY.SUBSCRIPTION ? (
        <TelephonySubscriptionCatalog plans={[plan]} preview razorpayConfigured />
      ) : category === PLAN_CATEGORY.SEAT_ADD_ON ? (
        <SeatPlanPreviewCard plan={plan} preview />
      ) : (
        <CreditPurchasePricingGrid plans={[plan]} singlePlan preview razorpayConfigured />
      )}
    </div>
  );
}
