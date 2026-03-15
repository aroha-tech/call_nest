import * as templateVariablesService from '../../services/superAdmin/templateVariablesService.js';

export async function getAll(req, res, next) {
  try {
    const {
      search = '',
      include_inactive,
      page = '1',
      limit = '20',
    } = req.query;
    const result = await templateVariablesService.findAll({
      search,
      includeInactive: include_inactive === 'true',
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const row = await templateVariablesService.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Template variable not found' });
    }
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function getModules(req, res, next) {
  try {
    const modules = templateVariablesService.getModules();
    res.json({ data: modules });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await templateVariablesService.create(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await templateVariablesService.update(req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const data = await templateVariablesService.toggleActive(req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await templateVariablesService.remove(req.params.id);
    res.json({ message: 'Template variable deleted' });
  } catch (err) {
    next(err);
  }
}
