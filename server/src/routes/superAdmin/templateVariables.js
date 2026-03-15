import { Router } from 'express';
import * as templateVariablesController from '../../controllers/superAdmin/templateVariablesController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/', templateVariablesController.getAll);
router.get('/modules', templateVariablesController.getModules);
router.get('/:id', templateVariablesController.getById);
router.post('/', templateVariablesController.create);
router.put('/:id', templateVariablesController.update);
router.post('/:id/toggle-active', templateVariablesController.toggleActive);
router.delete('/:id', templateVariablesController.remove);

export default router;
