import { Router } from 'express';
import * as dealsController from '../../controllers/tenant/dealsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const readDeals = ['pipelines.manage', 'contacts.read', 'leads.read'];

router.get('/', requirePermission(readDeals), dealsController.list);
router.post('/', requirePermission('pipelines.manage'), dealsController.create);

router.get('/:id/board', requirePermission('pipelines.manage'), dealsController.getBoard);
router.put('/:id/stages/reorder', requirePermission('pipelines.manage'), dealsController.reorderStages);

router.get('/:id', requirePermission(readDeals), dealsController.getById);
router.put('/:id', requirePermission('pipelines.manage'), dealsController.update);
router.delete('/:id', requirePermission('pipelines.manage'), dealsController.remove);

router.post('/:id/stages', requirePermission('pipelines.manage'), dealsController.createStage);
router.patch('/:id/stages/:stageId', requirePermission('pipelines.manage'), dealsController.updateStage);
router.delete('/:id/stages/:stageId', requirePermission('pipelines.manage'), dealsController.removeStage);

export default router;
