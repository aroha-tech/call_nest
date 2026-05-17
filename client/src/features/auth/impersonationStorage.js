import { IMPERSONATION_STORAGE_KEY } from './impersonationConstants';
import { decodeJwtPayload } from './utils/jwtUtils';

export function loadImpersonationStorage() {
  try {
    const raw = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    return null;
  }
}

export function saveImpersonationStorage({ accessToken, refreshToken, impersonatorId }) {
  try {
    localStorage.setItem(
      IMPERSONATION_STORAGE_KEY,
      JSON.stringify({ accessToken, refreshToken, impersonatorId: impersonatorId ?? null })
    );
  } catch {
    /* ignore */
  }
}

export function clearImpersonationStorage() {
  try {
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isImpersonationStorageActive() {
  const data = loadImpersonationStorage();
  if (!data?.accessToken) return false;
  const pl = decodeJwtPayload(data.accessToken);
  if (!pl?.exp) return false;
  if (pl.session_type !== 'impersonation') return false;
  return Date.now() < pl.exp * 1000 - 30000;
}
