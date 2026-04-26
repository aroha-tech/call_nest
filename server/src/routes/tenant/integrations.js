import { Router } from 'express';
import * as integrationsController from '../../controllers/tenant/integrationsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Manage provider integrations (tokens + webhook settings)
router.get('/', requirePermission(['settings.manage']), integrationsController.list);
router.get('/:id', requirePermission(['settings.manage']), integrationsController.getById);
router.post('/', requirePermission(['settings.manage']), integrationsController.upsert);
router.get('/apps', requirePermission(['settings.manage']), integrationsController.listApps);
router.post('/apps', requirePermission(['settings.manage']), integrationsController.createApp);
router.post('/apps/:appId/rotate-key', requirePermission(['settings.manage']), integrationsController.rotateAppKey);
router.post('/internal-crm/contacts/upsert', requirePermission(['settings.manage']), integrationsController.internalUpsertContacts);
router.post('/internal-crm/calls/click-to-call', requirePermission(['settings.manage']), integrationsController.internalClickToCall);
router.post('/internal-crm/calls/lifecycle', requirePermission(['settings.manage']), integrationsController.internalLifecycle);
router.post('/internal-crm/activities/writeback', requirePermission(['settings.manage']), integrationsController.internalWriteback);

// Manual sync (poll) framework endpoint
router.post('/:id/sync', requirePermission(['settings.manage']), integrationsController.syncNow);

export default router;

