import { query } from '../../config/db.js';
import { publishTenantRealtimeEvent } from '../../realtime/publishTenantRealtime.js';
import { resolveRolesForEvent } from './notificationPolicyService.js';
import { sendPushToUserSubscriptions } from './notificationPushService.js';

/** In-app list, unread badge, mark-read, and dismiss only apply to notifications in this window (older rows stay in DB). */
const NOTIFICATION_LIST_RETENTION_DAYS = 90;

const LIST_VISIBILITY_SQL = `AND r.dismissed_at IS NULL AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;

function normalizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

async function listUsersByRoles(tenantId, roles) {
  if (!Array.isArray(roles) || roles.length === 0) return [];
  const cleanRoles = [...new Set(roles.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean))];
  if (cleanRoles.length === 0) return [];
  const rows = await query(
    `SELECT id
     FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND role IN (${cleanRoles.map(() => '?').join(',')})`,
    [tenantId, ...cleanRoles]
  );
  return rows.map((r) => Number(r.id)).filter(Number.isFinite);
}

export async function listUserIdsByRoles(tenantId, roles) {
  return listUsersByRoles(tenantId, roles);
}

async function resolveRecipientUserIds(tenantId, payload) {
  const explicitIds = Array.isArray(payload.recipientUserIds)
    ? payload.recipientUserIds.map(normalizePositiveInt).filter(Boolean)
    : [];
  if (explicitIds.length > 0) return [...new Set(explicitIds)];

  const roles = resolveRolesForEvent(payload.moduleKey, payload.eventType);
  const byRole = await listUsersByRoles(tenantId, roles);
  const assigneeId = normalizePositiveInt(payload.assignedUserId);
  const managerId = normalizePositiveInt(payload.managerId);
  return [...new Set([...byRole, ...(assigneeId ? [assigneeId] : []), ...(managerId ? [managerId] : [])])];
}

async function isPushEnabledForUser(tenantId, userId, moduleKey, eventType) {
  const rows = await query(
    `SELECT push_enabled
     FROM tenant_notification_preferences
     WHERE tenant_id = ? AND user_id = ? AND module_key = ? AND event_type IN (?, '*') AND deleted_at IS NULL
     ORDER BY CASE WHEN event_type = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [tenantId, userId, moduleKey, eventType, eventType]
  );
  if (!rows.length) return false;
  return Boolean(rows[0].push_enabled);
}

async function computeUnreadCount(tenantId, userId) {
  const [row] = await query(
    `SELECT COUNT(*) AS unreadCount
     FROM tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.deleted_at IS NULL
       AND n.deleted_at IS NULL AND r.read_at IS NULL
       ${LIST_VISIBILITY_SQL}`,
    [tenantId, userId, NOTIFICATION_LIST_RETENTION_DAYS]
  );
  return Number(row?.unreadCount || 0);
}

async function emitUnreadCount(tenantId, userId) {
  const unreadCount = await computeUnreadCount(tenantId, userId);
  await publishTenantRealtimeEvent(tenantId, 'notification_unread_count', { userId, unreadCount });
}

export async function listNotifications(tenantId, userId, filters = {}) {
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
  const page = Math.max(1, Number(filters.page || 1));
  const offset = (page - 1) * limit;
  const params = [tenantId, userId, NOTIFICATION_LIST_RETENTION_DAYS];
  let where = '';

  if (filters.module_key) {
    where += ' AND n.module_key = ?';
    params.push(String(filters.module_key).trim().toLowerCase());
  }
  if (filters.status === 'unread') where += ' AND r.read_at IS NULL';
  if (filters.status === 'read') where += ' AND r.read_at IS NOT NULL';
  if (filters.severity) {
    where += ' AND n.severity = ?';
    params.push(String(filters.severity).trim().toLowerCase());
  }

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.deleted_at IS NULL AND n.deleted_at IS NULL
       ${LIST_VISIBILITY_SQL} ${where}`,
    params
  );

  const rows = await query(
    `SELECT
       n.id,
       n.tenant_id,
       n.module_key,
       n.event_type,
       n.severity,
       n.title,
       n.body,
       n.actor_user_id,
       n.entity_type,
       n.entity_id,
       n.cta_path,
       n.metadata_json,
       n.created_at,
       r.read_at
     FROM tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.deleted_at IS NULL AND n.deleted_at IS NULL
       ${LIST_VISIBILITY_SQL} ${where}
     ORDER BY n.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { data: rows, total: Number(countRow?.total || 0), page, limit };
}

export async function getUnreadCount(tenantId, userId) {
  return { unreadCount: await computeUnreadCount(tenantId, userId) };
}

export async function markNotificationRead(tenantId, userId, notificationId) {
  const id = normalizePositiveInt(notificationId);
  if (!id) {
    const err = new Error('Invalid notification id');
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     SET r.read_at = COALESCE(r.read_at, NOW()), r.updated_at = NOW()
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.notification_id = ? AND r.deleted_at IS NULL
       AND r.dismissed_at IS NULL AND n.deleted_at IS NULL
       AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [tenantId, userId, id, NOTIFICATION_LIST_RETENTION_DAYS]
  );
  await emitUnreadCount(tenantId, userId);
  return { ok: true };
}

export async function markAllNotificationsRead(tenantId, userId) {
  await query(
    `UPDATE tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     SET r.read_at = COALESCE(r.read_at, NOW()), r.updated_at = NOW()
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.deleted_at IS NULL AND r.read_at IS NULL
       AND r.dismissed_at IS NULL AND n.deleted_at IS NULL
       AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [tenantId, userId, NOTIFICATION_LIST_RETENTION_DAYS]
  );
  await emitUnreadCount(tenantId, userId);
  return { ok: true };
}

export async function dismissNotification(tenantId, userId, notificationId) {
  const id = normalizePositiveInt(notificationId);
  if (!id) {
    const err = new Error('Invalid notification id');
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     SET r.dismissed_at = COALESCE(r.dismissed_at, NOW()), r.updated_at = NOW()
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.notification_id = ? AND r.deleted_at IS NULL
       AND r.dismissed_at IS NULL AND n.deleted_at IS NULL
       AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [tenantId, userId, id, NOTIFICATION_LIST_RETENTION_DAYS]
  );
  await emitUnreadCount(tenantId, userId);
  return { ok: true };
}

export async function dismissAllNotifications(tenantId, userId, filters = {}) {
  const params = [tenantId, userId, NOTIFICATION_LIST_RETENTION_DAYS];
  let where = '';

  if (filters.module_key) {
    where += ' AND n.module_key = ?';
    params.push(String(filters.module_key).trim().toLowerCase());
  }
  if (filters.status === 'unread') where += ' AND r.read_at IS NULL';
  if (filters.status === 'read') where += ' AND r.read_at IS NOT NULL';
  if (filters.severity) {
    where += ' AND n.severity = ?';
    params.push(String(filters.severity).trim().toLowerCase());
  }

  await query(
    `UPDATE tenant_notification_recipients r
     INNER JOIN tenant_notifications n ON n.id = r.notification_id
     SET r.dismissed_at = COALESCE(r.dismissed_at, NOW()), r.updated_at = NOW()
     WHERE r.tenant_id = ? AND r.user_id = ? AND r.deleted_at IS NULL
       AND n.deleted_at IS NULL
       ${LIST_VISIBILITY_SQL} ${where}`,
    params
  );
  await emitUnreadCount(tenantId, userId);
  return { ok: true };
}

export async function listPreferences(tenantId, userId) {
  const rows = await query(
    `SELECT id, module_key, event_type, in_app_enabled, push_enabled, updated_at
     FROM tenant_notification_preferences
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
     ORDER BY module_key ASC, event_type ASC`,
    [tenantId, userId]
  );
  return rows;
}

export async function upsertPreference(tenantId, userId, payload) {
  const moduleKey = String(payload.module_key || '').trim().toLowerCase();
  const eventType = String(payload.event_type || '*').trim().toLowerCase();
  if (!moduleKey) {
    const err = new Error('module_key is required');
    err.status = 400;
    throw err;
  }
  await query(
    `INSERT INTO tenant_notification_preferences
      (tenant_id, user_id, module_key, event_type, in_app_enabled, push_enabled, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      in_app_enabled = VALUES(in_app_enabled),
      push_enabled = VALUES(push_enabled),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP,
      deleted_at = NULL,
      deleted_by = NULL`,
    [
      tenantId,
      userId,
      moduleKey,
      eventType,
      payload.in_app_enabled === false ? 0 : 1,
      payload.push_enabled === true ? 1 : 0,
      userId,
      userId,
    ]
  );
  return { ok: true };
}

export async function registerPushSubscription(tenantId, userId, payload) {
  const endpoint = String(payload.endpoint || '').trim();
  const p256dh = String(payload.p256dh_key || '').trim();
  const auth = String(payload.auth_key || '').trim();
  if (!endpoint || !p256dh || !auth) {
    const err = new Error('endpoint, p256dh_key and auth_key are required');
    err.status = 400;
    throw err;
  }
  await query(
    `INSERT INTO tenant_push_subscriptions
      (tenant_id, user_id, endpoint, p256dh_key, auth_key, user_agent, is_active, last_seen_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE
      p256dh_key = VALUES(p256dh_key),
      auth_key = VALUES(auth_key),
      user_agent = VALUES(user_agent),
      is_active = 1,
      last_seen_at = NOW(),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP,
      deleted_at = NULL,
      deleted_by = NULL`,
    [tenantId, userId, endpoint, p256dh, auth, String(payload.user_agent || '').slice(0, 500), userId, userId]
  );
  return { ok: true };
}

export async function unregisterPushSubscription(tenantId, userId, endpoint) {
  await query(
    `UPDATE tenant_push_subscriptions
     SET is_active = 0, deleted_at = NOW(), deleted_by = ?, updated_by = ?, updated_at = NOW()
     WHERE tenant_id = ? AND user_id = ? AND endpoint = ? AND deleted_at IS NULL`,
    [userId, userId, tenantId, userId, String(endpoint || '')]
  );
  return { ok: true };
}

export async function createAndDispatchNotification(tenantId, actorUserId, payload) {
  try {
    const moduleKey = String(payload.moduleKey || '').trim().toLowerCase();
    const eventType = String(payload.eventType || '').trim().toLowerCase();
    if (!moduleKey || !eventType) return null;
    const recipients = await resolveRecipientUserIds(tenantId, payload);
    if (!recipients.length) return null;

    const eventHash = payload.eventHash ? String(payload.eventHash).slice(0, 191) : null;
    if (eventHash) {
      const [existing] = await query(
        `SELECT id FROM tenant_notifications
         WHERE tenant_id = ? AND event_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, eventHash]
      );
      if (existing?.id) return { id: Number(existing.id), deduped: true };
    }

    const res = await query(
      `INSERT INTO tenant_notifications
        (tenant_id, module_key, event_type, severity, title, body, actor_user_id, entity_type, entity_id, cta_path, metadata_json, event_hash, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
      [
        tenantId,
        moduleKey,
        eventType,
        String(payload.severity || 'normal').toLowerCase(),
        String(payload.title || '').slice(0, 255),
        payload.body ? String(payload.body).slice(0, 65000) : null,
        actorUserId || null,
        payload.entityType ? String(payload.entityType).slice(0, 64) : null,
        normalizePositiveInt(payload.entityId),
        payload.ctaPath ? String(payload.ctaPath).slice(0, 500) : null,
        JSON.stringify(payload.metadata || {}),
        eventHash,
        actorUserId || null,
        actorUserId || null,
      ]
    );
    const notificationId = Number(res.insertId);
    if (!Number.isFinite(notificationId) || notificationId < 1) return null;

    const pushEnabledByRecipient = new Map();
    for (const recipientId of recipients) {
      const pushEnabled = await isPushEnabledForUser(tenantId, recipientId, moduleKey, eventType);
      pushEnabledByRecipient.set(recipientId, Boolean(pushEnabled));
      await query(
        `INSERT INTO tenant_notification_recipients
          (tenant_id, notification_id, user_id, channel_in_app, channel_push, delivered_at, created_by, updated_by)
         VALUES (?, ?, ?, 1, ?, NOW(), ?, ?)`,
        [tenantId, notificationId, recipientId, pushEnabled ? 1 : 0, actorUserId || null, actorUserId || null]
      );
    }

    const [notification] = await query(
      `SELECT id, tenant_id, module_key, event_type, severity, title, body, actor_user_id, entity_type, entity_id, cta_path, metadata_json, created_at
       FROM tenant_notifications WHERE id = ? LIMIT 1`,
      [notificationId]
    );

    await publishTenantRealtimeEvent(tenantId, 'notification_created', {
      notification,
      recipientUserIds: recipients,
    });
    for (const recipientId of recipients) {
      try {
        await emitUnreadCount(tenantId, recipientId);
        if (pushEnabledByRecipient.get(recipientId)) {
          await sendPushToUserSubscriptions(tenantId, recipientId, {
            id: notification.id,
            title: notification.title,
            body: notification.body,
            cta_path: notification.cta_path || '/notifications',
          });
        }
      } catch (e) {
        console.error('[notifications] recipient delivery failed:', e?.message || e);
      }
    }
    return notification;
  } catch (e) {
    console.error('[notifications] createAndDispatch failed:', e?.message || e);
    return null;
  }
}

