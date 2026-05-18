import React, { useMemo } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { SubscriptionCyclePricingFields } from './SubscriptionCyclePricingFields';
import {
  FEATURES_FORMAT,
  formatPaisePerMinHint,
  formatRupeeAmount,
} from '../../utils/telephonyPlanFormUtils';
import styles from './SubscriptionPlanFormFields.module.scss';

const BILLING_TYPE_OPTIONS = [
  { value: 'credit', label: 'Credit-based (wallet per minute)' },
  { value: 'unlimited', label: 'Unlimited (monthly minute cap)' },
];

export function SubscriptionPlanFormFields({ form, setForm, editing }) {
  const isFree = !!form.is_free_trial;
  const isEnterprise = !!form.is_contact_sales;

  const featuresFormat =
    form.features_format === FEATURES_FORMAT.JSON ? FEATURES_FORMAT.JSON : FEATURES_FORMAT.HTML;
  const useHtmlFeatures = featuresFormat === FEATURES_FORMAT.HTML;

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

      <p className={styles.bundleNote}>
        Subscription bundle: CRM + telephony + role access (admins, managers, agents) + optional
        unlimited-calling channels. Billing cycles and included wallet credit are configured below.
      </p>

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

      <div className={styles.flags}>
        <Checkbox
          label="Show on marketing website"
          checked={form.visible_on_website !== false}
          onChange={(e) => setForm((f) => ({ ...f, visible_on_website: e.target.checked }))}
        />
        <Checkbox
          label="Show in tenant billing panel"
          checked={form.visible_on_panel !== false}
          onChange={(e) => setForm((f) => ({ ...f, visible_on_panel: e.target.checked }))}
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
        <SubscriptionCyclePricingFields
          form={form}
          setForm={setForm}
          showIncludedCredit={form.plan_type === 'credit'}
        />
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend>Seats included in subscription (bundle)</legend>
        <p className={styles.fieldHint}>
          Caps for this plan. Extra seats are sold under Seat &amp; channel add-ons. Agent = dialer user.
        </p>
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
            label="Agents"
            type="number"
            min={0}
            value={form.seat_limit_agents}
            onChange={(e) => setForm((f) => ({ ...f, seat_limit_agents: e.target.value }))}
          />
          <Input
            label="Unlimited channels"
            type="number"
            min={0}
            value={form.seat_limit_channels}
            onChange={(e) => setForm((f) => ({ ...f, seat_limit_channels: e.target.value }))}
            hint="Channel = unlimited calling seat"
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

      <fieldset className={styles.featuresFieldset}>
        <legend>Plan features (tenant catalog)</legend>
        <p className={styles.fieldHint}>
          Choose one format. Only the selected option is saved and shown to tenants.
        </p>
        <div className={styles.formatToggle} role="radiogroup" aria-label="Features format">
          <button
            type="button"
            role="radio"
            aria-checked={useHtmlFeatures}
            className={`${styles.formatOption} ${useHtmlFeatures ? styles.formatOptionActive : ''}`}
            onClick={() => setForm((f) => ({ ...f, features_format: FEATURES_FORMAT.HTML }))}
          >
            HTML
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!useHtmlFeatures}
            className={`${styles.formatOption} ${!useHtmlFeatures ? styles.formatOptionActive : ''}`}
            onClick={() => setForm((f) => ({ ...f, features_format: FEATURES_FORMAT.JSON }))}
          >
            JSON list
          </button>
        </div>

        {useHtmlFeatures ? (
          <label className={styles.textareaLabel}>
            Features (HTML)
            <textarea
              className={styles.textarea}
              rows={6}
              value={form.features_html}
              onChange={(e) => setForm((f) => ({ ...f, features_html: e.target.value }))}
              placeholder='<ul><li>1 admin · 2 agents</li><li>Credit packs for top-up</li></ul>'
            />
          </label>
        ) : (
          <label className={styles.textareaLabel}>
            Features (JSON)
            <textarea
              className={styles.textarea}
              rows={6}
              value={form.features_json}
              onChange={(e) => setForm((f) => ({ ...f, features_json: e.target.value }))}
              placeholder={`[\n  "1 admin · 1 manager · 2 agents",\n  "Credit packs available for top-up"\n]`}
            />
            <span className={styles.textareaHint}>
              JSON array of strings, e.g. <code>["Feature one", "Feature two"]</code>
            </span>
          </label>
        )}
      </fieldset>

      <Checkbox
        label="Active"
        checked={!!form.is_active}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      />
    </div>
  );
}
