import { Router } from 'express';
import * as defaultDispositionsController from '../../controllers/superAdmin/defaultDispositionsController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(platformAuthMiddleware);

router.get('/', defaultDispositionsController.getAll);
router.get('/:id', defaultDispositionsController.getById);
router.post('/', defaultDispositionsController.create);
router.put('/:id', defaultDispositionsController.update);
router.delete('/:id', defaultDispositionsController.remove);

export default router;
