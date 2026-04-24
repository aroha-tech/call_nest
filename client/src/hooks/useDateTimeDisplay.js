import { useCallback } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  formatMonthYearDisplay,
  formatTimeDisplay,
  normalizeDateTimeDisplayMode,
} from '../utils/dateTimeDisplay';

/**
 * Date/time formatting using the signed-in user's preference (Profile → Date & time).
 */
export function useDateTimeDisplay() {
  const user = useAppSelector(selectUser);
  const mode = normalizeDateTimeDisplayMode(user?.datetimeDisplayMode);

  const formatDateTime = useCallback((value) => formatDateTimeDisplay(value, mode), [mode]);
  const formatDate = useCallback((value) => formatDateDisplay(value, mode), [mode]);
  const formatTime = useCallback((value) => formatTimeDisplay(value, mode), [mode]);
  const formatMonthYear = useCallback((value) => formatMonthYearDisplay(value, mode), [mode]);

  return { formatDateTime, formatDate, formatTime, formatMonthYear, datetimeDisplayMode: mode };
}
