/**
 * Extract integer from labels like "₹1,499" or "\u20B914,388".
 * Returns null for "Custom" and other non-numeric displays.
 */
export function parseInrPriceLabel(label) {
  if (!label || /^custom\b/i.test(String(label).trim())) return null;
  const digits = String(label).replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}
