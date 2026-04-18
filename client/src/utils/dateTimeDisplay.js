/** Matches server `users.datetime_display_mode` / JWT `datetime_display_mode`. */
export const DATETIME_DISPLAY_IST = 'ist_fixed';
export const DATETIME_DISPLAY_BROWSER = 'browser_local';

export function normalizeDateTimeDisplayMode(v) {
  if (v === DATETIME_DISPLAY_BROWSER) return DATETIME_DISPLAY_BROWSER;
  return DATETIME_DISPLAY_IST;
}

/**
 * Format an ISO/date value for UI tables and detail views.
 * - ist_fixed: India (Asia/Kolkata), en-IN style DD/MM/YYYY + 12h time with seconds
 * - browser_local: system timezone + locale
 */
export function formatDateTimeDisplay(value, mode) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const m = normalizeDateTimeDisplayMode(mode);
  const opts = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  if (m === DATETIME_DISPLAY_IST) {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'Asia/Kolkata' }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

/** Compact relative time for activity feeds (e.g. "31 seconds ago"). */
export function formatRelativeTimeShort(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.round((t - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.trunc(diffSec / 3600);
  if (Math.abs(diffHr) < 48) return rtf.format(diffHr, 'hour');
  const diffDay = Math.trunc(diffSec / 86400);
  return rtf.format(diffDay, 'day');
}
