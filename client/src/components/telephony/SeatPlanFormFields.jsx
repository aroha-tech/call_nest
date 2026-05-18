import React from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { PlanPricingFields } from './PlanPricingFields';
import { PlanTaxFields } from './PlanTaxFields';
import { SEAT_ROLE_OPTIONS } from '../../constants/telephonyProductTypes';
import styles from './SeatPlanFormFields.module.scss';

export function SeatPlanFormFields({ form, setForm, editing }) {
  return (
    <div className={styles.col}>
      <p className={styles.intro}>
        Sell additional seats outside the subscription bundle. Each SKU is one role (admin, manager, or
        agent) with optional unlimited-calling channel. One-time purchase price.
      </p>
      <div className={styles.grid}>
        <Input label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input
          label="Code *"
          value={form.code}
          disabled={!!editing}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          hint={editing ? 'Code cannot be changed' : 'e.g. seat_agent_with_channel'}
        />
        <Select
          label="Seat role *"
          value={form.seat_role || 'agent'}
          options={SEAT_ROLE_OPTIONS}
          onChange={(e) => setForm((f) => ({ ...f, seat_role: e.target.value }))}
        />
      </div>
      <Input
        label="Description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Shown when tenant buys an extra seat"
      />
      <Checkbox
        label="Includes unlimited-calling channel"
        checked={!!form.includes_unlimited_channels}
        onChange={(e) =>
          setForm((f) => ({ ...f, includes_unlimited_channels: e.target.checked }))
        }
        hint="Channel = unlimited calling add-on for this seat (priced separately from agent-only)"
      />
      <PlanPricingFields
        form={form}
        setForm={setForm}
        saleLabel="Price per seat (₹) *"
        discountOptionalLabel
      />
      <PlanTaxFields form={form} setForm={setForm} sampleSaleRupee={form.sale_price_paise} />
      <Checkbox
        label="Active"
        checked={!!form.is_active}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      />
    </div>
  );
}
