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
