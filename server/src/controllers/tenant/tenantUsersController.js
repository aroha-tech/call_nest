import * as tenantUsersService from '../../services/tenant/tenantUsersService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { search = '', include_disabled, page = '1', limit = '20' } = req.query;
    const result = await tenantUsersService.findAll(tenantId, {
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
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const user = await tenantUsersService.findById(req.params.id, tenantId);
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
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { email, password, name, role, manager_id } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password, and role are required' });
    }
    if (!['admin', 'manager', 'agent'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, manager, or agent' });
    }
    const user = await tenantUsersService.create(tenantId, {
      email: email.trim(),
      password,
      name: name?.trim() || null,
      role,
      manager_id: manager_id ?? null,
    });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { name, role, is_enabled, password, manager_id } = req.body;
    const user = await tenantUsersService.update(req.params.id, tenantId, {
      name,
      role,
      is_enabled,
      password: password || undefined,
      manager_id: manager_id !== undefined ? manager_id : undefined,
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}
