import { Router } from 'express';
import * as templateVariablesController from '../controllers/templateVariablesController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Any authenticated user (tenant or platform) can read template variables
router.get('/', authMiddleware, templateVariablesController.getGrouped);
router.get('/preview-sample', authMiddleware, templateVariablesController.getPreviewSample);
router.post('/validate', authMiddleware, templateVariablesController.validate);

export default router;
