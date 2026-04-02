import { Router } from 'express';
import * as dispositionsController from '../../controllers/tenant/dispositionsController.js';
import * as dispositionCloneController from '../../controllers/tenant/dispositionCloneController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const viewOrManage = requirePermission(['dispositions.manage', 'workflow.view', 'dial.execute']);
const manageOnly = requirePermission(['dispositions.manage']);

router.get('/', viewOrManage, dispositionsController.getAll);
router.post('/clone', manageOnly, dispositionCloneController.cloneFromIndustry);
router.post('/clone-single', manageOnly, dispositionCloneController.cloneDisposition);
router.get('/:id', viewOrManage, dispositionsController.getById);
router.post('/', manageOnly, dispositionsController.create);
router.put('/:id', manageOnly, dispositionsController.update);
router.delete('/:id', manageOnly, dispositionsController.remove);

export default router;
