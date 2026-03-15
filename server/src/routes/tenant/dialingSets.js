import { Router } from 'express';
import * as dialingSetsController from '../../controllers/tenant/dialingSetsController.js';
import * as dispositionCloneController from '../../controllers/tenant/dispositionCloneController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', dialingSetsController.getAll);
router.post('/clone', dispositionCloneController.cloneDialingSet);
router.get('/:id', dialingSetsController.getById);
router.post('/', dialingSetsController.create);
router.put('/:id', dialingSetsController.update);
router.delete('/:id', dialingSetsController.remove);
router.post('/:id/set-default', dialingSetsController.setDefault);

export default router;
