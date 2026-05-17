import React, { useMemo } from 'react';
import { Input } from '../ui/Input';
import { formatRupeeAmount } from '../../utils/telephonyMoneyUtils';
import styles from './PlanPricingFields.module.scss';

/** Original / sale / discount — enter each value manually (no auto-sync). */
export function PlanPricingFields({
  form,
  setForm,
  saleLabel = 'Sale / subscribe price (₹) *',
  discountOptionalLabel = false,
}) {
  const hints = useMemo(
    () => ({
      orig: formatRupeeAmount(form.original_price_paise),
      sale: formatRupeeAmount(form.sale_price_paise),
    }),
    [form.original_price_paise, form.sale_price_paise]
  );

  return (
    <div className={styles.grid}>
      <Input
        label="Original price (₹)"
        type="number"
        min={0}
        step="1"
        value={form.original_price_paise}
        onChange={(e) => setForm((f) => ({ ...f, original_price_paise: e.target.value }))}
        hint={
          hints.orig !== '—'
            ? `List price ${hints.orig}`
            : 'Shown struck through when higher than sale'
        }
      />
      <Input
        label={saleLabel}
        type="number"
        min={0}
        step="1"
        value={form.sale_price_paise}
        onChange={(e) => setForm((f) => ({ ...f, sale_price_paise: e.target.value }))}
        hint={hints.sale !== '—' ? `Charge ${hints.sale}` : undefined}
      />
      <Input
        label={discountOptionalLabel ? 'Discount % (optional)' : 'Discount %'}
        type="number"
        min={0}
        max={100}
        step="1"
        value={form.discount_percent}
        onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
        hint={
          discountOptionalLabel
            ? 'Leave blank to auto-calculate from prices when saving'
            : 'Whole numbers only; not auto-filled from sale price'
        }
      />
    </div>
  );
}
