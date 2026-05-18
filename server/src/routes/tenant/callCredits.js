import { Router } from 'express';
import * as callCreditsController from '../../controllers/tenant/callCreditsController.js';
import * as creditPurchaseController from '../../controllers/tenant/creditPurchaseController.js';
import * as seatPurchaseController from '../../controllers/tenant/seatPurchaseController.js';
import * as telephonySubscriptionController from '../../controllers/tenant/telephonySubscriptionController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(tenantAuthMiddleware);

const view = requirePermission([
  'billing.credits.view',
  'telephony.accounts.manage',
  'settings.manage',
  'dial.execute',
]);

const manage = requirePermission(['settings.manage', 'billing.credits.view']);

router.get('/balance', view, callCreditsController.getBalance);
router.get('/ledger', view, callCreditsController.getLedger);
router.get('/usage', view, callCreditsController.getUsage);

router.get('/purchase/config', manage, creditPurchaseController.getConfig);
router.get('/purchase/plans', manage, creditPurchaseController.listPlans);
router.get('/purchase/wallet', manage, creditPurchaseController.getWalletSummary);
router.post('/purchase/orders', manage, creditPurchaseController.createOrder);
router.post('/purchase/verify', manage, creditPurchaseController.verifyPayment);

router.get('/seats/limits', manage, seatPurchaseController.getLimits);
router.get('/seats/plans', manage, seatPurchaseController.listPlans);
router.post('/seats/orders', manage, seatPurchaseController.createOrder);
router.post('/seats/verify', manage, seatPurchaseController.verifyPayment);

router.get('/subscription/current', manage, telephonySubscriptionController.getCurrent);
router.get('/subscription/history', manage, telephonySubscriptionController.listHistory);
router.post('/subscription/checkout', manage, telephonySubscriptionController.createCheckout);
router.post('/subscription/verify', manage, telephonySubscriptionController.verifyCheckout);

export default router;
