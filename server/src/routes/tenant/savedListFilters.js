import { Router } from 'express';
import * as savedListFiltersController from '../../controllers/tenant/savedListFiltersController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(tenantAuthMiddleware);

router.get(
  '/',
  requirePermission([
    'contacts.read',
    'leads.read',
    'dial.execute',
    'dial.monitor',
  ]),
  savedListFiltersController.list
);
router.post(
  '/',
  requirePermission([
    'contacts.read',
    'leads.read',
    'dial.execute',
    'dial.monitor',
  ]),
  savedListFiltersController.create
);
router.put(
  '/:id',
  requirePermission([
    'contacts.read',
    'leads.read',
    'dial.execute',
    'dial.monitor',
  ]),
  savedListFiltersController.update
);
router.delete('/:id', requirePermission(['contacts.read', 'leads.read', 'dial.execute', 'dial.monitor']), savedListFiltersController.remove);

export default router;
