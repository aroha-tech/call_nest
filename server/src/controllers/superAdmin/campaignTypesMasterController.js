import * as campaignTypesMasterService from '../../services/superAdmin/campaignTypesMasterService.js';

export async function getAll(req, res, next) {
  try {
    const { search = '', include_inactive, page = '1', limit = '20' } = req.query;

    const result = await campaignTypesMasterService.findAll({
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

export async function getOptions(req, res, next) {
  try {
    const data = await campaignTypesMasterService.findAllActive();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const row = await campaignTypesMasterService.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Campaign type not found' });
    }
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { name, code, is_active } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'name and code are required' });
    }

    const row = await campaignTypesMasterService.create({ name, code, is_active }, req.user.id);

    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { name, is_active } = req.body;

    const row = await campaignTypesMasterService.update(req.params.id, { name, is_active }, req.user.id);

    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const row = await campaignTypesMasterService.toggleActive(req.params.id, req.user.id);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await campaignTypesMasterService.remove(req.params.id);
    res.json({ message: 'Campaign type deleted successfully' });
  } catch (err) {
    next(err);
  }
}
