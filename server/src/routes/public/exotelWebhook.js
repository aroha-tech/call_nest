import { Router } from 'express';
import * as exotelWebhookController from '../../controllers/public/exotelWebhookController.js';

const router = Router();

// Exotel webhook callback endpoint (public).
router.post('/status', exotelWebhookController.status);

export default router;
