import { Router } from 'express';
import * as razorpayWebhookController from '../../controllers/public/razorpayWebhookController.js';

const router = Router();

router.post('/', razorpayWebhookController.handleRazorpayWebhook);

export default router;
