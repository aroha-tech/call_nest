import { Router } from 'express';
import * as campaignTypesMasterController from '../../controllers/superAdmin/campaignTypesMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

router.get('/options', authMiddleware, campaignTypesMasterController.getOptions);

router.use(platformAuthMiddleware);

router.get('/', campaignTypesMasterController.getAll);
router.get('/:id', campaignTypesMasterController.getById);
router.post('/', campaignTypesMasterController.create);
router.put('/:id', campaignTypesMasterController.update);
router.post('/:id/toggle-active', campaignTypesMasterController.toggleActive);
router.delete('/:id', campaignTypesMasterController.remove);

export default router;
