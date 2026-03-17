import { Router } from 'express';
import * as tenantUsersController from '../../controllers/tenant/tenantUsersController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', tenantUsersController.getAll);
router.get('/:id', tenantUsersController.getById);
router.post('/', tenantUsersController.create);
router.put('/:id', tenantUsersController.update);

export default router;
