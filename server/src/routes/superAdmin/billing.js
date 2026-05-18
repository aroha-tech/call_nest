import { Router } from 'express';
import { platformAuthMiddleware } from '../../middleware/auth.js';
import * as platformBillingController from '../../controllers/superAdmin/platformBillingController.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/plans', platformBillingController.listPlans);
router.get('/payments', platformBillingController.listPayments);
router.get('/subscriptions', platformBillingController.listSubscriptions);
router.get('/razorpay-settings', platformBillingController.getRazorpaySettings);
router.patch('/razorpay-settings', platformBillingController.patchRazorpaySettings);

export default router;
