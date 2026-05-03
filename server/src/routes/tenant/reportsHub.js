import { Router } from 'express';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import * as reportsHubController from '../../controllers/tenant/reportsHubController.js';

const router = Router();
router.use(tenantAuthMiddleware);

const reportsAccess = requirePermission(['reports.view', 'reports.performance.view', 'settings.manage']);

router.get('/context', reportsAccess, reportsHubController.context);
router.get('/kpi-summary', reportsAccess, reportsHubController.kpiSummary);
router.get('/teams', reportsAccess, reportsHubController.teamsRollup);
router.get('/leaderboard', reportsAccess, reportsHubController.leaderboard);
router.get('/insights', reportsAccess, reportsHubController.nestInsights);

export default router;
