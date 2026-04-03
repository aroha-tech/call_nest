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
