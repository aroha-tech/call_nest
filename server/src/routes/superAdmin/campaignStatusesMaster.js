import { Router } from 'express';
import * as campaignStatusesMasterController from '../../controllers/superAdmin/campaignStatusesMasterController.js';
import { platformAuthMiddleware, authMiddleware } from '../../middleware/auth.js';

const router = Router();

router.get('/options', authMiddleware, campaignStatusesMasterController.getOptions);

router.use(platformAuthMiddleware);

router.get('/', campaignStatusesMasterController.getAll);
router.get('/:id', campaignStatusesMasterController.getById);
router.post('/', campaignStatusesMasterController.create);
router.put('/:id', campaignStatusesMasterController.update);
router.post('/:id/toggle-active', campaignStatusesMasterController.toggleActive);
router.delete('/:id', campaignStatusesMasterController.remove);

export default router;
