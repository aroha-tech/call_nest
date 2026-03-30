import { Router } from 'express';
import * as tenantCompanyController from '../../controllers/tenant/tenantCompanyController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const settingsAccess = requirePermission(['settings.manage']);

router.get('/', settingsAccess, tenantCompanyController.get);
router.put('/', settingsAccess, tenantCompanyController.update);

export default router;
