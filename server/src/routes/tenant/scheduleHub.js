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

router.get('/follow-ups', scheduleView, scheduleHubController.listFollowUps);
router.get('/follow-ups/calendar', scheduleView, scheduleHubController.followUpsCalendar);
router.get('/follow-ups/metrics', scheduleView, scheduleHubController.followUpsMetrics);
router.get('/follow-ups/:id', scheduleView, scheduleHubController.getFollowUp);
router.post('/follow-ups', scheduleManage, scheduleHubController.createFollowUpRow);
router.put('/follow-ups/:id', scheduleManage, scheduleHubController.updateFollowUpRow);
router.delete('/follow-ups/:id', scheduleManage, scheduleHubController.deleteFollowUpRow);

/** @deprecated Use /follow-ups — kept for older clients */
router.get('/callbacks', scheduleView, scheduleHubController.listFollowUps);
router.get('/callbacks/calendar', scheduleView, scheduleHubController.followUpsCalendar);
router.get('/callbacks/metrics', scheduleView, scheduleHubController.followUpsMetrics);
router.get('/callbacks/:id', scheduleView, scheduleHubController.getFollowUp);
router.post('/callbacks', scheduleManage, scheduleHubController.createFollowUpRow);
router.put('/callbacks/:id', scheduleManage, scheduleHubController.updateFollowUpRow);
router.delete('/callbacks/:id', scheduleManage, scheduleHubController.deleteFollowUpRow);

export default router;
