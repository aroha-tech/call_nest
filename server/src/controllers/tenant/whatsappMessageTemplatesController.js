import * as whatsappTemplatesService from '../../services/tenant/whatsappTemplatesService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const templates = await whatsappTemplatesService.findAll(tenantId, includeInactive);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
}

export async function getOptions(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const data = await whatsappTemplatesService.findAllActive(tenantId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappTemplatesService.findById(tenantId, req.params.id);
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
    const template = await whatsappTemplatesService.create(tenantId, req.body, req.user.id);
    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await whatsappTemplatesService.update(
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
    await whatsappTemplatesService.remove(tenantId, req.params.id);
    res.json({ message: 'WhatsApp template deleted' });
  } catch (err) {
    next(err);
  }
}
