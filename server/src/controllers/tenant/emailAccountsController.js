import * as emailAccountService from '../../services/tenant/emailAccountService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const accounts = await emailAccountService.findAll(tenantId, includeInactive);
    res.json({ data: accounts });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await emailAccountService.findById(tenantId, req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await emailAccountService.create(tenantId, req.body, req.user.id);
    res.status(201).json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await emailAccountService.update(
      tenantId,
      req.params.id,
      req.body,
      req.user.id
    );
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await emailAccountService.remove(tenantId, req.params.id, req.user.id);
    res.json({ message: 'Email account deleted' });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Delete failed' });
  }
}

export async function activate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await emailAccountService.activate(tenantId, req.params.id, req.user.id);
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await emailAccountService.deactivate(tenantId, req.params.id, req.user.id);
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}
