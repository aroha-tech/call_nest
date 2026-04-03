import { Router } from 'express';
import * as emailTemplatesController from '../../controllers/tenant/emailTemplatesController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { requireEmailModuleEnabled } from '../../middleware/requireEmailModule.js';

const router = Router();

const emailView = requirePermission(['email.view', 'settings.manage', 'dial.execute']);
const emailTemplatesManage = requirePermission(['email.templates.manage', 'settings.manage']);

router.use(tenantAuthMiddleware);
router.use(requireEmailModuleEnabled);

router.get('/', emailView, emailTemplatesController.getAll);
router.get('/options', emailView, emailTemplatesController.getOptions);
router.get('/:id', emailView, emailTemplatesController.getById);
router.post('/', emailTemplatesManage, emailTemplatesController.create);
router.put('/:id', emailTemplatesManage, emailTemplatesController.update);
router.delete('/:id', emailTemplatesManage, emailTemplatesController.remove);

export default router;
