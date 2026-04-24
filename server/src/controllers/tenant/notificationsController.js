import * as notificationService from '../../services/tenant/notificationService.js';
import { getPublicVapidKey } from '../../services/tenant/notificationPushService.js';

function tenantIdFromReq(req) {
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return tenantId;
}

export async function listNotifications(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.listNotifications(tenantId, req.user.id, req.query || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function unreadCount(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.getUnreadCount(tenantId, req.user.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.markNotificationRead(tenantId, req.user.id, req.params.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.markAllNotificationsRead(tenantId, req.user.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function dismiss(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.dismissNotification(tenantId, req.user.id, req.params.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function dismissAll(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const filters = {
      module_key: body.module_key,
      status: body.status,
      severity: body.severity,
    };
    const result = await notificationService.dismissAllNotifications(tenantId, req.user.id, filters);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function listPreferences(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.listPreferences(tenantId, req.user.id);
    return res.json({ data: result });
  } catch (err) {
    return next(err);
  }
}

export async function upsertPreference(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.upsertPreference(tenantId, req.user.id, req.body || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function registerPushSubscription(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.registerPushSubscription(tenantId, req.user.id, req.body || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function unregisterPushSubscription(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await notificationService.unregisterPushSubscription(
      tenantId,
      req.user.id,
      req.body?.endpoint
    );
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function vapidPublicKey(req, res, next) {
  try {
    tenantIdFromReq(req);
    return res.json({ publicKey: getPublicVapidKey() });
  } catch (err) {
    return next(err);
  }
}

