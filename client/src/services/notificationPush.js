import { notificationAPI } from './notificationAPI';

const SW_PATH = '/sw.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export async function registerPushSubscriptionIfSupported() {
  try {
    if (typeof window === 'undefined') return { ok: false, reason: 'window_unavailable' };
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'push_unsupported' };
    }
    const permission = await requestBrowserNotificationPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission_not_granted' };

    const registration = await navigator.serviceWorker.register(SW_PATH);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const vapidRes = await notificationAPI.vapidPublicKey();
      const publicKey = String(vapidRes?.data?.publicKey || '').trim();
      if (!publicKey) {
        return { ok: false, reason: 'vapid_public_key_missing' };
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const json = subscription.toJSON();
    await notificationAPI.registerPushSubscription({
      endpoint: subscription.endpoint,
      p256dh_key: json?.keys?.p256dh || '',
      auth_key: json?.keys?.auth || '',
      user_agent: navigator.userAgent || '',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'push_registration_failed' };
  }
}

export async function unregisterPushSubscriptionIfPresent() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return { ok: false };
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return { ok: true };
  await notificationAPI.unregisterPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
  return { ok: true };
}

export async function inspectPushStatus() {
  if (typeof window === 'undefined') return { state: 'unavailable', label: 'Unavailable' };
  if (!('Notification' in window)) return { state: 'unsupported', label: 'Not supported by browser' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { state: 'unsupported', label: 'Push API not supported' };
  }
  if (Notification.permission === 'denied') {
    return { state: 'blocked', label: 'Blocked in browser settings' };
  }
  if (Notification.permission === 'default') {
    return { state: 'not_enabled', label: 'Permission not granted yet' };
  }
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) {
    return { state: 'permission_only', label: 'Permission granted, subscription missing' };
  }
  return { state: 'enabled', label: 'Enabled and subscribed' };
}

export function showForegroundBrowserNotification(payload) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const title = payload?.title || 'New notification';
  const body = payload?.body || '';
  const notif = new Notification(title, { body, tag: `notif-${payload?.id || Date.now()}` });
  notif.onclick = () => {
    if (payload?.cta_path) window.location.href = payload.cta_path;
    window.focus();
  };
}

