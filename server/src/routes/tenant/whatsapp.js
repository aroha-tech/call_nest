import { Router } from 'express';
import * as whatsappAccountsController from '../../controllers/tenant/whatsappAccountsController.js';
import * as whatsappTemplatesController from '../../controllers/tenant/whatsappTemplatesController.js';
import * as whatsappMessagesController from '../../controllers/tenant/whatsappMessagesController.js';
import * as whatsappSendController from '../../controllers/tenant/whatsappSendController.js';
import * as whatsappSettingsController from '../../controllers/tenant/whatsappSettingsController.js';
import * as whatsappApiLogsController from '../../controllers/tenant/whatsappApiLogsController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(tenantAuthMiddleware);

/** Read WhatsApp UI data (templates list, accounts list, message log, settings read). */
const waView = requirePermission(['whatsapp.view', 'settings.manage', 'dial.execute']);
/** Send template / text messages. */
const waSend = requirePermission(['whatsapp.send', 'settings.manage', 'dial.execute']);
/** Create/edit templates, import from provider, tenant message templates, WhatsApp send settings. */
const waTemplatesManage = requirePermission(['whatsapp.templates.manage', 'settings.manage']);
/** Connect/edit WhatsApp Business accounts. */
const waAccountsManage = requirePermission(['whatsapp.accounts.manage', 'settings.manage']);
/** API request/response logs. */
const waLogsView = requirePermission(['whatsapp.logs.view', 'settings.manage']);

// Accounts (connect WhatsApp Business API)
router.post('/accounts/test-connection', waAccountsManage, whatsappAccountsController.testConnection);
router.get('/accounts', waView, whatsappAccountsController.getAll);
router.get('/accounts/:id/templates', waTemplatesManage, whatsappAccountsController.getTemplatesFromProvider);
router.get('/accounts/:id', waView, whatsappAccountsController.getById);
router.post('/accounts', waAccountsManage, whatsappAccountsController.create);
router.put('/accounts/:id', waAccountsManage, whatsappAccountsController.update);
router.delete('/accounts/:id', waAccountsManage, whatsappAccountsController.remove);
router.post('/accounts/:id/activate', waAccountsManage, whatsappAccountsController.activate);
router.post('/accounts/:id/deactivate', waAccountsManage, whatsappAccountsController.deactivate);

// Templates (Meta Business API templates)
router.get('/templates', waView, whatsappTemplatesController.getAll);
router.get('/templates/:id', waView, whatsappTemplatesController.getById);
router.post('/templates', waTemplatesManage, whatsappTemplatesController.create);
router.put('/templates/:id', waTemplatesManage, whatsappTemplatesController.update);
router.delete('/templates/:id', waTemplatesManage, whatsappTemplatesController.remove);
router.post('/templates/:id/activate', waTemplatesManage, whatsappTemplatesController.activate);
router.post('/templates/:id/deactivate', waTemplatesManage, whatsappTemplatesController.deactivate);

// Tenant WhatsApp settings (manual vs automatic send)
router.get('/settings', waView, whatsappSettingsController.getSettings);
router.put('/settings', waTemplatesManage, whatsappSettingsController.updateSettings);

// Messages (log)
router.get('/messages', waView, whatsappMessagesController.getAll);
router.get('/messages/:id', waView, whatsappMessagesController.getById);

// Send messages
router.post('/send', waSend, whatsappSendController.sendTemplate);
router.post('/send-text', waSend, whatsappSendController.sendText);

// API request/response logs
router.get('/logs', waLogsView, whatsappApiLogsController.getAll);
router.get('/logs/:id', waLogsView, whatsappApiLogsController.getById);

export default router;
