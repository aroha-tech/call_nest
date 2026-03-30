import { useAppDispatch } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import { logoutAPI } from '../features/auth/authAPI';

/**
 * Signs out: revokes refresh token when present, then clears auth state.
 */
export function useLogout() {
  const dispatch = useAppDispatch();

  return async function handleLogout() {
    const state = window.__authStore?.getState();
    const refreshToken = state?.auth?.refreshToken;
    try {
      if (refreshToken) await logoutAPI(refreshToken);
    } finally {
      dispatch(logout());
    }
  };
}
