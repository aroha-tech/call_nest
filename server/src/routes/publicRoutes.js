import { Router } from 'express';
import * as publicController from '../controllers/publicController.js';

const router = Router();

router.get('/workspace-host-status', publicController.workspaceHostStatus);
router.post('/workspace-lookup', publicController.workspaceLookupByEmail);

export default router;
