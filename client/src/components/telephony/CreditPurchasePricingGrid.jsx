import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatPaiseAsInr } from '../../utils/telephonyPlanFormUtils';
import {
  PlanCardBody,
  PlanCardFooter,
  PlanCardHighlight,
  PlanCardHighlights,
  PlanCardPrice,
  PlanCardTopRow,
  PlanCardFeatures,
  PlanTypeChip,
  planCardStyles,
} from './TelephonyPlanCardShared';
import styles from './CreditPurchasePricingGrid.module.scss';

function planDiscountPercent(plan) {
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
  if (plan.discount_percent != null && plan.discount_percent > 0) return plan.discount_percent;
  if (Number.isFinite(orig) && orig > sale && sale > 0) {
    return Math.round((1 - sale / orig) * 100);
  }
  return null;
}

function CreditPackCard({ plan, preview, razorpayConfigured, payingId, onPurchase, featured = false }) {
  const discount = planDiscountPercent(plan);
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
  const showStrike = Number.isFinite(orig) && orig > sale;

  const extraBadge =
    featured && !(discount > 0) ? (
      <span className={planCardStyles.popularPill}>Popular</span>
    ) : null;

  return (
    <Card
      className={[planCardStyles.card, featured && planCardStyles.cardFeatured]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={planCardStyles.inner}>
        <PlanCardTopRow
          name={plan.name}
          discountPercent={discount}
          extraBadge={extraBadge}
        />
        <PlanTypeChip variant="credit_pack" />
        <PlanCardPrice
          showStrike={showStrike}
          originalFormatted={formatPaiseAsInr(orig)}
          salePaise={sale}
          plan={plan}
          intervalSuffix="one-time"
        />
        <PlanCardHighlights>
          <PlanCardHighlight icon="account_balance_wallet">
            Wallet credit: <strong>{formatPaiseAsInr(plan.wallet_credit_paise)}</strong>
          </PlanCardHighlight>
        </PlanCardHighlights>
        <PlanCardBody>
          {plan.description ? <p className={planCardStyles.desc}>{plan.description}</p> : null}
          <PlanCardFeatures plan={plan} />
        </PlanCardBody>
        <PlanCardFooter>
          <Button
            variant={featured ? 'primary' : 'secondary'}
            fullWidth
            disabled={preview || payingId != null || !razorpayConfigured}
            onClick={() => onPurchase?.(plan)}
          >
            {preview
              ? 'Buy credits'
              : payingId === plan.id
                ? 'Opening checkout…'
                : !razorpayConfigured
                  ? 'Payments unavailable'
                  : 'Pay with Razorpay'}
          </Button>
        </PlanCardFooter>
      </div>
    </Card>
  );
}

/** One-time credit top-up packs only (no monthly/yearly subscription). */
export function CreditPurchasePricingGrid({
  plans = [],
  preview = false,
  singlePlan = false,
  razorpayConfigured = true,
  payingId = null,
  onPurchase,
  featuredIndex,
  emptyMessage = 'No credit top-up packs yet. Your platform admin can add them under Telephony plans → Credit top-up.',
}) {
  const oneTimePlans = useMemo(
    () => plans.filter((p) => p.billing_interval === 'one_time' || !p.billing_interval),
    [plans]
  );

  const featuredIdx = useMemo(() => {
    if (featuredIndex != null) return featuredIndex;
    if (oneTimePlans.length <= 1) return 0;
    return Math.min(1, Math.floor(oneTimePlans.length / 2));
  }, [featuredIndex, oneTimePlans.length]);

  if (!oneTimePlans.length) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  if (singlePlan && oneTimePlans.length > 0) {
    return (
      <div className={`${styles.wrap} ${styles.singlePlan}`}>
        <CreditPackCard
          plan={oneTimePlans[0]}
          preview={preview}
          razorpayConfigured={razorpayConfigured}
          payingId={payingId}
          onPurchase={onPurchase}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>{preview ? 'Credit top-up preview' : 'Call credit top-up'}</h2>
        <p className={styles.subtitle}>
          {preview
            ? 'One-time wallet packs for credit subscribers — not a subscription.'
            : 'Add call wallet balance anytime. One-time purchase only.'}
        </p>
      </div>

      <div className={styles.grid}>
        {oneTimePlans.map((plan, idx) => (
          <CreditPackCard
            key={plan.id}
            plan={plan}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onPurchase={onPurchase}
            featured={idx === featuredIdx && oneTimePlans.length > 1}
          />
        ))}
      </div>
    </div>
  );
}
