import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import styles from './TenantBillingPlanCards.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function TenantBillingPlanCard({ plan, isCurrent }) {
  const isCredit = plan.plan_type === 'credit';
  return (
    <Card className={`${styles.card} ${isCurrent ? styles.cardCurrent : ''}`.trim()}>
      {isCurrent ? (
        <div className={styles.badge}>
          <Badge variant="success" size="sm">
            Your plan
          </Badge>
        </div>
      ) : null}
      <div className={styles.cardHead}>
        <MaterialSymbol name={isCredit ? 'account_balance_wallet' : 'all_inclusive'} size="sm" />
        <h3 className={styles.cardName}>{plan.name}</h3>
      </div>
      <p className={styles.cardDesc}>{plan.description || plan.code}</p>
      <ul className={styles.features}>
        {isCredit ? (
          <>
            <li>
              <MaterialSymbol name="check" size="sm" />
              {formatPaiseAsInr(plan.call_rate_paise_per_minute)}/min connected
            </li>
            <li>
              <MaterialSymbol name="check" size="sm" />
              Min wallet {formatPaiseAsInr(plan.call_min_balance_paise)} to dial
            </li>
            <li>
              <MaterialSymbol name="check" size="sm" />
              BYO fee {formatPaiseAsInr(plan.byo_platform_fee_paise_per_minute)}/min
            </li>
          </>
        ) : (
          <>
            <li>
              <MaterialSymbol name="check" size="sm" />
              Unlimited connected minutes
            </li>
            <li>
              <MaterialSymbol name="check" size="sm" />
              {Number(plan.unlimited_minutes_cap_per_month) > 0
                ? `${Number(plan.unlimited_minutes_cap_per_month).toLocaleString('en-IN')} min / month cap`
                : 'No monthly minute cap'}
            </li>
          </>
        )}
      </ul>
      <p className={styles.foot}>
        {isCurrent
          ? 'Assigned by your platform administrator.'
          : 'Available template when your admin changes your billing mode.'}
      </p>
    </Card>
  );
}

/**
 * Tenant billing templates (credit or unlimited) — not purchasable; assigned by super admin.
 */
export function TenantBillingPlanCards({
  plans = [],
  assignedPlanId = null,
  callBillingMode = 'credit',
  preview = false,
}) {
  const modeLabel = callBillingMode === 'unlimited' ? 'Unlimited calling' : 'Credit (pay per minute)';

  if (!plans.length) {
    return (
      <p className={styles.empty}>
        No {callBillingMode === 'unlimited' ? 'unlimited' : 'credit'} billing plans are configured yet.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>{preview ? 'Tenant billing plan preview' : 'Your calling plan'}</h2>
        <p className={styles.subtitle}>
          {preview
            ? `Templates shown to tenants on ${modeLabel} billing (assigned by platform admin).`
            : `Your workspace uses ${modeLabel}. Rates and limits come from the plan below.`}
        </p>
      </header>
      <div className={styles.grid}>
        {plans.map((plan) => (
          <TenantBillingPlanCard
            key={plan.id}
            plan={plan}
            isCurrent={assignedPlanId != null && Number(plan.id) === Number(assignedPlanId)}
          />
        ))}
      </div>
    </div>
  );
}
