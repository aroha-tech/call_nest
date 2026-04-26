import { Router } from 'express';
import * as contactBlacklistController from '../../controllers/tenant/contactBlacklistController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', requirePermission(['contacts.read', 'leads.read']), contactBlacklistController.list);
router.post('/', requirePermission(['contacts.read', 'leads.read']), contactBlacklistController.create);
router.patch('/:id/unblock', requirePermission(['contacts.read', 'leads.read']), contactBlacklistController.unblock);

export default router;

