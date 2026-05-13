import { Router } from 'express';
import * as leadImportDistributionController from '../../controllers/tenant/leadImportDistributionController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', leadImportDistributionController.get);
router.put('/', leadImportDistributionController.put);

export default router;
