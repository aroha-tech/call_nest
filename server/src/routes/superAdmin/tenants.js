import { Router } from 'express';
import * as tenantsController from '../../controllers/superAdmin/tenantsController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/', tenantsController.getAll);
router.get('/:id', tenantsController.getById);
router.post('/', tenantsController.create);
router.put('/:id', tenantsController.update);

export default router;
