import webpush from 'web-push';
import { env } from '../../config/env.js';
import { query } from '../../config/db.js';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!env.webPushVapidPublicKey || !env.webPushVapidPrivateKey || !env.webPushVapidSubject) {
    return false;
  }
  webpush.setVapidDetails(
    env.webPushVapidSubject,
    env.webPushVapidPublicKey,
    env.webPushVapidPrivateKey
  );
  vapidConfigured = true;
  return true;
}

export function getPublicVapidKey() {
  return env.webPushVapidPublicKey || '';
}

export async function sendPushToUserSubscriptions(tenantId, userId, payload) {
  if (!ensureVapid()) return;
  const rows = await query(
    `SELECT id, endpoint, p256dh_key, auth_key
     FROM tenant_push_subscriptions
     WHERE tenant_id = ? AND user_id = ? AND is_active = 1 AND deleted_at IS NULL`,
    [tenantId, userId]
  );
  if (!rows.length) return;

  const body = JSON.stringify({
    title: payload?.title || 'Call Nest',
    body: payload?.body || '',
    cta_path: payload?.cta_path || '/notifications',
    tag: payload?.tag || `notif-${payload?.id || Date.now()}`,
  });

  for (const row of rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh_key,
        auth: row.auth_key,
      },
    };
    try {
      await webpush.sendNotification(subscription, body);
    } catch (e) {
      const code = Number(e?.statusCode || 0);
      if (code === 404 || code === 410) {
        await query(
          `UPDATE tenant_push_subscriptions
           SET is_active = 0, deleted_at = NOW(), updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [row.id, tenantId]
        );
      }
    }
  }
}

