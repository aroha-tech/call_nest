import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import { selectRefreshToken, selectIsImpersonation } from '../features/auth/authSelectors';
import { endImpersonationSession } from '../features/auth/impersonationAPI';
import { getPlatformAdminUrl } from '../config/tenantWorkspaceUrl';

/**
 * End super-admin support session and return to the platform admin console.
 */
export function useExitSupport() {
  const dispatch = useAppDispatch();
  const refreshToken = useAppSelector(selectRefreshToken);
  const isImpersonation = useAppSelector(selectIsImpersonation);

  return useCallback(async () => {
    if (!isImpersonation) return;
    try {
      if (refreshToken) await endImpersonationSession(refreshToken);
    } catch {
      /* best effort */
    } finally {
      dispatch(logout());
      window.location.href = getPlatformAdminUrl();
    }
  }, [dispatch, refreshToken, isImpersonation]);
}
