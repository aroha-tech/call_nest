import { Router } from 'express';
import { platformAuthMiddleware } from '../../middleware/auth.js';
import * as telephonyBillingPlansController from '../../controllers/superAdmin/telephonyBillingPlansController.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/options', telephonyBillingPlansController.options);
router.get('/', telephonyBillingPlansController.list);
router.post('/reorder', telephonyBillingPlansController.reorder);
router.get('/:id', telephonyBillingPlansController.getById);
router.post('/', telephonyBillingPlansController.create);
router.put('/:id', telephonyBillingPlansController.update);
router.post('/:id/toggle-active', telephonyBillingPlansController.toggleActive);
router.delete('/:id', telephonyBillingPlansController.remove);

export default router;
