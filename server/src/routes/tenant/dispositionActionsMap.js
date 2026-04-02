import { Router } from 'express';
import * as dispositionActionsMapController from '../../controllers/tenant/dispositionActionsMapController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const viewOrManage = requirePermission(['dispositions.manage', 'workflow.view', 'dial.execute']);
const manageOnly = requirePermission(['dispositions.manage']);

router.get('/', viewOrManage, dispositionActionsMapController.getAll);
router.post('/', manageOnly, dispositionActionsMapController.create);
router.put('/:id/templates', manageOnly, dispositionActionsMapController.updateTemplates);
router.delete('/:id', manageOnly, dispositionActionsMapController.remove);
router.post('/:id/move', manageOnly, dispositionActionsMapController.move);

export default router;
