import React, { useMemo } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import {
  formatPaisePerMinHint,
  formatRupeeAmount,
} from '../../utils/telephonyPlanFormUtils';
import { PlanPricingFields } from './PlanPricingFields';
import styles from './CreditPackFormFields.module.scss';

const BILLING_TYPE_OPTIONS = [
  { value: 'credit', label: 'Credit (pay per minute)' },
  { value: 'unlimited', label: 'Unlimited (usage cap)' },
];

const INTERVAL_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'one_time', label: 'One-time pack' },
];

export function CreditPackFormFields({ form, setForm, editing, category }) {
  const isPurchase = category === 'credit_purchase';
  const isCreditBilling = !isPurchase && form.plan_type === 'credit';

  const hints = useMemo(
    () => ({
      rate: formatPaisePerMinHint(form.call_rate_paise_per_minute),
      byo: formatPaisePerMinHint(form.byo_platform_fee_paise_per_minute),
      wallet: formatRupeeAmount(form.wallet_credit_paise),
      minBal: formatRupeeAmount(form.call_min_balance_paise),
    }),
    [form]
  );

  return (
    <div className={styles.col}>
      <div className={styles.grid}>
        <Input label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input
          label="Code *"
          value={form.code}
          disabled={!!editing}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          hint={editing ? 'Code cannot be changed' : 'e.g. credit_growth_pack'}
        />
        {!isPurchase ? (
          <Select
            label="Billing type *"
            value={form.plan_type}
            options={BILLING_TYPE_OPTIONS}
            onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}
          />
        ) : null}
      </div>
      <Input
        label="Description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Shown to tenant admins"
      />
      {isPurchase ? (
        <>
          <Select
            label="Billing cycle *"
            value={form.billing_interval}
            options={INTERVAL_OPTIONS}
            onChange={(e) => setForm((f) => ({ ...f, billing_interval: e.target.value }))}
          />
          <PlanPricingFields
            form={form}
            setForm={setForm}
            saleLabel="Sale / buy price (₹) *"
            discountOptionalLabel
          />
          <Input
            label="Wallet credit granted (₹) *"
            type="number"
            min={0}
            step="0.01"
            value={form.wallet_credit_paise}
            onChange={(e) => setForm((f) => ({ ...f, wallet_credit_paise: e.target.value }))}
            hint={hints.wallet !== '—' ? `Credits added ${hints.wallet}` : undefined}
          />
        </>
      ) : isCreditBilling ? (
        <>
          <p className={styles.rateHint}>
            Per-minute charges use paise (100 paise = ₹1). Minimum balance is in rupees.
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
              label="Min wallet balance (₹) *"
              type="number"
              min={0}
              step="0.01"
              value={form.call_min_balance_paise}
              onChange={(e) => setForm((f) => ({ ...f, call_min_balance_paise: e.target.value }))}
              hint={hints.minBal !== '—' ? `Minimum ${hints.minBal}` : undefined}
            />
          </div>
        </>
      ) : (
        <Input
          label="Monthly minute cap *"
          type="number"
          min={0}
          value={form.unlimited_minutes_cap_per_month}
          onChange={(e) =>
            setForm((f) => ({ ...f, unlimited_minutes_cap_per_month: e.target.value }))
          }
          hint="0 = no monthly cap"
        />
      )}
      <Checkbox
        label="Active"
        checked={!!form.is_active}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      />
    </div>
  );
}
