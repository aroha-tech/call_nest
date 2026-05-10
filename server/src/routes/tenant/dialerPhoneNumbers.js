import { Router } from 'express';
import * as dialerPhoneNumbersController from '../../controllers/tenant/dialerPhoneNumbersController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(tenantAuthMiddleware);
const manage = requirePermission(['settings.manage']);

router.get('/', manage, dialerPhoneNumbersController.list);
router.put('/:id', manage, dialerPhoneNumbersController.update);

export default router;
