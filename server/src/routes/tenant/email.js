import { Router } from 'express';
import * as emailAccountsController from '../../controllers/tenant/emailAccountsController.js';
import * as emailTemplatesController from '../../controllers/tenant/emailTemplatesController.js';
import * as emailMessagesController from '../../controllers/tenant/emailMessagesController.js';
import * as emailSendController from '../../controllers/tenant/emailSendController.js';
import * as emailSettingsController from '../../controllers/tenant/emailSettingsController.js';
import * as emailOAuthController from '../../controllers/tenant/emailOAuthController.js';
import * as emailSyncController from '../../controllers/tenant/emailSyncController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { requireEmailModuleEnabled } from '../../middleware/requireEmailModule.js';

const router = Router();

const emailView = requirePermission(['email.view', 'settings.manage', 'dial.execute']);
const emailSend = requirePermission(['email.send', 'settings.manage', 'dial.execute']);
const emailTemplatesManage = requirePermission(['email.templates.manage', 'settings.manage']);
const emailAccountsManage = requirePermission(['email.accounts.manage', 'settings.manage']);

// OAuth callbacks (no auth — provider redirects here)
router.get('/oauth/google/callback', emailOAuthController.callbackGoogle);
router.get('/oauth/outlook/callback', emailOAuthController.callbackOutlook);

// All other routes require tenant auth
router.use(tenantAuthMiddleware);

// Block access when email module not purchased (GET /settings still allowed so client can hide UI)
router.use(requireEmailModuleEnabled);

// OAuth start (return URL for frontend to redirect user)
router.get('/oauth/google/url', emailAccountsManage, emailOAuthController.getGoogleUrl);
router.get('/oauth/outlook/url', emailAccountsManage, emailOAuthController.getOutlookUrl);

// Manual sync endpoints (minimal v1 — Gmail only for now)
router.post('/sync/gmail', emailView, emailSyncController.syncGmail);

// Settings (module + communication plan flags)
router.get('/settings', emailView, emailSettingsController.getSettings);

// Accounts
router.get('/accounts', emailView, emailAccountsController.getAll);
router.get('/accounts/:id', emailView, emailAccountsController.getById);
router.post('/accounts', emailAccountsManage, emailAccountsController.create);
router.put('/accounts/:id', emailAccountsManage, emailAccountsController.update);
router.delete('/accounts/:id', emailAccountsManage, emailAccountsController.remove);
router.post('/accounts/:id/activate', emailAccountsManage, emailAccountsController.activate);
router.post('/accounts/:id/deactivate', emailAccountsManage, emailAccountsController.deactivate);

// Templates
router.get('/templates', emailView, emailTemplatesController.getAll);
router.get('/templates/:id', emailView, emailTemplatesController.getById);
router.post('/templates', emailTemplatesManage, emailTemplatesController.create);
router.put('/templates/:id', emailTemplatesManage, emailTemplatesController.update);
router.delete('/templates/:id', emailTemplatesManage, emailTemplatesController.remove);
router.post('/templates/:id/activate', emailTemplatesManage, emailTemplatesController.activate);
router.post('/templates/:id/deactivate', emailTemplatesManage, emailTemplatesController.deactivate);

// Messages (inbox / sent)
router.get('/messages', emailView, emailMessagesController.getAll);
router.get('/messages/thread/:threadId', emailView, emailMessagesController.getThread);
router.get('/messages/:id', emailView, emailMessagesController.getById);

// Send
router.post('/send', emailSend, emailSendController.send);

export default router;
