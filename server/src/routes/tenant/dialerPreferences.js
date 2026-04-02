import { Router } from 'express';
import * as controller from '../../controllers/tenant/userDialerPreferencesController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const dialAccess = requirePermission(['dial.execute', 'dispositions.manage', 'workflow.view']);

router.get('/', dialAccess, controller.get);
router.put('/', dialAccess, controller.update);

export default router;
