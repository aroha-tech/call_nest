import { Router } from 'express';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import * as notificationsController from '../../controllers/tenant/notificationsController.js';

const router = Router();
router.use(tenantAuthMiddleware);

router.get('/', requirePermission('notifications.view'), notificationsController.listNotifications);
router.get('/unread-count', requirePermission('notifications.view'), notificationsController.unreadCount);
router.get('/vapid-public-key', requirePermission('notifications.view'), notificationsController.vapidPublicKey);
router.patch('/read-all', requirePermission('notifications.view'), notificationsController.markAllRead);
router.patch('/dismiss-all', requirePermission('notifications.view'), notificationsController.dismissAll);
router.patch('/:id/read', requirePermission('notifications.view'), notificationsController.markRead);
router.patch('/:id/dismiss', requirePermission('notifications.view'), notificationsController.dismiss);
router.get('/preferences/list', requirePermission('notifications.view'), notificationsController.listPreferences);
router.put('/preferences', requirePermission('notifications.view'), notificationsController.upsertPreference);
router.post(
  '/push-subscriptions',
  requirePermission('notifications.view'),
  notificationsController.registerPushSubscription
);
router.delete(
  '/push-subscriptions',
  requirePermission('notifications.view'),
  notificationsController.unregisterPushSubscription
);

export default router;

