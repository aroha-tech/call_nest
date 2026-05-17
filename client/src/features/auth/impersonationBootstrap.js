import { userAndTenantFromToken } from './utils/jwtUtils';
import {
  isImpersonationStorageActive,
  loadImpersonationStorage,
} from './impersonationStorage';

/**
 * Hydrate Redux from call_nest_impersonation on tenant workspace load.
 */
export function hydrateImpersonationFromStorage(store) {
  if (!isImpersonationStorageActive()) return false;
  const stored = loadImpersonationStorage();
  if (!stored?.accessToken) return false;

  const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(stored.accessToken);
  if (!user) return false;

  store.dispatch({
    type: 'auth/impersonationSessionStart',
    payload: {
      user: { ...user, isImpersonation: true },
      tenant,
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      permissions,
      tokenVersion,
      impersonatorId: stored.impersonatorId,
    },
  });
  return true;
}
