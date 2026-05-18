import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  PLAN_BILLING_CYCLES,
  availableBillingCycles,
  billingIntervalPriceSuffix,
  isContactSalesPlan,
  isFreePlan,
  resolvePlanCyclePrice,
  resolvePlanCycleIncludedCredit,
} from '../../utils/planCyclePricing';
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
import styles from './TelephonySubscriptionCatalog.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function SubscriptionPlanCard({
  plan,
  billingCycle,
  isCurrent,
  preview,
  razorpayConfigured,
  payingId,
  onSubscribe,
  freePlanAdminOnly,
}) {
  const isFree = isFreePlan(plan);
  const isEnterprise = isContactSalesPlan(plan);
  const freeDisabled = isFree && freePlanAdminOnly && !preview;
  const price = isFree || isEnterprise ? null : resolvePlanCyclePrice(plan, billingCycle);
  const orig = Number(price?.original_price_paise);
  const sale = Number(price?.sale_price_paise);
  const discount = price?.discount_percent;
  const showStrike = Number.isFinite(orig) && orig > sale && sale > 0;
  const includedCreditPaise = resolvePlanCycleIncludedCredit(plan, billingCycle);

  let cta = razorpayConfigured ? 'Pay & subscribe' : 'Subscribe';
  if (isFree) cta = 'Start free trial';
  if (isEnterprise) cta = 'Contact sales';
  if (isCurrent) cta = 'Current plan';

  const typeVariant = isEnterprise
    ? 'enterprise'
    : isFree
      ? 'free'
      : plan.plan_type === 'unlimited'
        ? 'unlimited'
        : 'credit';

  const highlights = [];
  if (isFree && plan.trial_duration_days) {
    highlights.push(
      <PlanCardHighlight key="trial" icon="schedule">
        {plan.trial_duration_days} day trial
      </PlanCardHighlight>
    );
  }
  if (includedCreditPaise > 0) {
    highlights.push(
      <PlanCardHighlight key="credit" icon="account_balance_wallet">
        {formatPaiseAsInr(includedCreditPaise)} call credits included
      </PlanCardHighlight>
    );
  }
  if (plan.plan_type === 'unlimited' && Number(plan.unlimited_minutes_cap_per_month) > 0) {
    highlights.push(
      <PlanCardHighlight key="mins" icon="timer">
        {Number(plan.unlimited_minutes_cap_per_month).toLocaleString('en-IN')} min / month
      </PlanCardHighlight>
    );
  }

  return (
    <Card
      className={[
        planCardStyles.card,
        isCurrent && planCardStyles.cardCurrent,
        isEnterprise && planCardStyles.cardEnterprise,
        isFree && planCardStyles.cardFree,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={planCardStyles.inner}>
        <PlanCardTopRow
          name={plan.name}
          discountPercent={discount}
          isCurrent={isCurrent}
        />
        <PlanTypeChip variant={typeVariant} />
        <PlanCardPrice
          isEnterprise={isEnterprise}
          isFree={isFree}
          showStrike={showStrike}
          originalFormatted={formatPaiseAsInr(orig)}
          salePaise={sale}
          plan={plan}
          intervalSuffix={!isFree && !isEnterprise ? `/${billingIntervalPriceSuffix(billingCycle)}` : null}
        />
        {highlights.length > 0 ? <PlanCardHighlights>{highlights}</PlanCardHighlights> : null}
        <PlanCardBody>
          <PlanCardFeatures plan={plan} />
        </PlanCardBody>
        <PlanCardFooter>
          <Button
            variant={isEnterprise ? 'secondary' : 'primary'}
            fullWidth
            disabled={
              preview ||
              isCurrent ||
              payingId != null ||
              freeDisabled ||
              (!isEnterprise && !isFree && !razorpayConfigured)
            }
            onClick={() => onSubscribe?.(plan, { billingInterval: billingCycle })}
          >
            {preview
              ? cta
              : freeDisabled
                ? 'Assigned by admin'
                : payingId === plan.id
                  ? 'Opening checkout…'
                  : !razorpayConfigured && !isFree && !isEnterprise
                    ? 'Payments unavailable'
                    : cta}
          </Button>
        </PlanCardFooter>
      </div>
    </Card>
  );
}

function PlanSection({
  title,
  subtitle,
  plans,
  assignedPlanId,
  preview,
  razorpayConfigured,
  payingId,
  onSubscribe,
  freePlanAdminOnly,
}) {
  const [cycle, setCycle] = useState('month');
  const cycles = useMemo(() => {
    const set = new Set();
    for (const p of plans) {
      for (const iv of availableBillingCycles(p)) set.add(iv);
    }
    if (!set.size) set.add('month');
    return PLAN_BILLING_CYCLES.filter((c) => set.has(c.value));
  }, [plans]);

  const visible = useMemo(() => {
    if (!cycles.some((c) => c.value === cycle)) return cycles[0]?.value || 'month';
    return cycle;
  }, [cycle, cycles]);

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle ? <p className={styles.sectionSub}>{subtitle}</p> : null}
      </header>
      {cycles.length > 1 ? (
        <div className={styles.cycleToggle} role="group" aria-label="Billing cycle">
          {cycles.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`${styles.cycleBtn} ${visible === c.value ? styles.cycleBtnActive : ''}`}
              onClick={() => setCycle(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.grid}>
        {plans.map((plan) => (
          <SubscriptionPlanCard
            key={plan.id}
            plan={plan}
            billingCycle={visible}
            isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onSubscribe={onSubscribe}
            freePlanAdminOnly={freePlanAdminOnly}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One card per plan; billing cycle toggle picks which price fields to show.
 */
export function TelephonySubscriptionCatalog({
  plans = [],
  assignedPlanId = null,
  preview = false,
  razorpayConfigured = true,
  payingId = null,
  onSubscribe,
  freePlanAdminOnly = true,
}) {
  const creditPlans = useMemo(() => plans.filter((p) => p.plan_type === 'credit'), [plans]);
  const unlimitedPlans = useMemo(() => plans.filter((p) => p.plan_type === 'unlimited'), [plans]);

  if (!plans.length) {
    return (
      <p className={styles.empty}>
        No subscription plans configured. Add plans under Admin → Telephony plans.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      {creditPlans.length > 0 ? (
        <PlanSection
          title="Credit-based plans"
          subtitle="Pay per minute from your wallet. Each plan can offer monthly, quarterly, 6-month, and yearly pricing."
          plans={creditPlans}
          assignedPlanId={assignedPlanId}
          preview={preview}
          razorpayConfigured={razorpayConfigured}
          payingId={payingId}
          onSubscribe={onSubscribe}
          freePlanAdminOnly={freePlanAdminOnly}
        />
      ) : null}
      {unlimitedPlans.length > 0 ? (
        <PlanSection
          title="Unlimited calling plans"
          subtitle="Minute cap per month — no per-call wallet debit."
          plans={unlimitedPlans}
          assignedPlanId={assignedPlanId}
          preview={preview}
          razorpayConfigured={razorpayConfigured}
          payingId={payingId}
          onSubscribe={onSubscribe}
          freePlanAdminOnly={freePlanAdminOnly}
        />
      ) : null}
    </div>
  );
}
