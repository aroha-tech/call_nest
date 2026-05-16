/**
 * Parse CC/BCC / multi-recipient fields from UI (commas, semicolons, newlines).
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
export function parseEmailRecipientList(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Collapse to a single comma-separated string for storage / mail headers. */
export function normalizeEmailRecipientListString(raw) {
  const parts = parseEmailRecipientList(raw);
  return parts.length ? parts.join(', ') : '';
}

/** Maximum CC/BCC addresses per field (matches validation in meeting email settings). */
export const MAX_EMAIL_RECIPIENTS = 20;

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @returns {null | string} first invalid token, or null if all valid / empty
 */
export function firstInvalidEmailInRecipientList(raw) {
  for (const p of parseEmailRecipientList(raw)) {
    if (!SIMPLE_EMAIL_RE.test(p)) return p;
  }
  return null;
}
