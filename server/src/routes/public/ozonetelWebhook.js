import { Router } from 'express';
import * as ozonetelWebhookController from '../../controllers/public/ozonetelWebhookController.js';

const router = Router();

// Ozonetel webhook callback endpoint (public).
router.post('/status', ozonetelWebhookController.status);

export default router;

