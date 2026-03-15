import { Router } from 'express';
import * as dispoActionsMasterController from '../../controllers/superAdmin/dispoActionsMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Read-only options for any authenticated user
router.get('/options', authMiddleware, dispoActionsMasterController.getOptions);

// Remaining routes restricted to platform admins
router.use(platformAuthMiddleware);

router.get('/', dispoActionsMasterController.getAll);
router.get('/:id', dispoActionsMasterController.getById);
router.post('/', dispoActionsMasterController.create);
router.put('/:id', dispoActionsMasterController.update);
router.post('/:id/toggle-active', dispoActionsMasterController.toggleActive);
router.delete('/:id', dispoActionsMasterController.remove);

export default router;
