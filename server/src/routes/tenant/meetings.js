import { Router } from 'express';
import * as meetingsController from '../../controllers/tenant/meetingsController.js';
import * as meetingEmailTemplatesController from '../../controllers/tenant/meetingEmailTemplatesController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { requireEmailModuleEnabled } from '../../middleware/requireEmailModule.js';

const router = Router();

const meetingsView = requirePermission(['meetings.view', 'settings.manage']);
const meetingsManage = requirePermission(['meetings.manage', 'settings.manage']);

router.use(tenantAuthMiddleware);
router.use(requireEmailModuleEnabled);

router.get('/email-templates', meetingsView, meetingEmailTemplatesController.list);
router.post('/email-templates/preview', meetingsView, meetingEmailTemplatesController.preview);
router.put('/email-templates', meetingsManage, meetingEmailTemplatesController.update);
router.post('/email-templates/reset', meetingsManage, meetingEmailTemplatesController.reset);

router.get('/metrics', meetingsView, meetingsController.metrics);
router.get('/', meetingsView, meetingsController.list);
router.get('/:id', meetingsView, meetingsController.getById);
router.post('/', meetingsManage, meetingsController.create);
router.put('/:id', meetingsManage, meetingsController.update);
router.delete('/:id', meetingsManage, meetingsController.remove);

export default router;
