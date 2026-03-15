import { Router } from 'express';
import * as whatsappAccountsController from '../../controllers/tenant/whatsappAccountsController.js';
import * as whatsappTemplatesController from '../../controllers/tenant/whatsappTemplatesController.js';
import * as whatsappMessagesController from '../../controllers/tenant/whatsappMessagesController.js';
import * as whatsappSendController from '../../controllers/tenant/whatsappSendController.js';
import * as whatsappSettingsController from '../../controllers/tenant/whatsappSettingsController.js';
import * as whatsappApiLogsController from '../../controllers/tenant/whatsappApiLogsController.js';
import { tenantAuthMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

// Accounts (connect WhatsApp Business API)
router.post('/accounts/test-connection', whatsappAccountsController.testConnection);
router.get('/accounts', whatsappAccountsController.getAll);
router.get('/accounts/:id/templates', whatsappAccountsController.getTemplatesFromProvider);
router.get('/accounts/:id', whatsappAccountsController.getById);
router.post('/accounts', whatsappAccountsController.create);
router.put('/accounts/:id', whatsappAccountsController.update);
router.delete('/accounts/:id', whatsappAccountsController.remove);
router.post('/accounts/:id/activate', whatsappAccountsController.activate);
router.post('/accounts/:id/deactivate', whatsappAccountsController.deactivate);

// Templates (Meta Business API templates)
router.get('/templates', whatsappTemplatesController.getAll);
router.get('/templates/:id', whatsappTemplatesController.getById);
router.post('/templates', whatsappTemplatesController.create);
router.put('/templates/:id', whatsappTemplatesController.update);
router.delete('/templates/:id', whatsappTemplatesController.remove);
router.post('/templates/:id/activate', whatsappTemplatesController.activate);
router.post('/templates/:id/deactivate', whatsappTemplatesController.deactivate);

// Tenant WhatsApp settings (manual vs automatic send)
router.get('/settings', whatsappSettingsController.getSettings);
router.put('/settings', whatsappSettingsController.updateSettings);

// Messages (log)
router.get('/messages', whatsappMessagesController.getAll);
router.get('/messages/:id', whatsappMessagesController.getById);

// Send messages
router.post('/send', whatsappSendController.sendTemplate);
router.post('/send-text', whatsappSendController.sendText);

// API request/response logs
router.get('/logs', whatsappApiLogsController.getAll);
router.get('/logs/:id', whatsappApiLogsController.getById);

export default router;
