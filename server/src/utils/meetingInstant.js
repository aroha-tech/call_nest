/**
 * Meeting `start_at` / `end_at` are stored as UTC wall-clock in `DATETIME`
 * (see mysql2 pool `timezone: 'Z'` in `config/db.js`).
 * Naive `YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DDTHH:mm:ss` without offset are parsed as UTC.
 */

export function parseMeetingInstantUtc(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  if (/Z$/i.test(normalized) || /[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function meetingInstantToIsoUtc(v) {
  const d = parseMeetingInstantUtc(v);
  return d ? d.toISOString() : null;
}
