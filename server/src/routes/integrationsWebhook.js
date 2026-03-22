import { Router } from 'express';
import * as integrationsWebhookController from '../controllers/integrationsWebhookController.js';

const router = Router();

// Public webhook receiver (no tenantAuth).
// Route example:
// POST /api/integrations/webhook/meta_lead_ads/123
// Headers (optional): x-webhook-secret: <secret>
router.post('/:provider/:integrationId', integrationsWebhookController.receive);

export default router;

