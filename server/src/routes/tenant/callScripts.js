import { Router } from 'express';
import * as callScriptsController from '../../controllers/tenant/callScriptsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

const scriptsView = requirePermission(['settings.manage', 'workflow.view', 'dial.execute']);
const scriptsWrite = requirePermission(['settings.manage', 'scripts.self']);

router.get('/', scriptsView, callScriptsController.getAll);
router.get('/:id', scriptsView, callScriptsController.getById);
router.post('/', scriptsWrite, callScriptsController.create);
router.put('/:id', scriptsWrite, callScriptsController.update);
router.delete('/:id', scriptsWrite, callScriptsController.remove);

export default router;
