import { Router } from 'express';
import * as exotelWebhookController from '../../controllers/public/exotelWebhookController.js';

const router = Router();

// Legacy/global status callback — used by the platform default Exotel account.
router.post('/status', exotelWebhookController.status);

// Per-tenant status callback — used by BYO Exotel accounts. The tenant_token in the URL
// is a unique per-account string created when the account was registered. We use it to
// route the webhook back to the correct tenant.
router.post('/status/:tenant_token', exotelWebhookController.statusForTenant);

export default router;
