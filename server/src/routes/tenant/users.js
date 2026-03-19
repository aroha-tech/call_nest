import { Router } from 'express';
import * as tenantUsersController from '../../controllers/tenant/tenantUsersController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const usersAccess = requirePermission(['users.manage', 'users.team']);

router.get('/', usersAccess, tenantUsersController.getAll);
router.get('/:id', usersAccess, tenantUsersController.getById);
router.post('/', usersAccess, tenantUsersController.create);
router.put('/:id', usersAccess, tenantUsersController.update);

export default router;
