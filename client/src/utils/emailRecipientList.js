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

/** Pragmatic single-address check (multi-part local segments not fully validated). */
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @returns {{ valid: boolean, invalidParts: string[], normalized: string }}
 */
export function validateEmailRecipientList(raw) {
  const parts = parseEmailRecipientList(raw);
  if (!parts.length) return { valid: true, invalidParts: [], normalized: '' };
  const invalidParts = parts.filter((p) => !SIMPLE_EMAIL_RE.test(p));
  const normalized = parts.join(', ');
  return {
    valid: invalidParts.length === 0,
    invalidParts,
    normalized,
  };
}

/**
 * Collapse to a single comma-separated string for storage (matches server).
 */
export function normalizeEmailRecipientListString(raw) {
  const parts = parseEmailRecipientList(raw);
  return parts.length ? parts.join(', ') : '';
}

export function formatEmailRecipientListDisplay(raw) {
  const parts = parseEmailRecipientList(raw);
  return parts.length ? parts.join(', ') : '';
}
