import { Router } from 'express';
import { tenantAuthMiddleware } from '../../middleware/auth.js';
import * as taskManagerController from '../../controllers/tenant/taskManagerController.js';

const router = Router();
router.use(tenantAuthMiddleware);

function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (allowedRoles.includes(role)) return next();
    return res.status(403).json({ error: 'Permission denied' });
  };
}

const tasksView = requireRole(['admin', 'manager', 'agent']);
const tasksManage = requireRole(['admin', 'manager']);
const reportsView = requireRole(['admin', 'manager', 'agent']);
const reportsExport = requireRole(['admin', 'manager']);

router.get('/templates', tasksView, taskManagerController.listTemplates);
router.post('/templates', tasksManage, taskManagerController.createTemplate);

router.get('/assignments', tasksView, taskManagerController.listAssignments);
router.post('/assignments', tasksManage, taskManagerController.createAssignment);
router.delete('/assignments/:id', tasksManage, taskManagerController.deleteAssignment);

router.get('/daily-logs', tasksView, taskManagerController.listDailyLogs);
router.post('/daily-logs/recompute', tasksView, taskManagerController.recomputeLogs);
router.post('/daily-logs/:id/recompute', tasksManage, taskManagerController.recomputeLogs);
router.patch('/daily-logs/:id/agent-note', tasksView, taskManagerController.updateAgentNote);
router.patch('/daily-logs/:id/manager-note', tasksManage, taskManagerController.updateManagerNote);
router.get('/daily-logs/:id/note-history', tasksView, taskManagerController.listNoteHistory);

router.get('/reports/summary', reportsView, taskManagerController.rolewiseSummary);
router.get('/reports/calendar', reportsView, taskManagerController.calendar);
router.get('/reports/trend', reportsView, taskManagerController.trend);
router.get('/reports/coaching-insights', reportsView, taskManagerController.coachingInsights);
router.get('/reports/export.csv', reportsExport, taskManagerController.exportSummaryCsv);

router.get('/scoring-config', tasksView, taskManagerController.getScoring);
router.put('/scoring-config', tasksManage, taskManagerController.updateScoring);

export default router;
