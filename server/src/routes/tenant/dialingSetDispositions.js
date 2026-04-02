import { Router } from 'express';
import * as dialingSetDispositionsController from '../../controllers/tenant/dialingSetDispositionsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const viewOrManage = requirePermission(['dispositions.manage', 'workflow.view', 'dial.execute']);
const manageOnly = requirePermission(['dispositions.manage']);

router.get('/', viewOrManage, dialingSetDispositionsController.getAll);
router.post('/', manageOnly, dialingSetDispositionsController.create);
router.delete('/:id', manageOnly, dialingSetDispositionsController.remove);
router.post('/:id/move', manageOnly, dialingSetDispositionsController.move);

export default router;
