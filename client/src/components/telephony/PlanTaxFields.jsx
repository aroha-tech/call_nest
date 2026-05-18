import React, { useMemo } from 'react';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../ui/InfoHelpIcon';
import { GST_RATE_OPTIONS, computeTaxBreakdownFromRupee, pricesIncludeGst, resolveGstPercent } from '../../utils/planTaxUtils';
import { formatPaiseAsInr } from '../../utils/telephonyPlanFormUtils';
import { rupeeToPaise } from '../../utils/telephonyMoneyUtils';
import { PLAN_TAX_HELP_TEXT } from './planCycleCalculatorHelp';
import styles from './PlanTaxFields.module.scss';

function TaxBreakdownPreview({ form, sampleSaleRupee }) {
  const sample = useMemo(() => {
    const salePaise = rupeeToPaise(sampleSaleRupee ?? form.sale_price_paise ?? form.price_month_sale_paise);
    if (salePaise == null || salePaise <= 0) return null;
    const gst = resolveGstPercent(form);
    const inclusive = pricesIncludeGst(form);
    return computeTaxBreakdownFromRupee(Number(salePaise) / 100, gst, inclusive);
  }, [form, sampleSaleRupee]);

  if (!sample) {
    return (
      <p className={styles.previewMuted}>
        Enter a sale price above to see GST breakdown at checkout.
      </p>
    );
  }

  const { taxable_paise, gst_paise, total_paise, gst_percent } = sample;

  return (
    <div className={styles.preview}>
      <p className={styles.previewTitle}>Checkout preview ({gst_percent}% GST)</p>
      <dl className={styles.previewGrid}>
        <div>
          <dt>Taxable amount</dt>
          <dd>{formatPaiseAsInr(taxable_paise)}</dd>
        </div>
        <div>
          <dt>GST</dt>
          <dd>{formatPaiseAsInr(gst_paise)}</dd>
        </div>
        <div>
          <dt>Total charged</dt>
          <dd className={styles.previewTotal}>{formatPaiseAsInr(total_paise)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * GST rate and whether list prices include tax — applies to all billing cycles on this plan.
 */
export function PlanTaxFields({ form, setForm, sampleSaleRupee }) {
  const gstValue =
    form.gst_percent === '' || form.gst_percent == null ? '18' : String(form.gst_percent);

  return (
    <fieldset className={styles.wrap}>
      <div className={`${infoHelpHeadingRowClassName} ${styles.legendRow}`.trim()}>
        <legend className={styles.legend}>Tax (GST)</legend>
        <InfoHelpIcon title="Tax (GST) info" modalTitle="Tax (GST)" message={PLAN_TAX_HELP_TEXT} />
      </div>
      <div className={styles.grid}>
        <Select
          label="GST rate"
          value={gstValue}
          options={GST_RATE_OPTIONS}
          onChange={(e) => setForm((f) => ({ ...f, gst_percent: e.target.value }))}
        />
        <div className={styles.checkCell}>
          <Checkbox
            label="Sale prices include GST"
            checked={pricesIncludeGst(form)}
            onChange={(e) => setForm((f) => ({ ...f, prices_include_gst: e.target.checked }))}
          />
        </div>
      </div>
      <TaxBreakdownPreview form={form} sampleSaleRupee={sampleSaleRupee} />
    </fieldset>
  );
}
