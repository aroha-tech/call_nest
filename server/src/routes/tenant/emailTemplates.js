import { Router } from 'express';
import * as emailTemplatesController from '../../controllers/tenant/emailTemplatesController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', emailTemplatesController.getAll);
router.get('/options', emailTemplatesController.getOptions);
router.get('/:id', emailTemplatesController.getById);
router.post('/', emailTemplatesController.create);
router.put('/:id', emailTemplatesController.update);
router.delete('/:id', emailTemplatesController.remove);

export default router;
