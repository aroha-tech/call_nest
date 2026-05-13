import { DateTime } from 'luxon';

export const DEFAULT_MEETING_TIMEZONE = 'Asia/Kolkata';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {unknown} raw */
export function normalizeMeetingTimezone(raw) {
  const s = String(raw || '').trim();
  const tz = s || DEFAULT_MEETING_TIMEZONE;
  if (!DateTime.now().setZone(tz).isValid) return DEFAULT_MEETING_TIMEZONE;
  return tz;
}

/**
 * `datetime-local` style string interpreted as civil time in `ianaZone` → UTC MySQL `YYYY-MM-DD HH:mm:ss`.
 */
export function civilDateTimeLocalStringToUtcMysql(localStr, ianaZone) {
  const z = normalizeMeetingTimezone(ianaZone);
  const n = String(localStr || '').trim().replace(' ', 'T');
  if (!n) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(n);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = m[6] != null ? Number(m[6]) : 0;
  const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi, second: sec }, { zone: z });
  if (!dt.isValid) return '';
  const u = dt.toUTC();
  return `${u.year}-${pad2(u.month)}-${pad2(u.day)} ${pad2(u.hour)}:${pad2(u.minute)}:${pad2(Math.floor(u.second))}`;
}

/**
 * Stored UTC instant → `datetime-local` civil string in `ianaZone`.
 */
export function utcMysqlOrIsoToCivilDateTimeLocalString(apiValue, ianaZone) {
  const z = normalizeMeetingTimezone(ianaZone);
  if (apiValue == null || apiValue === '') return '';
  if (apiValue instanceof Date && !Number.isNaN(apiValue.getTime())) {
    const dt = DateTime.fromJSDate(apiValue, { zone: 'utc' }).setZone(z);
    if (!dt.isValid) return '';
    return dt.toFormat("yyyy-MM-dd'T'HH:mm");
  }
  let s = String(apiValue).trim();
  if (!s) return '';
  let normalized = s.includes('T') ? s : s.replace(' ', 'T');
  if (!/Z$/i.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const dt = DateTime.fromISO(normalized, { zone: 'utc' });
  if (!dt.isValid) return '';
  return dt.setZone(z).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Instant ms for comparisons (future start, duration). */
export function civilDateTimeLocalStringToUtcMs(localStr, ianaZone) {
  const mysql = civilDateTimeLocalStringToUtcMysql(localStr, ianaZone);
  if (!mysql) return NaN;
  const t = new Date(`${mysql.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Civil wall `datetime-local` string in `ianaZone` + minutes → new civil string in same zone. */
export function addMinutesToCivilDateTimeLocalString(localStr, minutesToAdd, ianaZone) {
  const z = normalizeMeetingTimezone(ianaZone);
  const n = String(localStr || '').trim().replace(' ', 'T');
  if (!n) return '';
  const dt = DateTime.fromISO(n, { zone: z });
  if (!dt.isValid) return '';
  return dt.plus({ minutes: Number(minutesToAdd) || 0 }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Current instant → civil `datetime-local` string in `ianaZone`, shifted by `minutesFromNow`. */
export function civilDateTimeNowPlusMinutesInZone(minutesFromNow, ianaZone) {
  const z = normalizeMeetingTimezone(ianaZone);
  const dt = DateTime.now().setZone(z).plus({ minutes: Number(minutesFromNow) || 0 });
  if (!dt.isValid) return '';
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}
