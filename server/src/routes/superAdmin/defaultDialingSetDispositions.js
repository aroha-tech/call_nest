import { Router } from 'express';
import * as defaultDialingSetDispositionsController from '../../controllers/superAdmin/defaultDialingSetDispositionsController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(platformAuthMiddleware);

router.get('/', defaultDialingSetDispositionsController.getAll);
router.post('/', defaultDialingSetDispositionsController.create);
router.delete('/:id', defaultDialingSetDispositionsController.remove);
router.post('/:id/move', defaultDialingSetDispositionsController.move);

export default router;
