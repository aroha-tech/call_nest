import { Router } from 'express';
import * as meetingsController from '../../controllers/tenant/meetingsController.js';
import * as meetingEmailTemplatesController from '../../controllers/tenant/meetingEmailTemplatesController.js';
import * as meetingDefaultEmailSettingsController from '../../controllers/tenant/meetingDefaultEmailSettingsController.js';
import * as meetingUserAttendeeEmailTemplatesController from '../../controllers/tenant/meetingUserAttendeeEmailTemplatesController.js';
import * as meetingAttendeeEmailWorkspaceController from '../../controllers/tenant/meetingAttendeeEmailWorkspaceController.js';
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
router.get('/default-email-settings', meetingsView, meetingDefaultEmailSettingsController.getMine);
router.put('/default-email-settings', meetingsManage, meetingDefaultEmailSettingsController.updateMine);
router.post('/default-email-settings/reset-section', meetingsManage, meetingDefaultEmailSettingsController.resetAutomationSection);
router.post('/default-email-settings/test-email', meetingsManage, meetingDefaultEmailSettingsController.sendTestEmail);

router.get('/user-attendee-email-templates', meetingsView, meetingUserAttendeeEmailTemplatesController.listMine);
router.put('/user-attendee-email-templates', meetingsManage, meetingUserAttendeeEmailTemplatesController.updateMine);
router.post('/user-attendee-email-templates/reset', meetingsManage, meetingUserAttendeeEmailTemplatesController.resetMine);
router.post('/user-attendee-email-templates/preview', meetingsView, meetingUserAttendeeEmailTemplatesController.previewMine);
router.post('/user-attendee-email-templates/test-email', meetingsManage, meetingUserAttendeeEmailTemplatesController.sendTestEmail);

router.post('/attendee-email-workspace', meetingsView, meetingAttendeeEmailWorkspaceController.workspace);

router.get('/metrics', meetingsView, meetingsController.metrics);
router.get('/', meetingsView, meetingsController.list);
router.post('/:id/join-opened', meetingsView, meetingsController.recordJoinOpened);
router.get('/:id', meetingsView, meetingsController.getById);
router.post('/', meetingsManage, meetingsController.create);
router.put('/:id', meetingsManage, meetingsController.update);
router.delete('/:id', meetingsManage, meetingsController.remove);

export default router;
