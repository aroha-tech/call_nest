import { useCallback } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { formatDateTimeDisplay, normalizeDateTimeDisplayMode } from '../utils/dateTimeDisplay';

/**
 * Date/time formatting using the signed-in user's preference (Profile → Date & time).
 */
export function useDateTimeDisplay() {
  const user = useAppSelector(selectUser);
  const mode = normalizeDateTimeDisplayMode(user?.datetimeDisplayMode);

  const formatDateTime = useCallback((value) => formatDateTimeDisplay(value, mode), [mode]);

  return { formatDateTime, datetimeDisplayMode: mode };
}
