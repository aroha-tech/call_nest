import { Router } from 'express';
import * as telephonyAccountsController from '../../controllers/tenant/telephonyAccountsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(tenantAuthMiddleware);

const manage = requirePermission(['telephony.accounts.manage', 'settings.manage']);
const view = requirePermission(['telephony.accounts.view', 'telephony.accounts.manage', 'settings.manage']);

// Mode endpoints (account mode + billing mode) live alongside the account CRUD so the
// frontend has a single section in Settings → Calling → Provider.
router.get('/mode', view, telephonyAccountsController.getMode);
router.patch('/mode', manage, telephonyAccountsController.updateMode);

router.get('/', view, telephonyAccountsController.list);
router.post('/', manage, telephonyAccountsController.create);
router.get('/:id', view, telephonyAccountsController.get);
router.patch('/:id', manage, telephonyAccountsController.update);
router.delete('/:id', manage, telephonyAccountsController.remove);
router.post('/:id/rotate-webhook-token', manage, telephonyAccountsController.rotateToken);

export default router;
