import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import styles from './CreditPurchasePricingGrid.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function intervalLabel(interval) {
  if (interval === 'year') return 'per year';
  if (interval === 'one_time') return 'one-time';
  return 'per month';
}

function billingCycleLabel(interval, count = 1) {
  if (interval === 'year') return `Billed every ${count} year(s)`;
  if (interval === 'one_time') return 'One-time purchase';
  return `Billed every ${count} month(s)`;
}

function planDiscountPercent(plan) {
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
  if (plan.discount_percent != null && plan.discount_percent > 0) return plan.discount_percent;
  if (Number.isFinite(orig) && orig > sale && sale > 0) {
    return Math.round((1 - sale / orig) * 100);
  }
  return null;
}

/**
 * SaaS-style pricing grid for call credit purchase packs (tenant + super-admin preview).
 */
function CreditPackCard({ plan, preview, razorpayConfigured, payingId, onPurchase, featured = false }) {
  const discount = planDiscountPercent(plan);
  const orig = Number(plan.original_price_paise);
  const sale = Number(plan.sale_price_paise);
  const showStrike = Number.isFinite(orig) && orig > sale;
  const isOneTime = plan.billing_interval === 'one_time';

  return (
    <Card className={[styles.card, featured && styles.cardFeatured].filter(Boolean).join(' ')}>
      {(featured || discount > 0) && (
        <div className={styles.cardBadge}>
          {discount > 0 ? (
            <Badge variant="primary" size="sm">
              {discount}% off
            </Badge>
          ) : featured ? (
            <Badge variant="primary" size="sm">
              Popular
            </Badge>
          ) : null}
        </div>
      )}
      <h3 className={styles.cardName}>{plan.name}</h3>
      <div className={styles.priceBlock}>
        {showStrike ? <span className={styles.originalPrice}>{formatPaiseAsInr(orig)}</span> : null}
        <span className={styles.salePrice}>{formatPaiseAsInr(sale)}</span>
        {!isOneTime ? (
          <span className={styles.interval}>{intervalLabel(plan.billing_interval)}</span>
        ) : null}
      </div>
      {!isOneTime ? <p className={styles.cycle}>{billingCycleLabel(plan.billing_interval)}</p> : null}
      <p className={styles.walletLine}>
        <MaterialSymbol name="account_balance_wallet" size="sm" />
        <span>
          Wallet credit: <strong>{formatPaiseAsInr(plan.wallet_credit_paise)}</strong>
        </span>
      </p>
      {plan.description ? <p className={styles.desc}>{plan.description}</p> : null}
      {!isOneTime ? (
        <ul className={styles.features}>
          <li>
            <MaterialSymbol name="check" size="sm" />
            Instant credit to your call wallet
          </li>
          <li>
            <MaterialSymbol name="check" size="sm" />
            Pay per connected minute after top-up
          </li>
        </ul>
      ) : null}
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
    </Card>
  );
}

export function CreditPurchasePricingGrid({
  plans = [],
  preview = false,
  singlePlan = false,
  razorpayConfigured = true,
  payingId = null,
  onPurchase,
  featuredIndex,
  emptyMessage = 'No credit packs are available yet. Ask your platform admin to add packs under Telephony plans.',
}) {
  const [interval, setInterval] = useState('month');

  const oneTimePlans = useMemo(
    () => plans.filter((p) => p.billing_interval === 'one_time'),
    [plans]
  );

  const intervalPlans = useMemo(() => {
    return plans.filter((p) => {
      if (p.billing_interval === 'one_time') return false;
      if (interval === 'year') return p.billing_interval === 'year';
      return p.billing_interval === 'month' || !p.billing_interval;
    });
  }, [plans, interval]);

  const hasYearly = useMemo(() => plans.some((p) => p.billing_interval === 'year'), [plans]);
  const hasMonthly = useMemo(
    () => plans.some((p) => p.billing_interval === 'month' || !p.billing_interval),
    [plans]
  );

  const featuredIdx = useMemo(() => {
    if (featuredIndex != null) return featuredIndex;
    if (intervalPlans.length <= 1) return 0;
    return Math.min(1, Math.floor(intervalPlans.length / 2));
  }, [featuredIndex, intervalPlans.length]);

  if (!plans.length) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  if (singlePlan && plans.length > 0) {
    return (
      <div className={`${styles.wrap} ${styles.singlePlan}`}>
        <CreditPackCard
          plan={plans[0]}
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
        <h2 className={styles.title}>{preview ? 'Credit pack preview' : 'Call credit packs'}</h2>
        <p className={styles.subtitle}>
          {preview
            ? 'Nested under the billing plan when the tenant uses credit + platform calling.'
            : 'Top up your call wallet (monthly, yearly, or one-time). Prices are set by your platform administrator.'}
        </p>
      </div>

      {(hasMonthly || hasYearly) && (
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
      )}

      {intervalPlans.length > 0 ? (
        <div className={styles.grid}>
          {intervalPlans.map((plan, idx) => {
            const isFeatured = idx === featuredIdx && intervalPlans.length > 1;
            const discount = planDiscountPercent(plan);
            const orig = Number(plan.original_price_paise);
            const sale = Number(plan.sale_price_paise);
            const showStrike = Number.isFinite(orig) && orig > sale;

            return (
              <Card
                key={plan.id}
                className={[styles.card, isFeatured && styles.cardFeatured].filter(Boolean).join(' ')}
              >
                {(isFeatured || discount > 0) && (
                  <div className={styles.cardBadge}>
                    {discount > 0 ? (
                      <Badge variant="primary" size="sm">
                        {discount}% off
                      </Badge>
                    ) : isFeatured ? (
                      <Badge variant="primary" size="sm">
                        Popular
                      </Badge>
                    ) : null}
                  </div>
                )}
                <h3 className={styles.cardName}>{plan.name}</h3>
                <div className={styles.priceBlock}>
                  {showStrike ? (
                    <span className={styles.originalPrice}>{formatPaiseAsInr(orig)}</span>
                  ) : null}
                  <span className={styles.salePrice}>{formatPaiseAsInr(sale)}</span>
                  <span className={styles.interval}>{intervalLabel(plan.billing_interval)}</span>
                </div>
                <p className={styles.cycle}>{billingCycleLabel(plan.billing_interval)}</p>
                <p className={styles.walletLine}>
                  <MaterialSymbol name="account_balance_wallet" size="sm" />
                  <span>
                    Wallet credit: <strong>{formatPaiseAsInr(plan.wallet_credit_paise)}</strong>
                  </span>
                </p>
                {plan.description ? <p className={styles.desc}>{plan.description}</p> : null}
                <ul className={styles.features}>
                  <li>
                    <MaterialSymbol name="check" size="sm" />
                    Instant credit to your call wallet
                  </li>
                  <li>
                    <MaterialSymbol name="check" size="sm" />
                    Pay per connected minute after top-up
                  </li>
                </ul>
                <Button
                  variant={isFeatured ? 'primary' : 'secondary'}
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
              </Card>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyInterval}>
          No {interval === 'year' ? 'yearly' : 'monthly'} packs yet. Try the other billing cycle or ask your admin to
          add plans.
        </p>
      )}

      {oneTimePlans.length > 0 ? (
        <>
          <h3 className={styles.oneTimeHead}>One-time packs</h3>
          <div className={styles.grid}>
            {oneTimePlans.map((plan) => {
              const discount = planDiscountPercent(plan);
              const orig = Number(plan.original_price_paise);
              const sale = Number(plan.sale_price_paise);
              const showStrike = Number.isFinite(orig) && orig > sale;
              return (
                <Card key={plan.id} className={styles.card}>
                  {discount > 0 ? (
                    <div className={styles.cardBadge}>
                      <Badge variant="primary" size="sm">
                        {discount}% off
                      </Badge>
                    </div>
                  ) : null}
                  <h3 className={styles.cardName}>{plan.name}</h3>
                  <div className={styles.priceBlock}>
                    {showStrike ? (
                      <span className={styles.originalPrice}>{formatPaiseAsInr(orig)}</span>
                    ) : null}
                    <span className={styles.salePrice}>{formatPaiseAsInr(sale)}</span>
                  </div>
                  <p className={styles.walletLine}>
                    <MaterialSymbol name="account_balance_wallet" size="sm" />
                    <span>
                      Wallet credit: <strong>{formatPaiseAsInr(plan.wallet_credit_paise)}</strong>
                    </span>
                  </p>
                  {plan.description ? <p className={styles.desc}>{plan.description}</p> : null}
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={preview || payingId != null || !razorpayConfigured}
                    onClick={() => onPurchase?.(plan)}
                  >
                    {preview ? 'Buy credits' : payingId === plan.id ? 'Opening checkout…' : 'Pay with Razorpay'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
