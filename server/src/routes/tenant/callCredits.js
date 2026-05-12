import { Router } from 'express';
import * as callCreditsController from '../../controllers/tenant/callCreditsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(tenantAuthMiddleware);

const view = requirePermission([
  'billing.credits.view',
  'telephony.accounts.manage',
  'settings.manage',
]);

router.get('/balance', view, callCreditsController.getBalance);
router.get('/ledger', view, callCreditsController.getLedger);
router.get('/usage', view, callCreditsController.getUsage);

export default router;
