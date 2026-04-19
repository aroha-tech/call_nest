import { Router } from 'express';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import * as scheduleHubController from '../../controllers/tenant/scheduleHubController.js';

const router = Router();

const scheduleView = requirePermission(['schedule.view', 'settings.manage']);
const scheduleManage = requirePermission(['schedule.manage', 'settings.manage']);

router.use(tenantAuthMiddleware);

router.get('/meta', scheduleView, scheduleHubController.meta);
router.get('/summary', scheduleView, scheduleHubController.summary);
router.get('/meetings', scheduleView, scheduleHubController.meetings);
router.get('/callbacks', scheduleView, scheduleHubController.callbacks);
router.get('/callbacks/calendar', scheduleView, scheduleHubController.callbacksCalendar);
router.get('/callbacks/metrics', scheduleView, scheduleHubController.callbacksMetrics);
router.get('/callbacks/:id', scheduleView, scheduleHubController.getCallback);
router.post('/callbacks', scheduleManage, scheduleHubController.createCallbackRow);
router.put('/callbacks/:id', scheduleManage, scheduleHubController.updateCallbackRow);
router.delete('/callbacks/:id', scheduleManage, scheduleHubController.deleteCallbackRow);

export default router;

