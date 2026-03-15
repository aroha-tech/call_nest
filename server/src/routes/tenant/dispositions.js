import { Router } from 'express';
import * as dispositionsController from '../../controllers/tenant/dispositionsController.js';
import * as dispositionCloneController from '../../controllers/tenant/dispositionCloneController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', dispositionsController.getAll);
router.post('/clone', dispositionCloneController.cloneFromIndustry);
router.post('/clone-single', dispositionCloneController.cloneDisposition);
router.get('/:id', dispositionsController.getById);
router.post('/', dispositionsController.create);
router.put('/:id', dispositionsController.update);
router.delete('/:id', dispositionsController.remove);

export default router;
