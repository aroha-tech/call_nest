import * as contactTemperatureMasterService from '../../services/superAdmin/contactTemperatureMasterService.js';

export async function getAll(req, res, next) {
  try {
    const { search = '', include_inactive, page = '1', limit = '20' } = req.query;

    const result = await contactTemperatureMasterService.findAll({
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
    const data = await contactTemperatureMasterService.findAllActive();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const temperature = await contactTemperatureMasterService.findById(req.params.id);
    if (!temperature) {
      return res.status(404).json({ error: 'Contact temperature not found' });
    }
    res.json({ data: temperature });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { name, code, priority_order, is_active } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ error: 'name and code are required' });
    }
    
    const temperature = await contactTemperatureMasterService.create(
      { name, code, priority_order, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: temperature });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { name, priority_order, is_active } = req.body;
    
    const temperature = await contactTemperatureMasterService.update(
      req.params.id,
      { name, priority_order, is_active },
      req.user.id
    );
    
    res.json({ data: temperature });
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const temperature = await contactTemperatureMasterService.toggleActive(req.params.id, req.user.id);
    res.json({ data: temperature });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await contactTemperatureMasterService.remove(req.params.id);
    res.json({ message: 'Contact temperature deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function move(req, res, next) {
  try {
    const { direction, position } = req.body;
    
    if (!direction && position === undefined) {
      return res.status(400).json({ error: 'direction or position is required' });
    }
    
    await contactTemperatureMasterService.move(req.params.id, direction, position);
    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    next(err);
  }
}
