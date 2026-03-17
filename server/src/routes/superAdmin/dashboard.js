import { Router } from 'express';
import * as dashboardController from '../../controllers/superAdmin/dashboardController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/stats', dashboardController.getStats);

export default router;
