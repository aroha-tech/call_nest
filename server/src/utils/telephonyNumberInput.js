/** Normalize optional telephony E.164-ish fields from API (empty → null). */
export function normalizeTelephonyNullable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > 32 ? null : s;
}
