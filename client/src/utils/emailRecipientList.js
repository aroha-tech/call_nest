/**
 * Client-side parsing for CC/BCC display (matches server splitting).
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

export function formatEmailRecipientListDisplay(raw) {
  const parts = parseEmailRecipientList(raw);
  return parts.length ? parts.join(', ') : '';
}
