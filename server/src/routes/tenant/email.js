import { Router } from 'express';
import * as emailAccountsController from '../../controllers/tenant/emailAccountsController.js';
import * as emailTemplatesController from '../../controllers/tenant/emailTemplatesController.js';
import * as emailMessagesController from '../../controllers/tenant/emailMessagesController.js';
import * as emailSendController from '../../controllers/tenant/emailSendController.js';
import * as emailSettingsController from '../../controllers/tenant/emailSettingsController.js';
import * as emailOAuthController from '../../controllers/tenant/emailOAuthController.js';
import * as emailSyncController from '../../controllers/tenant/emailSyncController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';
import { requireEmailModuleEnabled } from '../../middleware/requireEmailModule.js';

const router = Router();

// OAuth callbacks (no auth — provider redirects here)
router.get('/oauth/google/callback', emailOAuthController.callbackGoogle);
router.get('/oauth/outlook/callback', emailOAuthController.callbackOutlook);

// All other routes require tenant auth
router.use(tenantAuthMiddleware);

// Block access when email module not purchased (GET /settings still allowed so client can hide UI)
router.use(requireEmailModuleEnabled);

// OAuth start (return URL for frontend to redirect user)
router.get('/oauth/google/url', emailOAuthController.getGoogleUrl);
router.get('/oauth/outlook/url', emailOAuthController.getOutlookUrl);

// Manual sync endpoints (minimal v1 — Gmail only for now)
router.post('/sync/gmail', emailSyncController.syncGmail);

// Settings (module + communication plan flags)
router.get('/settings', emailSettingsController.getSettings);

// Accounts
router.get('/accounts', emailAccountsController.getAll);
router.get('/accounts/:id', emailAccountsController.getById);
router.post('/accounts', emailAccountsController.create);
router.put('/accounts/:id', emailAccountsController.update);
router.delete('/accounts/:id', emailAccountsController.remove);
router.post('/accounts/:id/activate', emailAccountsController.activate);
router.post('/accounts/:id/deactivate', emailAccountsController.deactivate);

// Templates
router.get('/templates', emailTemplatesController.getAll);
router.get('/templates/:id', emailTemplatesController.getById);
router.post('/templates', emailTemplatesController.create);
router.put('/templates/:id', emailTemplatesController.update);
router.delete('/templates/:id', emailTemplatesController.remove);
router.post('/templates/:id/activate', emailTemplatesController.activate);
router.post('/templates/:id/deactivate', emailTemplatesController.deactivate);

// Messages (inbox / sent)
router.get('/messages', emailMessagesController.getAll);
router.get('/messages/thread/:threadId', emailMessagesController.getThread);
router.get('/messages/:id', emailMessagesController.getById);

// Send
router.post('/send', emailSendController.send);

export default router;
