import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { formatPaiseAsInr } from '../../utils/telephonyPlanFormUtils';
import { formatPriceWithTax } from '../../utils/planTaxUtils';
import {
  PlanCardBody,
  PlanCardFooter,
  PlanCardHighlight,
  PlanCardHighlights,
  PlanCardPrice,
  PlanCardTopRow,
  PlanTypeChip,
  planCardStyles,
} from './TelephonyPlanCardShared';
import gridStyles from './CreditPurchasePricingGrid.module.scss';
import styles from './SeatPurchasePricingGrid.module.scss';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', agent: 'Agent' };

function seatPlanTitle(plan) {
  const role = ROLE_LABEL[plan.seat_role] || plan.seat_role || 'Seat';
  if (plan.includes_unlimited_channels) {
    return `${role} + unlimited channel`;
  }
  return `${role} seat`;
}

function SeatPlanCard({ plan, preview, razorpayConfigured, payingId, onPurchase }) {
  const [qty, setQty] = useState('1');
  const quantity = Math.min(50, Math.max(1, Math.floor(Number(qty) || 1)));
  const unit = Number(plan.sale_price_paise);
  const lineTotal = unit * quantity;
  const totalCheckout = formatPriceWithTax(lineTotal, plan);

  const roleLabel = ROLE_LABEL[plan.seat_role] || plan.seat_role;

  return (
    <Card className={planCardStyles.card}>
      <div className={planCardStyles.inner}>
        <PlanCardTopRow name={plan.name || seatPlanTitle(plan)} />
        <PlanTypeChip variant="seat" />
        <PlanCardPrice
          salePaise={unit}
          plan={plan}
          intervalSuffix="per seat · one-time"
        />
        <PlanCardHighlights>
          <PlanCardHighlight icon="badge">
            {roleLabel}
            {plan.includes_unlimited_channels ? ' · includes unlimited channel' : ''}
          </PlanCardHighlight>
          {quantity > 1 ? (
            <PlanCardHighlight icon="shopping_cart">
              Total for {quantity}: <strong>{totalCheckout.main}</strong>
              {totalCheckout.taxLine ? ` (${totalCheckout.taxLine})` : ''}
            </PlanCardHighlight>
          ) : null}
        </PlanCardHighlights>
        <PlanCardBody>
          {plan.description ? <p className={planCardStyles.desc}>{plan.description}</p> : null}
        </PlanCardBody>
        {!preview ? (
          <Input
            label="Quantity"
            type="number"
            min={1}
            max={50}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={styles.qtyInput}
          />
        ) : null}
        <PlanCardFooter>
          <Button
            variant="secondary"
            fullWidth
            disabled={preview || payingId != null || !razorpayConfigured}
            onClick={() => onPurchase?.(plan, quantity)}
          >
            {preview
              ? 'Buy seats'
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

/** One-time seat & channel add-on plans. */
export function SeatPurchasePricingGrid({
  plans = [],
  preview = false,
  razorpayConfigured = true,
  payingId = null,
  onPurchase,
  seatLimits = null,
  emptyMessage = 'No seat add-on plans yet. Your platform admin can add them under Telephony plans → Seat add-ons.',
}) {
  const oneTimePlans = useMemo(
    () => plans.filter((p) => p.billing_interval === 'one_time' || !p.billing_interval),
    [plans]
  );

  if (!oneTimePlans.length) {
    return <p className={gridStyles.empty}>{emptyMessage}</p>;
  }

  return (
    <div className={gridStyles.wrap}>
      {seatLimits ? (
        <p className={styles.limitsHint}>
          <MaterialSymbol name="groups" size="sm" />
          Current usage — agents {seatLimits.usage?.agents ?? 0}
          {seatLimits.effective?.agents != null ? ` / ${seatLimits.effective.agents}` : ''}, channels{' '}
          {seatLimits.usage?.channels ?? 0}
          {seatLimits.effective?.channels != null ? ` / ${seatLimits.effective.channels}` : ''}
        </p>
      ) : null}
      <div className={gridStyles.grid}>
        {oneTimePlans.map((plan) => (
          <SeatPlanCard
            key={plan.id}
            plan={plan}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onPurchase={onPurchase}
          />
        ))}
      </div>
    </div>
  );
}
