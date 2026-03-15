import { Router } from 'express';
import * as defaultDialingSetsController from '../../controllers/superAdmin/defaultDialingSetsController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(platformAuthMiddleware);

router.get('/', defaultDialingSetsController.getAll);
router.get('/:id', defaultDialingSetsController.getById);
router.post('/', defaultDialingSetsController.create);
router.put('/:id', defaultDialingSetsController.update);
router.delete('/:id', defaultDialingSetsController.remove);

export default router;
