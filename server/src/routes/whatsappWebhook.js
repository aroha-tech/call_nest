import { Router } from 'express';
import * as whatsappWebhookController from '../controllers/whatsappWebhookController.js';

const router = Router();

/** Public webhook: message status (delivered, read, failed). Twilio sends AccountSid, MessageSid, MessageStatus. */
router.post('/message-status', whatsappWebhookController.messageStatus);

export default router;
