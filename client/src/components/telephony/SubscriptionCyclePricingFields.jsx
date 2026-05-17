import React from 'react';
import { Input } from '../ui/Input';
import { PLAN_BILLING_CYCLES } from '../../utils/planCyclePricing';
import styles from './SubscriptionCyclePricingFields.module.scss';

function CycleRow({ label, originalKey, saleKey, discountKey, form, setForm }) {
  return (
    <fieldset className={styles.cycleRow}>
      <legend className={styles.cycleLegend}>{label}</legend>
      <div className={styles.grid}>
        <Input
          label="Original (₹)"
          type="number"
          min={0}
          step="1"
          value={form[originalKey] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [originalKey]: e.target.value }))}
        />
        <Input
          label="Sale price (₹) *"
          type="number"
          min={0}
          step="1"
          value={form[saleKey] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [saleKey]: e.target.value }))}
        />
        <Input
          label="Discount %"
          type="number"
          min={0}
          max={100}
          step="1"
          value={form[discountKey] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [discountKey]: e.target.value }))}
          hint="Optional; can be derived from prices on save"
        />
      </div>
    </fieldset>
  );
}

/** Four billing cycles on one plan — not separate plan records. */
export function SubscriptionCyclePricingFields({ form, setForm }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        Set prices for each billing cycle on this plan. Tenants pick a cycle at checkout. Leave a cycle
        empty to hide it.
      </p>
      {PLAN_BILLING_CYCLES.map(({ value, label }) => {
        const originalKey = `price_${value}_original_paise`;
        const saleKey = `price_${value}_sale_paise`;
        const discountKey = `price_${value}_discount_percent`;
        return (
          <CycleRow
            key={value}
            label={label}
            originalKey={originalKey}
            saleKey={saleKey}
            discountKey={discountKey}
            form={form}
            setForm={setForm}
          />
        );
      })}
    </div>
  );
}
