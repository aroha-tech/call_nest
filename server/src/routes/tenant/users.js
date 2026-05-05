import { Router } from 'express';
import * as tenantUsersController from '../../controllers/tenant/tenantUsersController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

/** List/read users: team admins, or anyone who can view performance reports (scoped in service). */
const usersReadAccess = requirePermission([
  'users.manage',
  'users.team',
  'reports.performance.view',
]);
const usersMutateAccess = requirePermission(['users.manage', 'users.team']);

router.get('/', usersReadAccess, tenantUsersController.getAll);
router.get('/:id', usersReadAccess, tenantUsersController.getById);
router.post('/', usersMutateAccess, tenantUsersController.create);
router.put('/:id', usersMutateAccess, tenantUsersController.update);

export default router;
