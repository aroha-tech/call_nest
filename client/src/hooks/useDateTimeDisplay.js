import { useCallback } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  formatMonthYearDisplay,
  formatTimeDisplay,
  normalizeDateTimePreferences,
  normalizeDateTimeDisplayMode,
} from '../utils/dateTimeDisplay';

/**
 * Date/time formatting using the signed-in user's preference (Profile → Date & time).
 */
export function useDateTimeDisplay() {
  const user = useAppSelector(selectUser);
  const mode = normalizeDateTimeDisplayMode(user?.datetimeDisplayMode);
  const preferences = normalizeDateTimePreferences({
    datetimeTimezone: user?.datetimeTimezone,
    datetimeDateFormat: user?.datetimeDateFormat,
    datetimeTimeFormat: user?.datetimeTimeFormat,
  });

  const formatDateTime = useCallback((value) => formatDateTimeDisplay(value, mode, preferences), [mode, preferences]);
  const formatDate = useCallback((value) => formatDateDisplay(value, mode, preferences), [mode, preferences]);
  const formatTime = useCallback((value) => formatTimeDisplay(value, mode, preferences), [mode, preferences]);
  const formatMonthYear = useCallback((value) => formatMonthYearDisplay(value, mode, preferences), [mode, preferences]);

  return { formatDateTime, formatDate, formatTime, formatMonthYear, datetimeDisplayMode: mode, datetimePreferences: preferences };
}
