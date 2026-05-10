import { Router } from 'express';
import * as opportunitiesController from '../../controllers/tenant/opportunitiesController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get(
  '/',
  requirePermission(['contacts.read', 'leads.read']),
  opportunitiesController.list
);

router.get(
  '/:id',
  requirePermission(['contacts.read', 'leads.read', 'contacts.update', 'leads.update', 'pipelines.manage']),
  opportunitiesController.getById
);

router.post(
  '/',
  requirePermission(['contacts.update', 'leads.update', 'pipelines.manage']),
  opportunitiesController.create
);

router.patch(
  '/:id',
  requirePermission(['contacts.update', 'leads.update', 'pipelines.manage']),
  opportunitiesController.update
);

router.delete(
  '/:id',
  requirePermission(['contacts.update', 'leads.update', 'pipelines.manage']),
  opportunitiesController.remove
);

export default router;
