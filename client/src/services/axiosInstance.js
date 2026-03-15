import axios from 'axios';
import { userAndTenantFromToken } from '../features/auth/utils/jwtUtils';

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

export function setRefreshTokenGetter(getter) {
  getRefreshToken = getter;
}

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
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

/**
 * Handle logout with optional message
 */
function handleLogout(message = null) {
  if (typeof window !== 'undefined' && window.__authStore) {
    window.__authStore.dispatch({ type: 'auth/logout' });
    // Store message for display on login page
    if (message) {
      sessionStorage.setItem('auth_message', message);
    }
    // Redirect to login
    window.location.href = '/login';
  }
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (err) => {
    const originalRequest = err.config;

    // Handle token version mismatch - force re-login
    if (isTokenVersionMismatch(err)) {
      handleLogout('Session expired. Your permissions have changed. Please login again.');
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => axiosInstance(originalRequest))
          .catch((e) => Promise.reject(e));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      const body = refreshToken ? { refreshToken } : {};
      return axios
        .post(`${baseURL}/api/auth/refresh`, body, { withCredentials: true })
        .then((res) => {
          const newToken = res.data?.access_token;
          processQueue(null, newToken);
          if (newToken && typeof window !== 'undefined' && window.__authStore) {
            // Extract updated user info and permissions from new token
            const { user, permissions, tokenVersion } = userAndTenantFromToken(newToken);
            window.__authStore.dispatch({
              type: 'auth/setTokens',
              payload: {
                accessToken: newToken,
                refreshToken: res.data?.refresh_token || refreshToken,
                permissions,
                tokenVersion,
                user,
              },
            });
          }
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return axiosInstance(originalRequest);
        })
        .catch((refreshErr) => {
          processQueue(refreshErr, null);
          handleLogout();
          return Promise.reject(refreshErr);
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    return Promise.reject(err);
  }
);
