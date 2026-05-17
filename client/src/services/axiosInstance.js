import axios from 'axios';
import { userAndTenantFromToken } from '../features/auth/utils/jwtUtils';
import {
  getLatestTokensFromStorage,
  syncTokensFromStorage,
  withRefreshLock,
  broadcastAuthEvent,
} from './authSync';
import { markSessionSupersededPending } from '../features/auth/sessionEnded';
import { loadImpersonationStorage } from '../features/auth/impersonationStorage';

// Use VITE_API_BASE_URL from .env (dev: e.g. http://localhost:4000 or leave empty for proxy; production: e.g. https://acme.arohva.com)
const baseURL =
  (import.meta.env.VITE_API_BASE_URL ?? '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export const axiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token getters (memory only); set by auth slice after login
let getAccessToken = () => null;
let getRefreshToken = () => null;

export function setAccessTokenGetter(getter) {
  getAccessToken = getter;
}

/** For Socket.IO / fetch that cannot use axios interceptors. */
export function getStoredAccessToken() {
  return getAccessToken();
}

export function setRefreshTokenGetter(getter) {
  getRefreshToken = getter;
}

function isImpersonationActive() {
  return Boolean(window.__authStore?.getState()?.auth?.isImpersonation);
}

function resolveAccessToken() {
  if (isImpersonationActive()) {
    const imp = loadImpersonationStorage();
    return imp?.accessToken || getAccessToken();
  }
  const stored = getLatestTokensFromStorage();
  return stored?.accessToken || getAccessToken();
}

function resolveRefreshTokenForRequest() {
  if (isImpersonationActive()) {
    const imp = loadImpersonationStorage();
    return imp?.refreshToken || getRefreshToken();
  }
  const stored = getLatestTokensFromStorage();
  return stored?.refreshToken || getRefreshToken();
}

axiosInstance.interceptors.request.use(
  (config) => {
    const token = resolveAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

let isRefreshing = false;
let failedQueue = [];

function processQueue(err, token = null) {
  failedQueue.forEach((prom) => (err ? prom.reject(err) : prom.resolve(token)));
  failedQueue = [];
}

/**
 * Check if error is a token version mismatch (permissions changed, force re-login)
 */
function isTokenVersionMismatch(err) {
  return (
    err.response?.status === 401 &&
    err.response?.data?.code === 'TOKEN_VERSION_MISMATCH'
  );
}

function isNetworkError(err) {
  return (
    !err.response &&
    (err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' ||
      err.message === 'Network Error')
  );
}

/**
 * Handle logout with optional message
 */
export function handleAuthLogout(message = null) {
  if (typeof window !== 'undefined' && window.__authStore) {
    window.__authStore.dispatch({ type: 'auth/logout' });
    if (message) {
      sessionStorage.setItem('auth_message', message);
    }
    window.location.href = '/login';
  }
}

/** Do not run refresh-token flow for these requests (e.g. login 401 must surface as invalid credentials). */
function isAuthBootstrapRequest(config) {
  if (!config?.url) return false;
  const u = config.url;
  return (
    u.includes('/api/auth/login') ||
    u.includes('/api/auth/register') ||
    u.includes('/api/auth/refresh') ||
    u.includes('/api/auth/impersonation/exchange') ||
    u.includes('/api/auth/impersonation/refresh') ||
    u.includes('/api/auth/impersonation/end')
  );
}

/**
 * Profile PATCH can return 401 for "wrong current password" — that is not an expired JWT.
 * Skipping refresh here avoids failed refresh → forced logout.
 */
function isProfileMePatchRequest(config) {
  if (!config?.url) return false;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'patch') return false;
  const u = config.url;
  return u.includes('/api/auth/me') || u.includes('/auth/me');
}

async function performTokenRefresh() {
  const impersonating = isImpersonationActive();

  if (!impersonating && typeof window !== 'undefined' && window.__authStore) {
    syncTokensFromStorage(window.__authStore);
  }

  return withRefreshLock(async () => {
    const rt = resolveRefreshTokenForRequest();
    const refreshBody = rt ? { refreshToken: rt } : {};
    const refreshUrl = impersonating
      ? `${baseURL}/api/auth/impersonation/refresh`
      : `${baseURL}/api/auth/refresh`;

    const res = await axios.post(refreshUrl, refreshBody, {
      withCredentials: true,
    });
    return res;
  });
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (err) => {
    const originalRequest = err.config;

    if (isTokenVersionMismatch(err)) {
      if (!isImpersonationActive() && typeof window !== 'undefined') {
        markSessionSupersededPending();
        window.dispatchEvent(new CustomEvent('auth:session-superseded'));
      }
      return Promise.reject(err);
    }

    if (
      err.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthBootstrapRequest(originalRequest) &&
      !isProfileMePatchRequest(originalRequest)
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => axiosInstance(originalRequest))
          .catch((e) => Promise.reject(e));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return performTokenRefresh()
        .then((res) => {
          const newToken = res.data?.access_token;
          processQueue(null, newToken);
          if (newToken && typeof window !== 'undefined' && window.__authStore) {
            const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(newToken);
            const rt = resolveRefreshTokenForRequest();
            window.__authStore.dispatch({
              type: 'auth/setTokens',
              payload: {
                accessToken: newToken,
                refreshToken: res.data?.refresh_token || rt,
                permissions,
                tokenVersion,
                user,
                tenant,
              },
            });
            broadcastAuthEvent('tokens-updated');
          }
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return axiosInstance(originalRequest);
        })
        .catch((refreshErr) => {
          processQueue(refreshErr, null);
          if (isTokenVersionMismatch(refreshErr)) {
            if (!isImpersonationActive() && typeof window !== 'undefined') {
              markSessionSupersededPending();
              window.dispatchEvent(new CustomEvent('auth:session-superseded'));
            }
            return Promise.reject(refreshErr);
          }
          if (!isNetworkError(refreshErr) && !isImpersonationActive()) {
            if (typeof window !== 'undefined') {
              markSessionSupersededPending();
              window.dispatchEvent(new CustomEvent('auth:session-superseded'));
            }
          } else if (!isNetworkError(refreshErr) && isImpersonationActive()) {
            handleAuthLogout();
          }
          return Promise.reject(refreshErr);
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    return Promise.reject(err);
  }
);
