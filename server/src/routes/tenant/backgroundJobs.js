import { Router } from 'express';
import express from 'express';
import * as backgroundJobsController from '../../controllers/tenant/backgroundJobsController.js';
import { tenantAuthMiddleware, requirePermission, requireContactDeleteAccess } from '../../middleware/auth.js';
import { uploadCsvImportSingle } from '../../middleware/uploadCsvImport.js';

const router = Router();
const jsonLarge = express.json({ limit: '32mb' });

router.use(tenantAuthMiddleware);

/** Leads and contacts share the same job handlers; these defaults scope list filters / export to leads when type is omitted. */
function ensureLeadsExportBodyDefaults(req, res, next) {
  const b = req.body;
  if (b && typeof b === 'object' && (b.type === undefined || b.type === null || String(b.type).trim() === '')) {
    b.type = 'lead';
  }
  next();
}

function ensureLeadsBulkListFilterDefaults(req, res, next) {
  const b = req.body;
  if (!b || typeof b !== 'object') return next();
  const patch = (lf) => {
    if (!lf || typeof lf !== 'object') return;
    if (lf.type === undefined || lf.type === null || String(lf.type).trim() === '') {
      lf.type = 'lead';
    }
  };
  patch(b.list_filter);
  patch(b.listFilter);
  next();
}

router.get('/', requirePermission(['contacts.read', 'leads.read']), backgroundJobsController.list);

router.post(
  '/dismiss-finished',
  requirePermission(['contacts.read', 'leads.read']),
  backgroundJobsController.dismissFinished
);

router.post(
  '/:id/cancel',
  requirePermission(['contacts.read', 'leads.read']),
  backgroundJobsController.cancel
);

router.post(
  '/contacts/import-csv',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  uploadCsvImportSingle,
  backgroundJobsController.enqueueImportCsv
);

router.post(
  '/contacts/export-csv',
  requirePermission(['contacts.read', 'leads.read']),
  jsonLarge,
  backgroundJobsController.enqueueExportCsv
);

router.post(
  '/contacts/bulk-add-tags',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  backgroundJobsController.enqueueBulkAddTags
);

router.post(
  '/contacts/bulk-remove-tags',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  backgroundJobsController.enqueueBulkRemoveTags
);

router.post(
  '/contacts/bulk-delete',
  requireContactDeleteAccess(),
  jsonLarge,
  backgroundJobsController.enqueueBulkDelete
);

router.post(
  '/contacts/bulk-assign',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  backgroundJobsController.enqueueBulkAssign
);

/* Same handlers as /contacts/* — use when the work is lead-scoped (defaults type / list_filter.type to lead when omitted). */
router.post(
  '/leads/import-csv',
  requirePermission(['contacts.create', 'leads.create', 'contacts.update', 'leads.update']),
  uploadCsvImportSingle,
  backgroundJobsController.enqueueImportCsv
);

router.post(
  '/leads/export-csv',
  requirePermission(['contacts.read', 'leads.read']),
  jsonLarge,
  ensureLeadsExportBodyDefaults,
  backgroundJobsController.enqueueExportCsv
);

router.post(
  '/leads/bulk-add-tags',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  ensureLeadsBulkListFilterDefaults,
  backgroundJobsController.enqueueBulkAddTags
);

router.post(
  '/leads/bulk-remove-tags',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  ensureLeadsBulkListFilterDefaults,
  backgroundJobsController.enqueueBulkRemoveTags
);

router.post(
  '/leads/bulk-delete',
  requireContactDeleteAccess(),
  jsonLarge,
  ensureLeadsBulkListFilterDefaults,
  backgroundJobsController.enqueueBulkDelete
);

router.post(
  '/leads/bulk-assign',
  requirePermission(['contacts.update', 'leads.update']),
  jsonLarge,
  ensureLeadsBulkListFilterDefaults,
  backgroundJobsController.enqueueBulkAssign
);

router.get('/:id/download', requirePermission(['contacts.read', 'leads.read']), backgroundJobsController.download);
router.get('/:id', requirePermission(['contacts.read', 'leads.read']), backgroundJobsController.getById);

export default router;
