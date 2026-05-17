import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './app/store';
import { setAccessTokenGetter, setRefreshTokenGetter } from './services/axiosInstance';
import { initAuthSync, proactiveTokenRefresh } from './services/authSync';
import App from './App';
import { TenantProvider } from './context/TenantContext';
import { ToastProvider } from './context/ToastContext';
import { ColorSchemeProvider } from './context/ColorSchemeContext';
import './styles/global.scss';

// Axios / Socket token getters: always read live state (never a stale subscribe closure).
store.subscribe(() => {
  setAccessTokenGetter(() => store.getState().auth?.accessToken ?? null);
  setRefreshTokenGetter(() => store.getState().auth?.refreshToken ?? null);
});
setAccessTokenGetter(() => store.getState().auth?.accessToken ?? null);
setRefreshTokenGetter(() => store.getState().auth?.refreshToken ?? null);

void proactiveTokenRefresh(store).finally(() => {
  initAuthSync(store);
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
