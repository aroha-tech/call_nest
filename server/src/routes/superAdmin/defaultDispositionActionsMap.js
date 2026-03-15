import { Router } from 'express';
import * as defaultDispositionActionsMapController from '../../controllers/superAdmin/defaultDispositionActionsMapController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(platformAuthMiddleware);

router.get('/', defaultDispositionActionsMapController.getAll);
router.post('/', defaultDispositionActionsMapController.create);
router.delete('/:id', defaultDispositionActionsMapController.remove);
router.post('/:id/move', defaultDispositionActionsMapController.move);

export default router;
