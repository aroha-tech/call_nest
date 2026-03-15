import * as whatsappMessageService from '../../services/tenant/whatsappMessageService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const contact_id = req.query.contact_id || null;
    const status = req.query.status && String(req.query.status).trim() !== '' ? String(req.query.status).trim() : null;
    const search = req.query.search && String(req.query.search).trim() !== '' ? String(req.query.search).trim() : null;
    const whatsapp_account_id = req.query.whatsapp_account_id || null;
    const template_id = req.query.template_id || null;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const [messages, total] = await Promise.all([
      whatsappMessageService.findAll(tenantId, { contact_id, status, search, whatsapp_account_id, template_id, limit, offset }),
      whatsappMessageService.countAll(tenantId, { contact_id, status, search, whatsapp_account_id, template_id }),
    ]);
    res.json({ data: messages, total });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const message = await whatsappMessageService.findById(tenantId, req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ data: message });
  } catch (err) {
    next(err);
  }
}
