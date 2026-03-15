import { Router } from 'express';
import * as callScriptsController from '../../controllers/tenant/callScriptsController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', callScriptsController.getAll);
router.get('/:id', callScriptsController.getById);
router.post('/', callScriptsController.create);
router.put('/:id', callScriptsController.update);
router.delete('/:id', callScriptsController.remove);

export default router;
