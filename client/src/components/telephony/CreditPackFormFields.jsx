import React, { useMemo } from 'react';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { formatRupeeAmount } from '../../utils/telephonyPlanFormUtils';
import { PlanPricingFields } from './PlanPricingFields';
import { PlanTaxFields } from './PlanTaxFields';
import styles from './CreditPackFormFields.module.scss';

export function CreditPackFormFields({ form, setForm, editing }) {
  const hints = useMemo(
    () => ({
      wallet: formatRupeeAmount(form.wallet_credit_paise),
    }),
    [form]
  );

  return (
    <div className={styles.col}>
      <p className={styles.intro}>
        One-time wallet credit only — not a subscription. Tenants on a credit subscription can buy these
        packs when they need more call balance.
      </p>
      <div className={styles.grid}>
        <Input label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input
          label="Code *"
          value={form.code}
          disabled={!!editing}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          hint={editing ? 'Code cannot be changed' : 'e.g. credit_pack_growth'}
        />
      </div>
      <Input
        label="Description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Shown to tenant admins"
      />
      <PlanPricingFields
        form={form}
        setForm={setForm}
        saleLabel="Buy price (₹) *"
        discountOptionalLabel
      />
      <PlanTaxFields form={form} setForm={setForm} sampleSaleRupee={form.sale_price_paise} />
      <Input
        label="Wallet credit granted (₹) *"
        type="number"
        min={0}
        step="0.01"
        value={form.wallet_credit_paise}
        onChange={(e) => setForm((f) => ({ ...f, wallet_credit_paise: e.target.value }))}
        hint={hints.wallet !== '—' ? `Credits added ${hints.wallet}` : undefined}
      />
      <Checkbox
        label="Active"
        checked={!!form.is_active}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      />
    </div>
  );
}
