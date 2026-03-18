import { Router } from 'express';
import * as contactCustomFieldsController from '../../controllers/tenant/contactCustomFieldsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get(
  '/',
  requirePermission(['contacts.read', 'leads.read']),
  contactCustomFieldsController.getAll
);

router.post(
  '/',
  requirePermission(['contacts.update', 'leads.update']),
  contactCustomFieldsController.create
);

router.put(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  contactCustomFieldsController.update
);

router.post(
  '/:id/activate',
  requirePermission(['contacts.update', 'leads.update']),
  contactCustomFieldsController.activate
);

router.post(
  '/:id/deactivate',
  requirePermission(['contacts.update', 'leads.update']),
  contactCustomFieldsController.deactivate
);

router.delete(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  contactCustomFieldsController.remove
);

export default router;

