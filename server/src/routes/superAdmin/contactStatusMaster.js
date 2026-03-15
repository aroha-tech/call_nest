import { Router } from 'express';
import * as contactStatusMasterController from '../../controllers/superAdmin/contactStatusMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Read-only options for any authenticated user
router.get('/options', authMiddleware, contactStatusMasterController.getOptions);

// Remaining routes restricted to platform admins
router.use(platformAuthMiddleware);

router.get('/', contactStatusMasterController.getAll);
router.get('/:id', contactStatusMasterController.getById);
router.post('/', contactStatusMasterController.create);
router.put('/:id', contactStatusMasterController.update);
router.post('/:id/toggle-active', contactStatusMasterController.toggleActive);
router.delete('/:id', contactStatusMasterController.remove);

export default router;
