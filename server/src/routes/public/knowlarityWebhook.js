import { Router } from 'express';
import * as knowlarityWebhookController from '../../controllers/public/knowlarityWebhookController.js';

const router = Router();

// Knowlarity webhook callback endpoint (public).
router.post('/status', knowlarityWebhookController.status);

export default router;

