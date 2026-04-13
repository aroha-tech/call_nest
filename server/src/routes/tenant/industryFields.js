import { Router } from 'express';
import * as tenantIndustryFieldsController from '../../controllers/tenant/tenantIndustryFieldsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get(
  '/definitions',
  requirePermission(['contacts.read', 'leads.read']),
  tenantIndustryFieldsController.getDefinitions
);

router.get('/optional-settings', requirePermission(['settings.manage']), tenantIndustryFieldsController.getOptionalSettings);

router.put('/optional-settings', requirePermission(['settings.manage']), tenantIndustryFieldsController.putOptionalSettings);

export default router;
