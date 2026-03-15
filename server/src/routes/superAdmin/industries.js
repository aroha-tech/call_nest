import { Router } from 'express';
import * as industriesController from '../../controllers/superAdmin/industriesController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Public (read-only) options for any authenticated user (platform or tenant)
router.get('/options', authMiddleware, industriesController.getOptions);

// All other industry master routes are platform-admin only
router.use(platformAuthMiddleware);

router.get('/', industriesController.getAll);
router.get('/:id', industriesController.getById);
router.post('/', industriesController.create);
router.put('/:id', industriesController.update);
router.post('/:id/toggle-active', industriesController.toggleActive);
router.delete('/:id', industriesController.remove);

export default router;
