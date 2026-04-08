import { Router } from 'express';
import * as dialerSessionsController from '../../controllers/tenant/dialerSessionsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Dialer sessions: create a queue and call leads one-by-one.
router.post('/', requirePermission(['dial.execute']), dialerSessionsController.create);
router.get('/:id', requirePermission(['dial.execute', 'dial.monitor']), dialerSessionsController.getById);
router.post('/:id/next', requirePermission(['dial.execute']), dialerSessionsController.next);
router.post('/:id/cancel', requirePermission(['dial.execute']), dialerSessionsController.cancel);

export default router;

