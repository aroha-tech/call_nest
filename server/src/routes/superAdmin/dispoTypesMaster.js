import { Router } from 'express';
import * as dispoTypesMasterController from '../../controllers/superAdmin/dispoTypesMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Read-only options for any authenticated user
router.get('/options', authMiddleware, dispoTypesMasterController.getOptions);

// Remaining routes restricted to platform admins
router.use(platformAuthMiddleware);

router.get('/', dispoTypesMasterController.getAll);
router.get('/:id', dispoTypesMasterController.getById);
router.post('/', dispoTypesMasterController.create);
router.put('/:id', dispoTypesMasterController.update);
router.post('/:id/toggle-active', dispoTypesMasterController.toggleActive);
router.delete('/:id', dispoTypesMasterController.remove);

export default router;
