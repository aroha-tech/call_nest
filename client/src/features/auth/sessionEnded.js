import { AUTH_STORAGE_KEY } from './authConstants';

/** Set while user must see the "signed in elsewhere" modal (survives page reload). */
export const SESSION_SUPERSEDED_PENDING_KEY = 'call_nest_session_superseded_pending';
const AUTH_MESSAGE_KEY = 'auth_message';

const DEFAULT_MESSAGE = 'Your session ended. Sign in again.';

export function isSessionSupersededPending() {
  try {
    return sessionStorage.getItem(SESSION_SUPERSEDED_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSessionSupersededPending() {
  try {
    sessionStorage.setItem(SESSION_SUPERSEDED_PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearSessionSupersededPending() {
  try {
    sessionStorage.removeItem(SESSION_SUPERSEDED_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * User chose to leave — clear auth and go to login. Only call from modal actions.
 */
export function endSupersededSession(message = DEFAULT_MESSAGE) {
  if (typeof window === 'undefined') return;

  clearSessionSupersededPending();

  try {
    if (message) sessionStorage.setItem(AUTH_MESSAGE_KEY, message);
  } catch {
    /* ignore */
  }

  if (window.__authStore) {
    window.__authStore.dispatch({ type: 'auth/logout' });
  }

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  const path = window.location.pathname || '';
  if (!path.startsWith('/login')) {
    window.location.replace('/login');
  }
}
