/**
 * Telephony money conventions:
 * - API / DB: amounts stored as paise (integer).
 * - Admin forms: rupees (₹) for prices, wallet credits, min balance.
 * - Admin forms: paise per connected minute for call rate & BYO fee only.
 */

export const TELEPHONY_RUPEE_FORM_FIELDS = [
  'original_price_paise',
  'sale_price_paise',
  'wallet_credit_paise',
  'included_wallet_credit_paise',
  'included_wallet_credit_month_paise',
  'included_wallet_credit_quarter_paise',
  'included_wallet_credit_semiannual_paise',
  'included_wallet_credit_year_paise',
  'call_min_balance_paise',
  'default_call_min_balance_paise',
  'call_min_balance_paise_override',
];

export const TELEPHONY_PAISE_PER_MIN_FIELDS = [
  'call_rate_paise_per_minute',
  'byo_platform_fee_paise_per_minute',
  'default_call_rate_paise_per_minute',
  'default_byo_platform_fee_paise_per_minute',
  'call_rate_paise_per_minute_override',
  'byo_platform_fee_paise_per_minute_override',
];

export function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

/** Format a rupee amount already entered in the form (not paise). */
export function formatRupeeAmount(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

/** DB paise → rupee string for form inputs. */
export function paiseToRupeeInput(paise) {
  if (paise == null || paise === '') return '';
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  const rupees = n / 100;
  if (Number.isInteger(rupees)) return String(rupees);
  return String(Number(rupees.toFixed(2)));
}

/** Form rupees → integer paise for API. */
export function rupeeToPaise(rupees) {
  if (rupees == null || String(rupees).trim() === '') return null;
  const n = Number(rupees);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function safePaisePerMin(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function mapRowPaiseToRupeeForm(row, fields = TELEPHONY_RUPEE_FORM_FIELDS) {
  if (!row) return row;
  const out = { ...row };
  for (const key of fields) {
    if (key in out && out[key] != null) {
      out[key] = paiseToRupeeInput(out[key]);
    }
  }
  return out;
}

export function mapFormRupeeToPaiseBody(body, fields = TELEPHONY_RUPEE_FORM_FIELDS) {
  const out = { ...body };
  for (const key of fields) {
    if (key in out) {
      out[key] = rupeeToPaise(out[key]);
    }
  }
  return out;
}

export function formatPaisePerMinHint(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '—';
  return `${n} paise/min (≈ ${formatPaiseAsInr(n)}/min)`;
}

