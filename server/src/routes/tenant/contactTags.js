import { Router } from 'express';
import * as contactTagsController from '../../controllers/tenant/contactTagsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get(
  '/',
  requirePermission(['contacts.read', 'leads.read']),
  contactTagsController.list
);

router.post(
  '/',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  contactTagsController.create
);

router.put(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  contactTagsController.update
);

router.delete(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  contactTagsController.remove
);

router.delete(
  '/:id/permanent',
  requirePermission(['contacts.update', 'leads.update']),
  contactTagsController.removePermanent
);

router.patch(
  '/:id/unarchive',
  requirePermission(['contacts.update', 'leads.update']),
  contactTagsController.unarchive
);

export default router;
