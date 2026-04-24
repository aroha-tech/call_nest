import { useEffect } from 'react';
import { registerPushSubscriptionIfSupported } from '../services/notificationPush';

function sessionKeyForUser(userId) {
  return `callnest.siteEntryPermissions.u${userId || '0'}`;
}

function promptGeolocationIfPromptable() {
  if (typeof window === 'undefined' || !navigator.geolocation) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => resolve();
    const tryGet = () => {
      navigator.geolocation.getCurrentPosition(finish, finish, {
        timeout: 20000,
        maximumAge: 600000,
      });
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((r) => {
          if (r.state === 'granted' || r.state === 'denied') finish();
          else tryGet();
        })
        .catch(tryGet);
    } else {
      tryGet();
    }
  });
}

/**
 * After login, once per browser session per user: request notification (and Web Push subscription)
 * if the browser still allows prompting, then location if it is still promptable.
 */
export function useSiteEntryPermissions(userId) {
  useEffect(() => {
    const uid = userId != null ? String(userId) : '';
    if (!uid) return;
    const key = sessionKeyForUser(uid);
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
        await registerPushSubscriptionIfSupported();
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 700));
        if (cancelled) return;
        await promptGeolocationIfPromptable();
      } catch {
        /* non-fatal */
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);
}
