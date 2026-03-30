import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './app/store';
import { setAccessTokenGetter, setRefreshTokenGetter } from './services/axiosInstance';
import App from './App';
import { TenantProvider } from './context/TenantContext';
import { ToastProvider } from './context/ToastContext';
import './styles/global.scss';

// Axios reads tokens from Redux (memory only)
store.subscribe(() => {
  const state = store.getState();
  setAccessTokenGetter(() => state.auth?.accessToken ?? null);
  setRefreshTokenGetter(() => state.auth?.refreshToken ?? null);
});
// Initial set
setAccessTokenGetter(() => store.getState().auth?.accessToken ?? null);
setRefreshTokenGetter(() => store.getState().auth?.refreshToken ?? null);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <TenantProvider>
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </TenantProvider>
    </Provider>
  </React.StrictMode>
);
