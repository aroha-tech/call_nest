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

router.post(
  '/:id/open',
  requirePermission(['contacts.read', 'leads.read']),
  campaignsController.open
);

export default router;

