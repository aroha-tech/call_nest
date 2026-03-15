import { Router } from 'express';
import * as contactTemperatureMasterController from '../../controllers/superAdmin/contactTemperatureMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Read-only options for any authenticated user
router.get('/options', authMiddleware, contactTemperatureMasterController.getOptions);

// Remaining routes restricted to platform admins
router.use(platformAuthMiddleware);

router.get('/', contactTemperatureMasterController.getAll);
router.get('/:id', contactTemperatureMasterController.getById);
router.post('/', contactTemperatureMasterController.create);
router.put('/:id', contactTemperatureMasterController.update);
router.post('/:id/toggle-active', contactTemperatureMasterController.toggleActive);
router.delete('/:id', contactTemperatureMasterController.remove);
router.post('/:id/move', contactTemperatureMasterController.move);

export default router;
