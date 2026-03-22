import { Router } from 'express';
import * as contactsController from '../../controllers/tenant/contactsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { uploadCsvImportSingle } from '../../middleware/uploadCsvImport.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Permissions: contacts.read / contacts.create
router.get('/', requirePermission(['contacts.read', 'leads.read']), contactsController.list);
router.get(
  '/export/csv',
  requirePermission(['contacts.read', 'leads.read']),
  contactsController.exportCsv
);
router.post(
  '/import/preview',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  uploadCsvImportSingle,
  contactsController.previewImportCsv
);
router.post(
  '/import/csv',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  uploadCsvImportSingle,
  contactsController.importCsv
);
router.post(
  '/import/resolve-preview',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  uploadCsvImportSingle,
  contactsController.previewResolvedImportCsv
);
router.get(
  '/import/history',
  requirePermission([
    'contacts.read',
    'leads.read',
    'contacts.create',
    'leads.create',
  ]),
  contactsController.listImportHistory
);
router.get(
  '/custom-fields',
  requirePermission(['contacts.read', 'leads.read']),
  contactsController.listCustomFields
);
router.post(
  '/',
  requirePermission(['contacts.create', 'leads.create']),
  contactsController.create
);
router.put(
  '/:id',
  requirePermission(['contacts.update', 'leads.update']),
  contactsController.update
);
router.delete(
  '/:id',
  requirePermission(['contacts.delete', 'leads.delete']),
  contactsController.remove
);
router.post(
  '/assign',
  requirePermission(['contacts.update', 'leads.update']),
  contactsController.assign
);
router.get(
  '/:id/custom-fields',
  requirePermission(['contacts.read', 'leads.read']),
  contactsController.listContactCustomFields
);
router.get('/:id', requirePermission(['contacts.read', 'leads.read']), contactsController.getById);

export default router;

