import * as whatsappSendService from '../../services/tenant/whatsappSendService.js';

export async function sendTemplate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const message = await whatsappSendService.sendTemplateMessage(tenantId, req.body, req.user.id);
    res.status(201).json({ data: message, message: 'Message sent' });
  } catch (err) {
    next(err);
  }
}

export async function sendText(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const message = await whatsappSendService.sendTextMessage(tenantId, req.body, req.user.id);
    res.status(201).json({ data: message, message: 'Message sent' });
  } catch (err) {
    next(err);
  }
}
