import { Router } from 'express';
import * as whatsappMessageTemplatesController from '../../controllers/tenant/whatsappMessageTemplatesController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', whatsappMessageTemplatesController.getAll);
router.get('/options', whatsappMessageTemplatesController.getOptions);
router.get('/:id', whatsappMessageTemplatesController.getById);
router.post('/', whatsappMessageTemplatesController.create);
router.put('/:id', whatsappMessageTemplatesController.update);
router.delete('/:id', whatsappMessageTemplatesController.remove);

export default router;
