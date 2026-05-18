import React, { useMemo, useState } from 'react';
import { Alert } from '../ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../ui/Tabs';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { TelephonySubscriptionCatalog } from './TelephonySubscriptionCatalog';
import { CreditPurchasePricingGrid } from './CreditPurchasePricingGrid';
import { SeatPurchasePricingGrid } from './SeatPurchasePricingGrid';
import { SeatLimitsSummary } from './SeatLimitsSummary';
import styles from './TenantTelephonyPlansPanel.module.scss';

export const TENANT_PLANS_SECTIONS = {
  subscriptions: 'subscriptions',
  credits: 'credits',
  seats: 'seats',
};

const SECTIONS = TENANT_PLANS_SECTIONS;

function resolveCreditTopUpVisible({ callBillingMode, assignedPlan, telephonySubscription }) {
  if (callBillingMode === 'credit') return true;
  if (assignedPlan?.plan_type === 'credit') return true;
  if (telephonySubscription?.plan_type === 'credit') return true;
  return false;
}

/**
 * Tenant purchase hub: subscription bundles, optional credit top-up, seat add-ons.
 */
export function TenantTelephonyPlansPanel({
  callBillingMode = 'credit',
  tenantBillingPlans = [],
  assignedBillingPlanId = null,
  subscriptionAssignedPlanId = null,
  telephonySubscription = null,
  creditPurchasePlans = [],
  creditPurchaseEligible = false,
  creditPurchaseReason = null,
  razorpayConfigured = true,
  payingId = null,
  onPurchase,
  onPurchaseSeats,
  seatPurchasePlans = [],
  seatPurchaseEligible = false,
  seatPurchaseReason = null,
  seatLimits = null,
  onSubscribe,
  preview = false,
  freePlanAdminOnly = true,
  subscribePayError = null,
  activeSection: controlledSection,
  onSectionChange,
}) {
  const [internalSection, setInternalSection] = useState(SECTIONS.subscriptions);
  const activeSection = controlledSection ?? internalSection;
  const setActiveSection = onSectionChange ?? setInternalSection;

  const assigned = tenantBillingPlans.find(
    (p) => assignedBillingPlanId != null && Number(p.id) === Number(assignedBillingPlanId)
  );

  const catalogAssignedId =
    subscriptionAssignedPlanId != null
      ? subscriptionAssignedPlanId
      : assignedBillingPlanId;

  const showCreditTopUp = resolveCreditTopUpVisible({
    callBillingMode,
    assignedPlan: assigned,
    telephonySubscription,
  });

  const creditPackCount = creditPurchasePlans.length;
  const seatPackCount = seatPurchasePlans.length;

  const paymentBanner = !razorpayConfigured ? (
    <Alert variant="warning" className={styles.paymentBanner}>
      Online checkout is disabled until Razorpay is configured (server .env or Platform billing →
      Razorpay). For local development, set RAZORPAY_DEV_MOCK=1 in server .env and restart the API.
    </Alert>
  ) : null;

  const sectionTabs = useMemo(
    () => (
      <div className={styles.sectionTabs}>
        <Tabs>
          <TabList>
            <Tab
              isActive={activeSection === SECTIONS.subscriptions}
              onClick={() => setActiveSection(SECTIONS.subscriptions)}
            >
              <MaterialSymbol name="subscriptions" size="xs" className={styles.tabIcon} />
              Subscription plans
            </Tab>
            <Tab
              isActive={activeSection === SECTIONS.credits}
              onClick={() => setActiveSection(SECTIONS.credits)}
              disabled={!showCreditTopUp && !preview}
              title={
                !showCreditTopUp && !preview
                  ? 'Available on credit-based billing only'
                  : undefined
              }
            >
              <MaterialSymbol name="account_balance_wallet" size="xs" className={styles.tabIcon} />
              Call credit top-up
              {creditPackCount > 0 ? (
                <span className={styles.tabCount}>{creditPackCount}</span>
              ) : null}
            </Tab>
            <Tab
              isActive={activeSection === SECTIONS.seats}
              onClick={() => setActiveSection(SECTIONS.seats)}
            >
              <MaterialSymbol name="person_add" size="xs" className={styles.tabIcon} />
              Seat & channel add-ons
              {seatPackCount > 0 ? <span className={styles.tabCount}>{seatPackCount}</span> : null}
            </Tab>
          </TabList>
        </Tabs>
      </div>
    ),
    [
      activeSection,
      showCreditTopUp,
      preview,
      creditPackCount,
      seatPackCount,
      setActiveSection,
    ]
  );

  return (
    <div className={styles.panel}>
      {subscribePayError ? <Alert variant="error">{subscribePayError}</Alert> : null}
      {paymentBanner}

      {sectionTabs}

      <TabPanel isActive={activeSection === SECTIONS.subscriptions}>
        <div className={styles.sectionIntro}>
          <h3 className={styles.sectionTitle}>Credit-based & unlimited subscriptions</h3>
          <p className={styles.sectionHint}>
            {callBillingMode === 'unlimited'
              ? 'Your workspace uses unlimited calling. Pick a plan and billing cycle — checkout opens Razorpay when payments are enabled.'
              : 'Pay per minute from your wallet. Pick monthly, quarterly, 6-month, or yearly billing — checkout opens Razorpay when payments are enabled.'}
          </p>
        </div>
        <TelephonySubscriptionCatalog
          plans={tenantBillingPlans}
          assignedPlanId={catalogAssignedId}
          preview={preview}
          razorpayConfigured={razorpayConfigured}
          payingId={payingId}
          onSubscribe={onSubscribe}
          freePlanAdminOnly={freePlanAdminOnly}
        />
      </TabPanel>

      <TabPanel isActive={activeSection === SECTIONS.credits}>
        <div className={styles.sectionIntro}>
          <h3 className={styles.sectionTitle}>Call credit top-up</h3>
          <p className={styles.sectionHint}>
            One-time wallet packs for credit-based plans. Credits are used for connected outbound
            minutes on platform calling — not a subscription.
          </p>
        </div>
        {!showCreditTopUp && !preview ? (
          <Alert variant="info">
            Credit top-ups are available when your workspace uses credit-based billing with platform
            calling (not BYO telephony).
          </Alert>
        ) : creditPurchaseEligible || preview ? (
          <CreditPurchasePricingGrid
            plans={creditPurchasePlans}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onPurchase={onPurchase}
            emptyMessage="No call credit packs yet. Your platform admin can add them under Telephony plans → Credit top-up."
          />
        ) : creditPurchaseReason ? (
          <Alert variant="info">{creditPurchaseReason}</Alert>
        ) : (
          <Alert variant="info">Credit top-up is not available for this workspace.</Alert>
        )}
      </TabPanel>

      <TabPanel isActive={activeSection === SECTIONS.seats}>
        <div className={styles.sectionIntro}>
          <h3 className={styles.sectionTitle}>Seat & channel add-ons</h3>
          <p className={styles.sectionHint}>
            Buy extra admins, managers, agents, or unlimited-calling channels. One-time purchase per
            seat — Razorpay checkout when payments are enabled.
          </p>
        </div>
        {seatLimits ? <SeatLimitsSummary seatLimits={seatLimits} compact /> : null}
        {seatPurchaseEligible || preview ? (
          <SeatPurchasePricingGrid
            plans={seatPurchasePlans}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onPurchase={onPurchaseSeats}
            seatLimits={seatLimits}
            emptyMessage="No seat add-on plans yet. Your platform admin can add them under Telephony plans → Seat add-ons."
          />
        ) : seatPurchaseReason ? (
          <Alert variant="info">{seatPurchaseReason}</Alert>
        ) : (
          <Alert variant="info">No seat add-on plans are configured yet.</Alert>
        )}
      </TabPanel>
    </div>
  );
}
