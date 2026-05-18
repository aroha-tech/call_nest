/** GST / tax display helpers (mirrors server planTaxUtils). */

import { formatPaiseAsInr } from './telephonyPlanFormUtils';

export const GST_RATE_OPTIONS = [
  { value: '0', label: '0% — No tax' },
  { value: '5', label: '5% GST' },
  { value: '12', label: '12% GST' },
  { value: '18', label: '18% GST (standard)' },
  { value: '28', label: '28% GST' },
];

export function resolveGstPercent(planOrForm) {
  const raw = planOrForm?.gst_percent;
  if (raw == null || raw === '') return 18;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 18;
  return Math.min(100, Math.max(0, Math.floor(n)));
}

export function pricesIncludeGst(planOrForm) {
  const raw = planOrForm?.prices_include_gst;
  if (raw == null || raw === '') return true;
  return raw === true || raw === 1 || raw === '1';
}

export function computeTaxBreakdownFromRupee(saleRupee, gstPercent, includeGstInSalePrice) {
  const salePaise = Math.round(Number(saleRupee || 0) * 100);
  const rate = Math.min(100, Math.max(0, Math.floor(Number(gstPercent) || 0)));

  if (salePaise <= 0 || rate === 0) {
    return { taxable_paise: salePaise, gst_paise: 0, total_paise: salePaise, gst_percent: rate };
  }

  if (includeGstInSalePrice) {
    const total = salePaise;
    const gst = Math.round((total * rate) / (100 + rate));
    const taxable = total - gst;
    return { taxable_paise: taxable, gst_paise: gst, total_paise: total, gst_percent: rate };
  }

  const taxable = salePaise;
  const gst = Math.round((taxable * rate) / 100);
  return { taxable_paise: taxable, gst_paise: gst, total_paise: taxable + gst, gst_percent: rate };
}

export function computeTaxBreakdownFromPaise(salePaise, gstPercent, includeGstInSalePrice) {
  return computeTaxBreakdownFromRupee(Number(salePaise) / 100, gstPercent, includeGstInSalePrice);
}

/** Tenant-facing price line for a sale amount in paise. */
export function formatPriceWithTax(salePaise, planOrForm) {
  const sale = Math.max(0, Math.floor(Number(salePaise) || 0));
  if (sale <= 0) return { main: '—', taxLine: null };

  const gst = resolveGstPercent(planOrForm);
  const inclusive = pricesIncludeGst(planOrForm);
  const b = computeTaxBreakdownFromPaise(sale, gst, inclusive);

  if (gst === 0) {
    return { main: formatPaiseAsInr(sale), taxLine: null };
  }

  if (inclusive) {
    return {
      main: formatPaiseAsInr(b.total_paise),
      taxLine: `incl. ${gst}% GST (${formatPaiseAsInr(b.gst_paise)})`,
    };
  }

  return {
    main: formatPaiseAsInr(b.total_paise),
    taxLine: `${formatPaiseAsInr(b.taxable_paise)} + ${gst}% GST (${formatPaiseAsInr(b.gst_paise)})`,
  };
}
