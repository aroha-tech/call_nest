import React from 'react';
import { Input } from '../ui/Input';
import { PLAN_BILLING_CYCLES } from '../../utils/planCyclePricing';
import { PlanCyclePricingCalculator } from './PlanCyclePricingCalculator';
import { PlanTaxFields } from './PlanTaxFields';
import styles from './SubscriptionCyclePricingFields.module.scss';

function CycleRow({
  label,
  originalKey,
  saleKey,
  discountKey,
  includedCreditKey,
  showIncludedCredit,
  form,
  setForm,
}) {
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
        {showIncludedCredit ? (
          <Input
            label="Included wallet credit (₹)"
            type="number"
            min={0}
            step="0.01"
            value={form[includedCreditKey] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, [includedCreditKey]: e.target.value }))}
            hint="Granted once when this billing period starts"
          />
        ) : null}
      </div>
    </fieldset>
  );
}

/** Four billing cycles on one plan — not separate plan records. */
export function SubscriptionCyclePricingFields({ form, setForm, showIncludedCredit = false }) {
  return (
    <div className={styles.wrap}>
      <PlanCyclePricingCalculator form={form} setForm={setForm} showIncludedCredit={showIncludedCredit} />

      <PlanTaxFields form={form} setForm={setForm} sampleSaleRupee={form.price_month_sale_paise} />

      {PLAN_BILLING_CYCLES.map(({ value, label }) => {
        const originalKey = `price_${value}_original_paise`;
        const saleKey = `price_${value}_sale_paise`;
        const discountKey = `price_${value}_discount_percent`;
        const includedCreditKey = `included_wallet_credit_${value}_paise`;
        return (
          <CycleRow
            key={value}
            label={label}
            originalKey={originalKey}
            saleKey={saleKey}
            discountKey={discountKey}
            includedCreditKey={includedCreditKey}
            showIncludedCredit={showIncludedCredit}
            form={form}
            setForm={setForm}
          />
        );
      })}
    </div>
  );
}
