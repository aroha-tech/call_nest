import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import { store } from './app/store';
import { setAccessTokenGetter, setRefreshTokenGetter } from './services/axiosInstance';
import { setTokens } from './features/auth/authSlice';
import { decodeJwtPayload, userAndTenantFromToken } from './features/auth/utils/jwtUtils';
import App from './App';
import { TenantProvider } from './context/TenantContext';
import { ToastProvider } from './context/ToastContext';
import { ColorSchemeProvider } from './context/ColorSchemeContext';
import './styles/global.scss';

const apiBase =
  (import.meta.env.VITE_API_BASE_URL ?? '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * If the persisted access JWT is expired (or near expiry) but refresh exists, refresh *before* mount
 * so the first API calls (background-jobs list, etc.) do not briefly401 and clutter the console.
 */
async function refreshAccessTokenIfExpired() {
  const auth = store.getState().auth;
  if (!auth?.accessToken || !auth?.refreshToken) return;
  const pl = decodeJwtPayload(auth.accessToken);
  if (!pl?.exp) return;
  if (Date.now() < pl.exp * 1000 - 60000) return;

  try {
    const res = await axios.post(
      `${apiBase}/api/auth/refresh`,
      { refreshToken: auth.refreshToken },
      { withCredentials: true }
    );
    const newToken = res.data?.access_token;
    if (!newToken) return;
    const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(newToken);
    store.dispatch(
      setTokens({
        accessToken: newToken,
        refreshToken: res.data?.refresh_token || auth.refreshToken,
        permissions,
        tokenVersion,
        user,
        tenant,
      })
    );
  } catch {
    /* Invalid refresh — leave tokens; axios401 handler / login flow applies */
  }
}

// Axios / Socket token getters: always read live state (never a stale subscribe closure).
store.subscribe(() => {
  setAccessTokenGetter(() => store.getState().auth?.accessToken ?? null);
  setRefreshTokenGetter(() => store.getState().auth?.refreshToken ?? null);
});
setAccessTokenGetter(() => store.getState().auth?.accessToken ?? null);
setRefreshTokenGetter(() => store.getState().auth?.refreshToken ?? null);

void refreshAccessTokenIfExpired().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Provider store={store}>
        <ColorSchemeProvider>
          <TenantProvider>
            <BrowserRouter>
              <ToastProvider>
                <App />
              </ToastProvider>
            </BrowserRouter>
          </TenantProvider>
        </ColorSchemeProvider>
      </Provider>
    </React.StrictMode>
  );
});
