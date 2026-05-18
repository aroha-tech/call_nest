/** GST / tax breakdown for telephony plan checkout amounts (amounts in paise). */

export function resolveGstPercent(plan) {
  if (plan?.gst_percent == null || plan?.gst_percent === '') return 18;
  const n = Number(plan.gst_percent);
  if (!Number.isFinite(n)) return 18;
  return Math.min(100, Math.max(0, Math.floor(n)));
}

export function pricesIncludeGst(plan) {
  if (plan?.prices_include_gst == null || plan?.prices_include_gst === '') return true;
  return (
    plan.prices_include_gst === true ||
    plan.prices_include_gst === 1 ||
    plan.prices_include_gst === '1'
  );
}

/**
 * @returns {{ taxable_paise: number, gst_paise: number, total_paise: number, gst_percent: number }}
 */
export function computeTaxBreakdown(salePricePaise, gstPercent, includeGstInSalePrice) {
  const sale = Math.max(0, Math.floor(Number(salePricePaise) || 0));
  const rate = Math.min(100, Math.max(0, Math.floor(Number(gstPercent) || 0)));

  if (sale === 0 || rate === 0) {
    return { taxable_paise: sale, gst_paise: 0, total_paise: sale, gst_percent: rate };
  }

  if (includeGstInSalePrice) {
    const total = sale;
    const gst = Math.round((total * rate) / (100 + rate));
    const taxable = total - gst;
    return { taxable_paise: taxable, gst_paise: gst, total_paise: total, gst_percent: rate };
  }

  const taxable = sale;
  const gst = Math.round((taxable * rate) / 100);
  return { taxable_paise: taxable, gst_paise: gst, total_paise: taxable + gst, gst_percent: rate };
}

/** Amount charged via Razorpay (paise). */
export function computePlanChargePaise(plan, salePricePaise) {
  const gst = resolveGstPercent(plan);
  const inclusive = pricesIncludeGst(plan);
  return computeTaxBreakdown(salePricePaise, gst, inclusive).total_paise;
}
