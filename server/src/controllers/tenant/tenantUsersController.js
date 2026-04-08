import * as tenantUsersService from '../../services/tenant/tenantUsersService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const {
      search = '',
      include_disabled,
      page = '1',
      limit = '20',
      role,
      filter_manager_id,
    } = req.query;
    const roleFilter =
      role && ['admin', 'manager', 'agent'].includes(String(role)) ? String(role) : undefined;
    let filterManagerId;
    if (filter_manager_id === 'unassigned') {
      filterManagerId = 'unassigned';
    } else if (filter_manager_id != null && filter_manager_id !== '' && filter_manager_id !== '__all__') {
      filterManagerId = filter_manager_id;
    }
    const result = await tenantUsersService.findAll(tenantId, req.user, {
      search,
      includeDisabled: include_disabled === 'true',
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      role: roleFilter,
      filterManagerId,
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
    const user = await tenantUsersService.findById(req.params.id, tenantId, req.user);
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
    const user = await tenantUsersService.create(tenantId, req.user, {
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
    const { name, role, is_enabled, password, manager_id, agent_can_delete_leads, agent_can_delete_contacts } =
      req.body;
    const user = await tenantUsersService.update(req.params.id, tenantId, req.user, {
      name,
      role,
      is_enabled,
      password: password || undefined,
      manager_id: manager_id !== undefined ? manager_id : undefined,
      agent_can_delete_leads: agent_can_delete_leads !== undefined ? agent_can_delete_leads : undefined,
      agent_can_delete_contacts: agent_can_delete_contacts !== undefined ? agent_can_delete_contacts : undefined,
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}
