import { Router } from 'express';
import * as dialerSessionsController from '../../controllers/tenant/dialerSessionsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Dialer sessions: create a queue and call leads one-by-one.
router.post('/', requirePermission(['dial.execute']), dialerSessionsController.create);
router.get('/', requirePermission(['dial.execute', 'dial.monitor']), dialerSessionsController.list);
router.get('/ids', requirePermission(['dial.execute', 'dial.monitor']), dialerSessionsController.listIds);
router.post('/export/csv', requirePermission(['dial.execute', 'dial.monitor']), dialerSessionsController.exportCsv);
router.get('/:id', requirePermission(['dial.execute', 'dial.monitor']), dialerSessionsController.getById);
router.patch(
  '/:id/items/:itemId',
  requirePermission(['dial.execute']),
  dialerSessionsController.patchItem
);
router.post('/:id/next', requirePermission(['dial.execute']), dialerSessionsController.next);
router.post('/:id/pause', requirePermission(['dial.execute']), dialerSessionsController.pause);
router.post('/:id/resume', requirePermission(['dial.execute']), dialerSessionsController.resume);
router.post('/:id/cancel', requirePermission(['dial.execute']), dialerSessionsController.cancel);

export default router;

