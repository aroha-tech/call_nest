import { Router } from 'express';
import * as dialingSetDispositionsController from '../../controllers/tenant/dialingSetDispositionsController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

router.get('/', dialingSetDispositionsController.getAll);
router.post('/', dialingSetDispositionsController.create);
router.delete('/:id', dialingSetDispositionsController.remove);
router.post('/:id/move', dialingSetDispositionsController.move);

export default router;
