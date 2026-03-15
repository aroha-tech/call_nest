import * as whatsappBusinessTemplateService from '../../services/tenant/whatsappBusinessTemplateService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const accountId = req.query.whatsapp_account_id || null;
    const templates = await whatsappBusinessTemplateService.findAll(tenantId, includeInactive, accountId);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappBusinessTemplateService.getTemplateWithComponents(tenantId, req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'WhatsApp template not found' });
    }
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappBusinessTemplateService.create(tenantId, req.body, req.user.id);
    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappBusinessTemplateService.update(
      tenantId,
      req.params.id,
      req.body,
      req.user.id
    );
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await whatsappBusinessTemplateService.remove(tenantId, req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    next(err);
  }
}

export async function activate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappBusinessTemplateService.activate(tenantId, req.params.id, req.user.id);
    res.json({ data: template, message: 'Template activated' });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappBusinessTemplateService.deactivate(tenantId, req.params.id, req.user.id);
    res.json({ data: template, message: 'Template deactivated' });
  } catch (err) {
    next(err);
  }
}
