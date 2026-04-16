import { Router } from 'express';
import * as callsController from '../../controllers/tenant/callsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Call module endpoints (provider-agnostic). Requires dial access.
router.post('/start', requirePermission(['dial.execute']), callsController.start);
router.post('/start/bulk', requirePermission(['dial.execute']), callsController.startBulk);
router.get('/metrics', requirePermission(['dial.execute', 'dial.monitor']), callsController.metrics);
router.get('/ids', requirePermission(['dial.execute', 'dial.monitor']), callsController.listIds);
router.post('/export/csv', requirePermission(['dial.execute', 'dial.monitor']), callsController.exportCsv);
router.get('/', requirePermission(['dial.execute', 'dial.monitor']), callsController.list);
router.patch('/:id/notes', requirePermission(['dial.execute', 'dial.monitor']), callsController.patchNotes);
router.put('/:id/disposition', requirePermission(['dial.execute', 'dial.monitor']), callsController.setDisposition);

export default router;

