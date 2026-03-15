import * as dispoActionsMasterService from '../../services/superAdmin/dispoActionsMasterService.js';

export async function getAll(req, res, next) {
  try {
    const { search = '', include_inactive, page = '1', limit = '20' } = req.query;

    const result = await dispoActionsMasterService.findAll({
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
    const data = await dispoActionsMasterService.findAllActive();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const action = await dispoActionsMasterService.findById(req.params.id);
    if (!action) {
      return res.status(404).json({ error: 'Disposition action not found' });
    }
    res.json({ data: action });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { name, code, description, is_active } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ error: 'name and code are required' });
    }
    
    const action = await dispoActionsMasterService.create(
      { name, code, description, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: action });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { name, description, is_active } = req.body;
    
    const action = await dispoActionsMasterService.update(
      req.params.id,
      { name, description, is_active },
      req.user.id
    );
    
    res.json({ data: action });
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const action = await dispoActionsMasterService.toggleActive(req.params.id, req.user.id);
    res.json({ data: action });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await dispoActionsMasterService.remove(req.params.id);
    res.json({ message: 'Disposition action deleted successfully' });
  } catch (err) {
    next(err);
  }
}
