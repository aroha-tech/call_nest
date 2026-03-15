import * as callScriptsService from '../../services/tenant/callScriptsService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const search = req.query.search ?? '';
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 10;
    const result = await callScriptsService.findAllPaginated(tenantId, {
      search,
      includeInactive,
      page,
      limit,
    });
    res.json({ data: result.data, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const script = await callScriptsService.findById(tenantId, req.params.id);
    if (!script) {
      return res.status(404).json({ error: 'Call script not found' });
    }
    res.json({ data: script });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { script_name, script_body, status } = req.body;

    if (!script_name || script_body == null) {
      return res.status(400).json({
        error: 'script_name and script_body are required',
      });
    }

    const script = await callScriptsService.create(
      tenantId,
      { script_name, script_body, status },
      req.user.id
    );

    res.status(201).json({ data: script });
  } catch (err) {
    if (err.invalidVariables) {
      return res.status(400).json({
        error: err.message,
        code: 'INVALID_VARIABLES',
      });
    }
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { script_name, script_body, status, is_default } = req.body;

    const script = await callScriptsService.update(
      tenantId,
      req.params.id,
      { script_name, script_body, status, is_default },
      req.user.id
    );

    res.json({ data: script });
  } catch (err) {
    if (err.invalidVariables) {
      return res.status(400).json({
        error: err.message,
        code: 'INVALID_VARIABLES',
      });
    }
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await callScriptsService.remove(tenantId, req.params.id);
    res.json({ message: 'Call script deleted successfully' });
  } catch (err) {
    if (err.code === 'DEFAULT_SCRIPT_CANNOT_DELETE') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}
