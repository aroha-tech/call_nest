import { dateToDateTimeLocalString } from '../components/ui/dateTimePickerUtils';
import {
  civilDateTimeLocalStringToUtcMysql,
  normalizeMeetingTimezone,
  utcMysqlOrIsoToCivilDateTimeLocalString,
} from './meetingTimezone.js';

/**
 * `datetime-local` value (digits = civil time in `meetingTz`) → UTC `YYYY-MM-DD HH:mm:ss` for API / MySQL.
 */
export function localDateTimeInputToUtcMysql(localStr, meetingTz) {
  return civilDateTimeLocalStringToUtcMysql(localStr, meetingTz);
}

/**
 * API value → `datetime-local` string in `meetingTz` (civil wall time).
 */
export function utcMysqlOrIsoToLocalDateTimeInput(apiValue, meetingTz) {
  return utcMysqlOrIsoToCivilDateTimeLocalString(apiValue, meetingTz);
}

/**
 * `{ from, to }` as UTC mysql strings for the visible **browser-local** calendar month.
 */
export function utcMysqlRangeForLocalMonth(year, month0) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const z = normalizeMeetingTimezone(browserTz);
  const fromLocal = new Date(year, month0, 1, 0, 0, 0, 0);
  const toLocal = new Date(year, month0 + 1, 0, 23, 59, 59, 0);
  return {
    from: civilDateTimeLocalStringToUtcMysql(dateToDateTimeLocalString(fromLocal), z),
    to: civilDateTimeLocalStringToUtcMysql(dateToDateTimeLocalString(toLocal), z),
  };
}
