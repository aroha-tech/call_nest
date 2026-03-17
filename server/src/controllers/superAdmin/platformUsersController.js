import * as platformUsersService from '../../services/superAdmin/platformUsersService.js';

export async function getAll(req, res, next) {
  try {
    const {
      tenant_id,
      search = '',
      include_disabled,
      page = '1',
      limit = '20',
    } = req.query;

    const result = await platformUsersService.findAll({
      tenant_id: tenant_id || undefined,
      search,
      includeDisabled: include_disabled === 'true',
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
    const user = await platformUsersService.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { tenant_id, email, password, name, role } = req.body;
    if (!tenant_id || !email || !password || !role) {
      return res.status(400).json({ error: 'tenant_id, email, password, and role are required' });
    }
    const user = await platformUsersService.create({
      tenant_id,
      email,
      password,
      name: name || null,
      role,
    });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { name, role, is_enabled, unlock, password } = req.body;
    const user = await platformUsersService.update(req.params.id, {
      name,
      role,
      is_enabled,
      unlock: !!unlock,
      password: password || undefined,
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}
