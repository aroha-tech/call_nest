import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { tenantTelephonyAPI } from '../../services/tenantTelephonyAPI';
import { useCreditPurchaseCheckout } from '../../hooks/useCreditPurchaseCheckout';
import { useSeatPurchaseCheckout } from '../../hooks/useSeatPurchaseCheckout';
import { TenantTelephonyPlansPanel } from './TenantTelephonyPlansPanel';
import styles from './CreditPurchaseSection.module.scss';

/**
 * Tenant plans: billing templates (credit/unlimited) + nested credit top-up packs when applicable.
 */
export function CreditPurchaseSection({
  userEmail,
  onWalletUpdated,
  showBillingLink = true,
  compact = false,
}) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantTelephonyAPI.getPurchaseConfig();
      setView(res.data?.data ?? null);
    } catch (e) {
      setView({
        tenantBillingPlans: [],
        creditPurchasePlans: [],
        creditPurchaseEligible: false,
        creditPurchaseReason: e.response?.data?.error || e.message || 'Could not load plans',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { purchase, payingId: creditPayingId, payError, setPayError } = useCreditPurchaseCheckout({
    userEmail,
    onSuccess: async () => {
      await load();
      await onWalletUpdated?.();
    },
  });

  const {
    purchase: purchaseSeats,
    payingId: seatPayingId,
    payError: seatPayError,
    setPayError: setSeatPayError,
  } = useSeatPurchaseCheckout({
    userEmail,
    onSuccess: async () => {
      await load();
      await onWalletUpdated?.();
    },
  });

  if (loading) {
    return <Skeleton height={compact ? 240 : 360} />;
  }

  if (!view) {
    return null;
  }

  return (
    <div className={styles.wrap}>
      {payError || seatPayError ? (
        <Alert variant="error" className={styles.alert}>
          {payError || seatPayError}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPayError(null);
              setSeatPayError(null);
            }}
          >
            Dismiss
          </Button>
        </Alert>
      ) : null}

      {!view.razorpayConfigured && view.creditPurchaseEligible ? (
        <Alert variant="warning" className={styles.alert}>
          Online payments are not configured yet. Credit packs are visible but checkout needs Razorpay on the
          server.
        </Alert>
      ) : null}

      <TenantTelephonyPlansPanel
        callBillingMode={view.callBillingMode || 'credit'}
        tenantBillingPlans={view.tenantBillingPlans ?? []}
        assignedBillingPlanId={view.assignedBillingPlanId ?? view.assignedBillingPlan?.id}
        creditPurchasePlans={view.creditPurchasePlans ?? view.plans ?? []}
        creditPurchaseEligible={view.creditPurchaseEligible ?? view.eligible}
        creditPurchaseReason={view.creditPurchaseReason ?? view.eligibilityReason}
        razorpayConfigured={view.razorpayConfigured}
        payingId={creditPayingId || seatPayingId}
        onPurchase={(plan) => purchase(plan, { razorpayConfigured: view.razorpayConfigured })}
        onPurchaseSeats={(plan, qty) =>
          purchaseSeats(plan, qty, { razorpayConfigured: view.razorpayConfigured })
        }
        seatPurchasePlans={view.seatPurchasePlans ?? []}
        seatPurchaseEligible={view.seatPurchaseEligible}
        seatPurchaseReason={view.seatPurchaseReason}
        seatLimits={view.seatLimits}
      />

      {showBillingLink ? (
        <p className={styles.footerLink}>
          Payment history is on <Link to="/settings/billing">Plans &amp; billing</Link>.
        </p>
      ) : null}
    </div>
  );
}
