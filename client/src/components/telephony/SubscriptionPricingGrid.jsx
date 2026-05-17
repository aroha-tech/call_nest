import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import styles from './SubscriptionPricingGrid.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function planDiscountPercent(plan) {
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
  if (plan.discount_percent != null && plan.discount_percent > 0) return plan.discount_percent;
  if (Number.isFinite(orig) && orig > sale && sale >= 0) {
    return Math.round((1 - sale / orig) * 100);
  }
  return null;
}

function PlanFeatures({ plan }) {
  if (plan.features_html) {
    return (
      <div
        className={styles.featuresHtml}
        dangerouslySetInnerHTML={{ __html: plan.features_html }}
      />
    );
  }
  const lines = Array.isArray(plan.features_json)
    ? plan.features_json.map((x) => (typeof x === 'string' ? x : x?.text)).filter(Boolean)
    : [];
  if (!lines.length && plan.description) {
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

function SeatSummary({ plan }) {
  const parts = [];
  if (plan.seat_limit_admins != null) parts.push(`${plan.seat_limit_admins} admin${plan.seat_limit_admins === 1 ? '' : 's'}`);
  if (plan.seat_limit_managers != null) {
    parts.push(`${plan.seat_limit_managers} manager${plan.seat_limit_managers === 1 ? '' : 's'}`);
  }
  if (plan.seat_limit_users != null) parts.push(`${plan.seat_limit_users} user${plan.seat_limit_users === 1 ? '' : 's'}`);
  if (!parts.length) return null;
  return (
    <p className={styles.seats}>
      <MaterialSymbol name="group" size="sm" />
      {parts.join(' · ')}
    </p>
  );
}

function SubscriptionCard({
  plan,
  isCurrent,
  preview,
  razorpayConfigured,
  payingId,
  onSubscribe,
  freePlanAdminOnly = false,
}) {
  const tier = plan.subscription_tier || 'standard';
  const isFree = tier === 'free';
  const isEnterprise = tier === 'enterprise' || plan.is_contact_sales === 1;
  const freeDisabled = isFree && freePlanAdminOnly && !preview;
  const discount = planDiscountPercent(plan);
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
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
            <span className={styles.interval}>
              / {plan.billing_interval === 'year' ? 'year' : 'month'}
            </span>
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

      <SeatSummary plan={plan} />
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
        onClick={() => onSubscribe?.(plan)}
        title={freeDisabled ? 'Free trial is assigned by your platform administrator' : undefined}
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

function filterStandardPlans(plans, interval) {
  return plans.filter((p) => {
    if (p.subscription_tier === 'free' || p.subscription_tier === 'enterprise') return false;
    if (p.is_contact_sales === 1) return false;
    if (p.subscription_tier === 'custom') return false;
    if (interval === 'year') return p.billing_interval === 'year';
    return p.billing_interval === 'month' || !p.billing_interval;
  });
}

function StandardPlanGrid({
  plans,
  interval,
  sectionLabel,
  assignedPlanId,
  preview,
  razorpayConfigured,
  payingId,
  onSubscribe,
  freePlanAdminOnly,
}) {
  const standardPlans = useMemo(() => filterStandardPlans(plans, interval), [plans, interval]);
  if (!standardPlans.length) return null;

  return (
    <>
      {sectionLabel ? <h3 className={styles.sectionLabel}>{sectionLabel}</h3> : null}
      <div className={styles.grid}>
        {standardPlans.map((plan) => (
          <SubscriptionCard
            key={plan.id}
            plan={plan}
            isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onSubscribe={onSubscribe}
            freePlanAdminOnly={freePlanAdminOnly}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Main subscription catalog (tenant_billing) — monthly / yearly toggle, free & enterprise rows.
 */
export function SubscriptionPricingGrid({
  plans = [],
  assignedPlanId = null,
  preview = false,
  singlePlan = false,
  /** Admin preview: show monthly and yearly standard plans together (no cycle toggle). */
  showAllIntervals = false,
  razorpayConfigured = true,
  payingId = null,
  onSubscribe,
  /** When true, free-tier cards are shown but purchase is disabled (super-admin assign only). */
  freePlanAdminOnly = true,
}) {
  const [interval, setInterval] = useState('month');

  const freePlans = useMemo(
    () => plans.filter((p) => p.subscription_tier === 'free'),
    [plans]
  );
  const enterprisePlans = useMemo(
    () => plans.filter((p) => p.subscription_tier === 'enterprise' || p.is_contact_sales === 1),
    [plans]
  );
  const customPlans = useMemo(
    () =>
      plans.filter(
        (p) => p.subscription_tier === 'custom' && p.is_contact_sales !== 1
      ),
    [plans]
  );
  const standardPlans = useMemo(() => filterStandardPlans(plans, interval), [plans, interval]);

  const hasYearly = plans.some(
    (p) => p.subscription_tier === 'standard' && p.billing_interval === 'year'
  );
  const hasMonthly = plans.some(
    (p) => p.subscription_tier === 'standard' && (p.billing_interval === 'month' || !p.billing_interval)
  );

  if (!plans.length) {
    return (
      <p className={styles.empty}>
        No subscription plans configured. Add plans under Admin → Telephony plans → Subscription plans.
      </p>
    );
  }

  if (singlePlan && plans.length > 0) {
    return (
      <div className={`${styles.wrap} ${styles.singlePlan}`}>
        <SubscriptionCard
          plan={plans[0]}
          isCurrent={false}
          preview={preview}
          razorpayConfigured={razorpayConfigured}
          payingId={payingId}
          onSubscribe={onSubscribe}
          freePlanAdminOnly={freePlanAdminOnly}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>{preview ? 'Subscription preview' : 'Choose your plan'}</h2>
        <p className={styles.subtitle}>
          {preview
            ? 'How tenants see main subscription plans on the website / Plans & billing.'
            : 'Pick a plan for your workspace. Credit plans can buy extra wallet packs below after subscribing.'}
        </p>
      </header>

      {freePlans.length > 0 ? (
        <div className={styles.grid}>
          {freePlans.map((plan) => (
            <SubscriptionCard
              key={plan.id}
              plan={plan}
              isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
              preview={preview}
              razorpayConfigured={razorpayConfigured}
              payingId={payingId}
              onSubscribe={onSubscribe}
              freePlanAdminOnly={freePlanAdminOnly}
            />
          ))}
        </div>
      ) : null}

      {showAllIntervals && preview ? (
        <>
          <StandardPlanGrid
            plans={plans}
            interval="month"
            sectionLabel={hasMonthly ? 'Monthly plans' : null}
            assignedPlanId={assignedPlanId}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onSubscribe={onSubscribe}
            freePlanAdminOnly={freePlanAdminOnly}
          />
          <StandardPlanGrid
            plans={plans}
            interval="year"
            sectionLabel={hasYearly ? 'Yearly plans' : null}
            assignedPlanId={assignedPlanId}
            preview={preview}
            razorpayConfigured={razorpayConfigured}
            payingId={payingId}
            onSubscribe={onSubscribe}
            freePlanAdminOnly={freePlanAdminOnly}
          />
        </>
      ) : (hasMonthly || hasYearly) ? (
        <div className={styles.toggle} role="group" aria-label="Billing cycle">
          {hasMonthly ? (
            <button
              type="button"
              className={`${styles.toggleBtn} ${interval === 'month' ? styles.toggleBtnActive : ''}`}
              onClick={() => setInterval('month')}
            >
              Monthly
            </button>
          ) : null}
          {hasYearly ? (
            <button
              type="button"
              className={`${styles.toggleBtn} ${interval === 'year' ? styles.toggleBtnActive : ''}`}
              onClick={() => setInterval('year')}
            >
              Yearly
            </button>
          ) : null}
        </div>
      ) : null}

      {!(showAllIntervals && preview) && standardPlans.length > 0 ? (
        <div className={styles.grid}>
          {standardPlans.map((plan) => (
            <SubscriptionCard
              key={plan.id}
              plan={plan}
              isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
              preview={preview}
              razorpayConfigured={razorpayConfigured}
              payingId={payingId}
              onSubscribe={onSubscribe}
              freePlanAdminOnly={freePlanAdminOnly}
            />
          ))}
        </div>
      ) : !(showAllIntervals && preview) ? (
        <p className={styles.emptyInterval}>
          No {interval === 'year' ? 'yearly' : 'monthly'} plans in the catalog yet.
        </p>
      ) : null}

      {customPlans.length > 0 ? (
        <>
          <h3 className={styles.sectionLabel}>Other plans</h3>
          <div className={styles.grid}>
            {customPlans.map((plan) => (
              <SubscriptionCard
                key={plan.id}
                plan={plan}
                isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
                preview={preview}
                razorpayConfigured={razorpayConfigured}
                payingId={payingId}
                onSubscribe={onSubscribe}
                freePlanAdminOnly={freePlanAdminOnly}
              />
            ))}
          </div>
        </>
      ) : null}

      {enterprisePlans.length > 0 ? (
        <>
          <h3 className={styles.sectionLabel}>Enterprise</h3>
          <div className={styles.grid}>
            {enterprisePlans.map((plan) => (
              <SubscriptionCard
                key={plan.id}
                plan={plan}
                isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
                preview={preview}
                razorpayConfigured={razorpayConfigured}
                payingId={payingId}
                onSubscribe={onSubscribe}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
