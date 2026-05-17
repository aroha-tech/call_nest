import { Router } from 'express';
import * as impersonationController from '../../controllers/superAdmin/impersonationController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.post('/', impersonationController.start);

export default router;
