import { io } from 'socket.io-client';
import { getStoredAccessToken } from './axiosInstance';

const LOG = '[tenant-socket]';

/** Same base as REST: Vite proxy (empty env) or explicit API host. */
export function getTenantRealtimeSocketUrl() {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
  return '';
}

/**
 * Tenant realtime via Socket.IO (background jobs today; call_updated etc. later).
 * @param {{ getToken?: () => string | null, onConnect?: () => void, onDisconnect?: (reason: string) => void, onEvent: (event: string, data: unknown) => void, onError?: (e: Error) => void }} opts
 * @returns {() => void} disconnect
 */
export function connectTenantRealtimeSocket(opts) {
  const { getToken = getStoredAccessToken, onConnect, onDisconnect, onEvent, onError } = opts;
  let socket = null;
  let cancelled = false;

  const url = getTenantRealtimeSocketUrl();
  if (!url) {
    onError?.(new Error('No socket URL'));
    return () => {};
  }

  const token = getToken();
  if (!token) {
    console.warn(LOG, 'not connecting — no access token');
    onError?.(new Error('Not authenticated'));
    return () => {};
  }

  console.info(LOG, 'connecting', { url });

  socket = io(url, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    withCredentials: true,
  });

  socket.on('connect', () => {
    if (cancelled) return;
    console.info(LOG, 'connected', { id: socket.id });
    onConnect?.();
  });

  socket.on('disconnect', (reason) => {
    if (cancelled) return;
    console.info(LOG, 'disconnect', { reason });
    onDisconnect?.(reason);
  });

  socket.on('connect_error', (err) => {
    if (cancelled) return;
    const msg = err?.message || 'connect_error';
    console.warn(LOG, 'connect_error', msg);
    onError?.(err instanceof Error ? err : new Error(String(msg)));
  });

  socket.on('background_job', (data) => {
    if (cancelled) return;
    onEvent('background_job', data);
  });

  return () => {
    cancelled = true;
    if (socket) {
      console.info(LOG, 'closing socket');
      socket.removeAllListeners();
      socket.close();
      socket = null;
    }
  };
}
