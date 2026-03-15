import * as emailTemplateService from '../../services/tenant/emailTemplateService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const emailAccountId = req.query.email_account_id
      ? Number(req.query.email_account_id)
      : null;
    const templates = await emailTemplateService.findAll(tenantId, includeInactive, emailAccountId);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
}

/** GET /options — active templates only (for dropdowns e.g. dispositions). */
export async function getOptions(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const templates = await emailTemplateService.findAll(tenantId, false);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await emailTemplateService.findById(tenantId, req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await emailTemplateService.create(tenantId, req.body, req.user.id);
    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await emailTemplateService.update(
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
    await emailTemplateService.remove(tenantId, req.params.id);
    res.json({ message: 'Email template deleted' });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Delete failed' });
  }
}

export async function activate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await emailTemplateService.activate(tenantId, req.params.id, req.user.id);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const template = await emailTemplateService.deactivate(tenantId, req.params.id, req.user.id);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
}
