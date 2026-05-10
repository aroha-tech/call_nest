import { Router } from 'express';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { requireTenantAdvancedReports } from '../../middleware/reportsAdvancedEnabled.js';
import * as reportsHubController from '../../controllers/tenant/reportsHubController.js';

const router = Router();
router.use(tenantAuthMiddleware);

const reportsAccess = requirePermission(['reports.view', 'reports.performance.view', 'settings.manage']);

router.get('/context', reportsAccess, reportsHubController.context);
router.get('/kpi-summary', reportsAccess, reportsHubController.kpiSummary);
router.get('/teams', reportsAccess, requireTenantAdvancedReports, reportsHubController.teamsRollup);
router.get('/leaderboard', reportsAccess, requireTenantAdvancedReports, reportsHubController.leaderboard);
router.get('/insights', reportsAccess, requireTenantAdvancedReports, reportsHubController.nestInsights);

export default router;
