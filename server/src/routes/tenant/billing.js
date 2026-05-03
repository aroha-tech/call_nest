import { Router } from 'express';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import * as billingController from '../../controllers/tenant/billingController.js';

const router = Router();
router.use(tenantAuthMiddleware);

const canManage = requirePermission('settings.manage');

router.get('/config', canManage, billingController.getConfig);
router.get('/plans', canManage, billingController.listPlans);
router.post('/orders', canManage, billingController.createOrder);
router.post('/verify', canManage, billingController.verifyPayment);
router.get('/payments', canManage, billingController.listPayments);
router.get('/subscriptions', canManage, billingController.listSubscriptions);
router.get('/current', canManage, billingController.currentSubscription);

export default router;
