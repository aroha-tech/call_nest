import { Router } from 'express';
import * as whatsappMessageTemplatesController from '../../controllers/tenant/whatsappMessageTemplatesController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const waView = requirePermission(['whatsapp.view', 'settings.manage', 'dial.execute']);
const waTemplatesManage = requirePermission(['whatsapp.templates.manage', 'settings.manage']);

router.get('/', waView, whatsappMessageTemplatesController.getAll);
router.get('/options', waView, whatsappMessageTemplatesController.getOptions);
router.get('/:id', waView, whatsappMessageTemplatesController.getById);
router.post('/', waTemplatesManage, whatsappMessageTemplatesController.create);
router.put('/:id', waTemplatesManage, whatsappMessageTemplatesController.update);
router.delete('/:id', waTemplatesManage, whatsappMessageTemplatesController.remove);

export default router;
