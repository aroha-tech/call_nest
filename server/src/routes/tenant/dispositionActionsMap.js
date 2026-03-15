import { Router } from 'express';
import * as dispositionActionsMapController from '../../controllers/tenant/dispositionActionsMapController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', dispositionActionsMapController.getAll);
router.post('/', dispositionActionsMapController.create);
router.put('/:id/templates', dispositionActionsMapController.updateTemplates);
router.delete('/:id', dispositionActionsMapController.remove);
router.post('/:id/move', dispositionActionsMapController.move);

export default router;
