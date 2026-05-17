import React, { useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import {
  PLAN_BILLING_CYCLES,
  availableBillingCycles,
  billingIntervalLabel,
  billingIntervalPriceSuffix,
  isContactSalesPlan,
  isFreePlan,
  resolvePlanCyclePrice,
} from '../../utils/planCyclePricing';
import styles from './TelephonySubscriptionCatalog.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function PlanFeatures({ plan }) {
  if (plan?.features_html) {
    return (
      <div
        className={styles.featuresHtml}
        dangerouslySetInnerHTML={{ __html: plan.features_html }}
      />
    );
  }
  const lines = Array.isArray(plan?.features_json)
    ? plan.features_json.map((x) => (typeof x === 'string' ? x : x?.text)).filter(Boolean)
    : [];
  if (!lines.length && plan?.description) {
    return <p className={styles.desc}>{plan.description}</p>;
  }
  return (
    <ul className={styles.featuresList}>
      {lines.map((line, i) => (
        <li key={i}>
          <MaterialSymbol name="check" size="sm" />
          {line}
        </li>
      ))}
    </ul>
  );
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

  let cta = 'Subscribe';
  if (isFree) cta = 'Start free trial';
  if (isEnterprise) cta = 'Contact sales';
  if (isCurrent) cta = 'Current plan';

  return (
    <Card
      className={[
        styles.card,
        isCurrent && styles.cardCurrent,
        isEnterprise && styles.cardEnterprise,
        isFree && styles.cardFree,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {discount > 0 && !isFree ? (
        <div className={styles.badge}>
          <Badge variant="primary" size="sm">
            {discount}% off
          </Badge>
        </div>
      ) : null}
      {isCurrent ? (
        <div className={styles.badge}>
          <Badge variant="success" size="sm">
            Current
          </Badge>
        </div>
      ) : null}

      <h3 className={styles.cardName}>{plan.name}</h3>
      <Badge variant={plan.plan_type === 'unlimited' ? 'success' : 'warning'} size="sm">
        {plan.plan_type === 'unlimited' ? 'Unlimited calling' : 'Credit calling'}
      </Badge>

      <div className={styles.priceBlock}>
        {isEnterprise ? (
          <span className={styles.salePrice}>Custom</span>
        ) : isFree ? (
          <span className={styles.salePrice}>Free</span>
        ) : (
          <>
            {showStrike ? <span className={styles.originalPrice}>{formatPaiseAsInr(orig)}</span> : null}
            <span className={styles.salePrice}>{formatPaiseAsInr(sale)}</span>
            <span className={styles.interval}>/{billingIntervalPriceSuffix(billingCycle)}</span>
          </>
        )}
      </div>

      {isFree && plan.trial_duration_days ? (
        <p className={styles.metaLine}>{plan.trial_duration_days} day trial</p>
      ) : null}
      {plan.included_wallet_credit_paise > 0 ? (
        <p className={styles.metaLine}>
          <MaterialSymbol name="account_balance_wallet" size="sm" />
          {formatPaiseAsInr(plan.included_wallet_credit_paise)} call credits included
        </p>
      ) : null}
      {plan.plan_type === 'unlimited' && Number(plan.unlimited_minutes_cap_per_month) > 0 ? (
        <p className={styles.metaLine}>
          {Number(plan.unlimited_minutes_cap_per_month).toLocaleString('en-IN')} min / month
        </p>
      ) : null}

      <PlanFeatures plan={plan} />

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
