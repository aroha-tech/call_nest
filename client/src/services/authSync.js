import axios from 'axios';
import { setTokens } from '../features/auth/authSlice';
import { AUTH_STORAGE_KEY } from '../features/auth/authConstants';
import { loadImpersonationStorage, saveImpersonationStorage } from '../features/auth/impersonationStorage';
import { refreshImpersonationToken } from '../features/auth/impersonationAPI';
import { decodeJwtPayload, userAndTenantFromToken } from '../features/auth/utils/jwtUtils';
const AUTH_CHANNEL_NAME = 'call_nest_auth_sync';

let authChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
}

const apiBase =
  (import.meta.env.VITE_API_BASE_URL ?? '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Read the latest tokens from localStorage (may be newer than in-memory Redux).
 */
export function getLatestTokensFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Apply tokens from localStorage into Redux when another tab updated them.
 */
export function syncTokensFromStorage(store) {
  const stored = getLatestTokensFromStorage();
  if (!stored?.accessToken) return false;

  const state = store.getState().auth;
  if (
    state.accessToken === stored.accessToken &&
    state.refreshToken === stored.refreshToken
  ) {
    return false;
  }

  const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(stored.accessToken);
  store.dispatch(
    setTokens({
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken ?? state.refreshToken,
      permissions,
      tokenVersion,
      user,
      tenant,
    })
  );
  return true;
}

export function broadcastAuthEvent(type, payload = {}) {
  authChannel?.postMessage({ type, ...payload });
}

/**
 * Run refresh across tabs with a single leader (Web Locks API when available).
 */
export async function withRefreshLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('call_nest_auth_refresh', { mode: 'exclusive' }, fn);
  }
  return fn();
}

function isAccessTokenNearExpiry(accessToken) {
  const pl = decodeJwtPayload(accessToken);
  if (!pl?.exp) return true;
  return Date.now() >= pl.exp * 1000 - 60000;
}

async function proactiveImpersonationRefresh(store) {
  const auth = store.getState().auth;
  if (!auth?.refreshToken) return;
  const stored = loadImpersonationStorage();
  const refreshToken = stored?.refreshToken || auth.refreshToken;
  const accessToken = stored?.accessToken || auth.accessToken;
  if (!isAccessTokenNearExpiry(accessToken)) return;

  await withRefreshLock(async () => {
    try {
      const res = await refreshImpersonationToken(refreshToken);
      const newToken = res.access_token;
      if (!newToken) return;
      const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(newToken);
      store.dispatch(
        setTokens({
          accessToken: newToken,
          refreshToken: res.refresh_token || refreshToken,
          permissions,
          tokenVersion,
          user: { ...user, isImpersonation: true },
          tenant,
        })
      );
      saveImpersonationStorage({
        accessToken: newToken,
        refreshToken: res.refresh_token || refreshToken,
        impersonatorId: auth.impersonatorId,
      });
    } catch {
      /* axios handles */
    }
  });
}

/**
 * Proactively refresh access token before expiry (shared across tabs via lock).
 */
export async function proactiveTokenRefresh(store) {
  const auth = store.getState().auth;
  if (!auth?.accessToken || !auth?.refreshToken) return;
  if (auth.isImpersonation) {
    await proactiveImpersonationRefresh(store);
    return;
  }

  const stored = getLatestTokensFromStorage();
  const refreshToken = stored?.refreshToken || auth.refreshToken;
  const accessToken = stored?.accessToken || auth.accessToken;

  if (!isAccessTokenNearExpiry(accessToken)) return;

  await withRefreshLock(async () => {
    const latest = getLatestTokensFromStorage();
    const rt = latest?.refreshToken || store.getState().auth?.refreshToken;
    const at = latest?.accessToken || store.getState().auth?.accessToken;
    if (!rt || !isAccessTokenNearExpiry(at)) return;

    try {
      const res = await axios.post(
        `${apiBase}/api/auth/refresh`,
        { refreshToken: rt },
        { withCredentials: true }
      );
      const newToken = res.data?.access_token;
      if (!newToken) return;
      const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(newToken);
      store.dispatch(
        setTokens({
          accessToken: newToken,
          refreshToken: res.data?.refresh_token || rt,
          permissions,
          tokenVersion,
          user,
          tenant,
        })
      );
      broadcastAuthEvent('tokens-updated');
    } catch {
      /* Leave to axios 401 handler on next API call */
    }
  });
}

let visibilityHandler = null;
let refreshIntervalId = null;

/**
 * Cross-tab token sync + proactive refresh on visibility / interval.
 */
export function initAuthSync(store) {
  if (typeof window === 'undefined') return;

  window.addEventListener('storage', (e) => {
    if (e.key !== AUTH_STORAGE_KEY) return;
    if (e.newValue == null) {
      store.dispatch({ type: 'auth/logout' });
      return;
    }
    syncTokensFromStorage(store);
  });

  authChannel?.addEventListener('message', (ev) => {
    if (ev.data?.type === 'tokens-updated') {
      syncTokensFromStorage(store);
    }
    if (ev.data?.type === 'session-superseded') {
      window.dispatchEvent(new CustomEvent('auth:session-superseded', { detail: ev.data }));
    }
  });

  let prevRefresh = store.getState().auth?.refreshToken;
  let prevAccess = store.getState().auth?.accessToken;
  store.subscribe(() => {
    const { refreshToken, accessToken } = store.getState().auth;
    if (refreshToken !== prevRefresh || accessToken !== prevAccess) {
      prevRefresh = refreshToken;
      prevAccess = accessToken;
      if (accessToken) broadcastAuthEvent('tokens-updated');
    }
  });

  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      syncTokensFromStorage(store);
      void proactiveTokenRefresh(store);
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  refreshIntervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void proactiveTokenRefresh(store);
    }
  }, 10 * 60 * 1000);
}

export function teardownAuthSync() {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (refreshIntervalId != null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
  authChannel?.close();
}
