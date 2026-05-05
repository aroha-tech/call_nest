import { Router } from 'express';
import * as controller from '../../controllers/tenant/phoneInsightController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const phoneInsightAccess = requirePermission([
  'dial.execute',
  'dial.monitor',
  'contacts.read',
  'leads.read',
]);

router.get('/', phoneInsightAccess, controller.get);

export default router;
