import { Router } from 'express';
import * as integrationsController from '../../controllers/tenant/integrationsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Manage provider integrations (tokens + webhook settings)
router.get('/', requirePermission(['settings.manage']), integrationsController.list);
router.get('/:id', requirePermission(['settings.manage']), integrationsController.getById);
router.post('/', requirePermission(['settings.manage']), integrationsController.upsert);

// Manual sync (poll) framework endpoint
router.post('/:id/sync', requirePermission(['settings.manage']), integrationsController.syncNow);

export default router;

