import { Router } from 'express';
import * as tenantDashboardController from '../../controllers/tenant/tenantDashboardController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);
router.get('/', requirePermission('dashboard.view'), tenantDashboardController.getDashboard);

export default router;
