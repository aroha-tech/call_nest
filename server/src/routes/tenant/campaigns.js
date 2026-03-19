import { Router } from 'express';
import * as campaignsController from '../../controllers/tenant/campaignsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get(
  '/',
  requirePermission(['contacts.read', 'leads.read']),
  campaignsController.list
);

router.get(
  '/:id',
  requirePermission(['contacts.read', 'leads.read']),
  campaignsController.getById
);

router.post(
  '/',
  requirePermission(['contacts.create', 'leads.create']),
  campaignsController.create
);

router.put(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  campaignsController.update
);

router.delete(
  '/:id',
  requirePermission(['contacts.delete', 'leads.delete']),
  campaignsController.remove
);

router.post(
  '/:id/open',
  requirePermission(['contacts.read', 'leads.read']),
  campaignsController.open
);

export default router;

