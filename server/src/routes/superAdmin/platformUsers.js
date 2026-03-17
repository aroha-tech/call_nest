import { Router } from 'express';
import * as platformUsersController from '../../controllers/superAdmin/platformUsersController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/', platformUsersController.getAll);
router.get('/:id', platformUsersController.getById);
router.post('/', platformUsersController.create);
router.put('/:id', platformUsersController.update);

export default router;
