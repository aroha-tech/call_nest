import { Router } from 'express';
import * as contactDeletePolicyController from '../../controllers/tenant/contactDeletePolicyController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', contactDeletePolicyController.getPolicy);

const managePolicy = requirePermission(['settings.manage', 'users.team']);
router.put('/', managePolicy, contactDeletePolicyController.updatePolicy);

export default router;
