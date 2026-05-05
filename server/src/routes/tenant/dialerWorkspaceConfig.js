import { Router } from 'express';
import * as controller from '../../controllers/tenant/tenantDialerWorkspaceConfigController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const dialWorkspaceView = requirePermission([
  'dial.execute',
  'dial.monitor',
  'settings.manage',
]);

router.get('/', dialWorkspaceView, controller.get);
router.put('/', requirePermission(['settings.manage']), controller.put);

export default router;
