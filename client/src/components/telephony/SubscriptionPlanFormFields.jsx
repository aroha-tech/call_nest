import React, { useMemo } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { SubscriptionCyclePricingFields } from './SubscriptionCyclePricingFields';
import { formatPaisePerMinHint, formatRupeeAmount } from '../../utils/telephonyPlanFormUtils';
import styles from './SubscriptionPlanFormFields.module.scss';

const BILLING_TYPE_OPTIONS = [
  { value: 'credit', label: 'Credit-based (wallet per minute)' },
  { value: 'unlimited', label: 'Unlimited (monthly minute cap)' },
];

export function SubscriptionPlanFormFields({ form, setForm, editing }) {
  const isFree = !!form.is_free_trial;
  const isEnterprise = !!form.is_contact_sales;

  const hints = useMemo(
    () => ({
      included: formatRupeeAmount(form.included_wallet_credit_paise),
      rate: formatPaisePerMinHint(form.call_rate_paise_per_minute),
      byo: formatPaisePerMinHint(form.byo_platform_fee_paise_per_minute),
      minBal: formatRupeeAmount(form.call_min_balance_paise),
    }),
    [form]
  );

  return (
    <div className={styles.col}>
      <div className={styles.grid}>
        <Input label="Plan name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input
          label="Code *"
          value={form.code}
          disabled={!!editing}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          hint={editing ? 'Code cannot be changed' : 'Unique id, e.g. starter_credit'}
        />
        <Select
          label="Subscription type *"
          value={form.plan_type}
          options={BILLING_TYPE_OPTIONS}
          onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}
        />
        <Input
          label="Internal label (optional)"
          value={form.subscription_tier || ''}
          onChange={(e) => setForm((f) => ({ ...f, subscription_tier: e.target.value }))}
          hint="Not shown to tenants; use Plan name for display"
        />
      </div>

      <Input
        label="Short description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />

      <div className={styles.flags}>
        <Checkbox
          label="Free trial (no self-serve checkout)"
          checked={!!form.is_free_trial}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              is_free_trial: e.target.checked,
              is_contact_sales: e.target.checked ? false : f.is_contact_sales,
            }))
          }
        />
        <Checkbox
          label="Contact sales / custom (no checkout)"
          checked={!!form.is_contact_sales}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              is_contact_sales: e.target.checked,
              is_free_trial: e.target.checked ? false : f.is_free_trial,
            }))
          }
        />
      </div>

      {isFree ? (
        <div className={styles.grid}>
          <Input
            label="Trial duration (days) *"
            type="number"
            min={1}
            value={form.trial_duration_days}
            onChange={(e) => setForm((f) => ({ ...f, trial_duration_days: e.target.value }))}
          />
          <Input
            label="Included call credits (₹)"
            type="number"
            min={0}
            step="0.01"
            value={form.included_wallet_credit_paise}
            onChange={(e) => setForm((f) => ({ ...f, included_wallet_credit_paise: e.target.value }))}
            hint={hints.included !== '—' ? `Wallet credit ${hints.included}` : undefined}
          />
        </div>
      ) : !isEnterprise ? (
        <SubscriptionCyclePricingFields form={form} setForm={setForm} />
      ) : null}

      {!isEnterprise && form.plan_type === 'credit' && !isFree ? (
        <Input
          label="Included wallet credit per billing period (₹)"
          type="number"
          min={0}
          step="0.01"
          value={form.included_wallet_credit_paise}
          onChange={(e) => setForm((f) => ({ ...f, included_wallet_credit_paise: e.target.value }))}
          hint={hints.included !== '—' ? `Granted on subscribe: ${hints.included}` : undefined}
        />
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend>Seat limits (included in plan)</legend>
        <div className={styles.grid}>
          <Input
            label="Admins"
            type="number"
            min={0}
            value={form.seat_limit_admins}
            onChange={(e) => setForm((f) => ({ ...f, seat_limit_admins: e.target.value }))}
          />
          <Input
            label="Managers"
            type="number"
            min={0}
            value={form.seat_limit_managers}
            onChange={(e) => setForm((f) => ({ ...f, seat_limit_managers: e.target.value }))}
          />
          <Input
            label="Users"
            type="number"
            min={0}
            value={form.seat_limit_users}
            onChange={(e) => setForm((f) => ({ ...f, seat_limit_users: e.target.value }))}
          />
        </div>
      </fieldset>

      {form.plan_type === 'credit' ? (
        <fieldset className={styles.fieldset}>
          <legend>Credit telephony rates</legend>
          <p className={styles.fieldHint}>
            Per-minute charges use paise (100 paise = ₹1). Other amounts are in rupees.
          </p>
          <div className={styles.grid}>
            <Input
              label="Call rate (paise / min) *"
              type="number"
              min={0}
              value={form.call_rate_paise_per_minute}
              onChange={(e) => setForm((f) => ({ ...f, call_rate_paise_per_minute: e.target.value }))}
              hint={hints.rate}
            />
            <Input
              label="BYO fee (paise / min) *"
              type="number"
              min={0}
              value={form.byo_platform_fee_paise_per_minute}
              onChange={(e) =>
                setForm((f) => ({ ...f, byo_platform_fee_paise_per_minute: e.target.value }))
              }
              hint={hints.byo}
            />
            <Input
              label="Min wallet to dial (₹) *"
              type="number"
              min={0}
              step="0.01"
              value={form.call_min_balance_paise}
              onChange={(e) => setForm((f) => ({ ...f, call_min_balance_paise: e.target.value }))}
              hint={hints.minBal !== '—' ? `Minimum balance ${hints.minBal}` : undefined}
            />
          </div>
        </fieldset>
      ) : (
        <Input
          label="Monthly minute cap *"
          type="number"
          min={0}
          value={form.unlimited_minutes_cap_per_month}
          onChange={(e) =>
            setForm((f) => ({ ...f, unlimited_minutes_cap_per_month: e.target.value }))
          }
          hint="0 = no cap"
        />
      )}

      <label className={styles.textareaLabel}>
        Features (HTML)
        <textarea
          className={styles.textarea}
          rows={6}
          value={form.features_html}
          onChange={(e) => setForm((f) => ({ ...f, features_html: e.target.value }))}
          placeholder='<ul><li>Feature one</li></ul>'
        />
      </label>

      <label className={styles.textareaLabel}>
        Features (JSON fallback)
        <textarea
          className={styles.textarea}
          rows={4}
          value={form.features_json}
          onChange={(e) => setForm((f) => ({ ...f, features_json: e.target.value }))}
          placeholder='["Feature one"]'
        />
      </label>

      <Checkbox
        label="Active"
        checked={!!form.is_active}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      />
    </div>
  );
}
