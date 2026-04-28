/** Matches server `users.datetime_display_mode` / JWT `datetime_display_mode`. */
export const DATETIME_DISPLAY_IST = 'ist_fixed';
export const DATETIME_DISPLAY_BROWSER = 'browser_local';

export const DATE_FORMAT_DD_MM_YYYY = 'DD-MM-YYYY';
export const DATE_FORMAT_DD_SLASH_MM_SLASH_YYYY = 'DD/MM/YYYY';
export const DATE_FORMAT_MM_DD_YYYY = 'MM-DD-YYYY';
export const DATE_FORMAT_MM_SLASH_DD_SLASH_YYYY = 'MM/DD/YYYY';
export const DATE_FORMAT_YYYY_MM_DD = 'YYYY-MM-DD';

export const TIME_FORMAT_12H_WITH_SECONDS = '12h_with_seconds';
export const TIME_FORMAT_12H = '12h';
export const TIME_FORMAT_24H_WITH_SECONDS = '24h_with_seconds';
export const TIME_FORMAT_24H = '24h';

export const DEFAULT_DATETIME_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_DATE_FORMAT = DATE_FORMAT_DD_MM_YYYY;
export const DEFAULT_TIME_FORMAT = TIME_FORMAT_12H_WITH_SECONDS;

export const DATE_FORMAT_OPTIONS = [
  { value: DATE_FORMAT_DD_MM_YYYY, label: 'DD-MM-YYYY' },
  { value: DATE_FORMAT_DD_SLASH_MM_SLASH_YYYY, label: 'DD/MM/YYYY' },
  { value: DATE_FORMAT_MM_DD_YYYY, label: 'MM-DD-YYYY' },
  { value: DATE_FORMAT_MM_SLASH_DD_SLASH_YYYY, label: 'MM/DD/YYYY' },
  { value: DATE_FORMAT_YYYY_MM_DD, label: 'YYYY-MM-DD' },
];

export const TIME_FORMAT_OPTIONS = [
  { value: TIME_FORMAT_12H_WITH_SECONDS, label: '12-hour (hh:mm:ss AM/PM)' },
  { value: TIME_FORMAT_12H, label: '12-hour (hh:mm AM/PM)' },
  { value: TIME_FORMAT_24H_WITH_SECONDS, label: '24-hour (HH:mm:ss)' },
  { value: TIME_FORMAT_24H, label: '24-hour (HH:mm)' },
];

export const COMMON_TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
];

export function normalizeDateTimeDisplayMode(v) {
  if (v === DATETIME_DISPLAY_BROWSER) return DATETIME_DISPLAY_BROWSER;
  return DATETIME_DISPLAY_IST;
}

export function normalizeDateFormat(v) {
  const allowed = new Set([
    DATE_FORMAT_DD_MM_YYYY,
    DATE_FORMAT_DD_SLASH_MM_SLASH_YYYY,
    DATE_FORMAT_MM_DD_YYYY,
    DATE_FORMAT_MM_SLASH_DD_SLASH_YYYY,
    DATE_FORMAT_YYYY_MM_DD,
  ]);
  return allowed.has(v) ? v : DEFAULT_DATE_FORMAT;
}

export function normalizeTimeFormat(v) {
  const allowed = new Set([
    TIME_FORMAT_12H_WITH_SECONDS,
    TIME_FORMAT_12H,
    TIME_FORMAT_24H_WITH_SECONDS,
    TIME_FORMAT_24H,
  ]);
  return allowed.has(v) ? v : DEFAULT_TIME_FORMAT;
}

export function normalizeTimeZone(v) {
  if (typeof v !== 'string') return DEFAULT_DATETIME_TIMEZONE;
  const tz = v.trim();
  if (!tz) return DEFAULT_DATETIME_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA timezone names.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_DATETIME_TIMEZONE;
  }
}

export function normalizeDateTimePreferences(raw = {}) {
  return {
    timezone: normalizeTimeZone(raw.timezone ?? raw.datetimeTimezone ?? raw.datetime_timezone),
    dateFormat: normalizeDateFormat(raw.dateFormat ?? raw.datetimeDateFormat ?? raw.datetime_date_format),
    timeFormat: normalizeTimeFormat(raw.timeFormat ?? raw.datetimeTimeFormat ?? raw.datetime_time_format),
  };
}

function parseDateValue(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Parse YYYY-MM-DD as a local calendar date to avoid UTC day-shift.
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
  }
  return new Date(value);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function extractDateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(value);
  const day = parts.find((p) => p.type === 'day')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const year = parts.find((p) => p.type === 'year')?.value;
  return { day, month, year };
}

function formatDateByPattern(parts, dateFormat) {
  const { day, month, year } = parts;
  if (!day || !month || !year) return '—';
  const format = normalizeDateFormat(dateFormat);
  switch (format) {
    case DATE_FORMAT_DD_MM_YYYY:
      return `${day}-${month}-${year}`;
    case DATE_FORMAT_DD_SLASH_MM_SLASH_YYYY:
      return `${day}/${month}/${year}`;
    case DATE_FORMAT_MM_DD_YYYY:
      return `${month}-${day}-${year}`;
    case DATE_FORMAT_MM_SLASH_DD_SLASH_YYYY:
      return `${month}/${day}/${year}`;
    case DATE_FORMAT_YYYY_MM_DD:
      return `${year}-${month}-${day}`;
    default:
      return `${day}-${month}-${year}`;
  }
}

function formatTimeByPattern(value, timeZone, timeFormat) {
  const fmt = normalizeTimeFormat(timeFormat);
  const use12h = fmt === TIME_FORMAT_12H || fmt === TIME_FORMAT_12H_WITH_SECONDS;
  const includeSeconds = fmt === TIME_FORMAT_12H_WITH_SECONDS || fmt === TIME_FORMAT_24H_WITH_SECONDS;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: use12h
  }).formatToParts(value);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  const second = includeSeconds ? parts.find((p) => p.type === 'second')?.value : null;
  const dayPeriod = use12h ? parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() : null;
  if (!hour || !minute) return '—';
  const base = includeSeconds ? `${pad2(hour)}:${pad2(minute)}:${pad2(second || '00')}` : `${pad2(hour)}:${pad2(minute)}`;
  return use12h ? `${base} ${dayPeriod || ''}`.trim() : base;
}

function resolveTimeZone(mode, preferences) {
  const m = normalizeDateTimeDisplayMode(mode);
  if (m === DATETIME_DISPLAY_BROWSER) return undefined;
  return preferences.timezone;
}

export function formatDateTimeDisplay(value, mode, rawPreferences) {
  if (value == null || value === '') return '—';
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return '—';
  const prefs = normalizeDateTimePreferences(rawPreferences);
  const timeZone = resolveTimeZone(mode, prefs);
  const dateParts = extractDateParts(d, timeZone);
  const datePart = formatDateByPattern(dateParts, prefs.dateFormat);
  const timePart = formatTimeByPattern(d, timeZone, prefs.timeFormat);
  if (datePart === '—' && timePart === '—') return '—';
  if (datePart === '—') return timePart;
  if (timePart === '—') return datePart;
  return `${datePart} ${timePart}`;
}

function formatWithMode(value, mode, formatter, fallback = '—') {
  if (value == null || value === '') return fallback;
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const out = formatter(d);
  return out || fallback;
}

export function formatDateDisplay(value, mode, rawPreferences) {
  const prefs = normalizeDateTimePreferences(rawPreferences);
  const timeZone = resolveTimeZone(mode, prefs);
  return formatWithMode(
    value,
    mode,
    (d) => formatDateByPattern(extractDateParts(d, timeZone), prefs.dateFormat),
    '—'
  );
}

export function formatTimeDisplay(value, mode, rawPreferences) {
  const prefs = normalizeDateTimePreferences(rawPreferences);
  const timeZone = resolveTimeZone(mode, prefs);
  return formatWithMode(value, mode, (d) => formatTimeByPattern(d, timeZone, prefs.timeFormat), '—');
}

export function formatMonthYearDisplay(value, mode, rawPreferences) {
  const prefs = normalizeDateTimePreferences(rawPreferences);
  const timeZone = resolveTimeZone(mode, prefs);
  return formatWithMode(value, mode, (d) =>
    new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone
    }).format(d), '');
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
