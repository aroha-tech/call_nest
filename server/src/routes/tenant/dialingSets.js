import { Router } from 'express';
import * as dialingSetsController from '../../controllers/tenant/dialingSetsController.js';
import * as dispositionCloneController from '../../controllers/tenant/dispositionCloneController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const viewOrManage = requirePermission(['dispositions.manage', 'workflow.view', 'dial.execute']);
const manageOnly = requirePermission(['dispositions.manage']);

router.get('/', viewOrManage, dialingSetsController.getAll);
router.post('/clone', manageOnly, dispositionCloneController.cloneDialingSet);
router.get('/:id', viewOrManage, dialingSetsController.getById);
router.post('/', manageOnly, dialingSetsController.create);
router.put('/:id', manageOnly, dialingSetsController.update);
router.delete('/:id', manageOnly, dialingSetsController.remove);
router.post('/:id/set-default', manageOnly, dialingSetsController.setDefault);

export default router;
