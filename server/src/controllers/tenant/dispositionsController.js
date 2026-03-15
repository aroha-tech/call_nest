import * as dispositionsService from '../../services/tenant/dispositionsService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const search = req.query.search ?? '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await dispositionsService.findAllPaginated(tenantId, {
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
    const disposition = await dispositionsService.findById(tenantId, req.params.id);
    if (!disposition) {
      return res.status(404).json({ error: 'Disposition not found' });
    }
    res.json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const {
      dispo_type_id,
      contact_status_id,
      contact_temperature_id,
      name,
      code,
      next_action,
      is_connected,
      actions,
      is_active
    } = req.body;
    
    if (!name || !code || !dispo_type_id) {
      return res.status(400).json({
        error: 'name, code, and dispo_type_id (type) are required'
      });
    }
    
    const disposition = await dispositionsService.create(
      tenantId,
      { dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const {
      dispo_type_id,
      contact_status_id,
      contact_temperature_id,
      name,
      code,
      next_action,
      is_connected,
      actions,
      is_active
    } = req.body;
    
    const disposition = await dispositionsService.update(
      tenantId,
      req.params.id,
      { dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, is_active },
      req.user.id
    );
    
    res.json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await dispositionsService.remove(tenantId, req.params.id);
    res.json({ message: 'Disposition deleted successfully' });
  } catch (err) {
    next(err);
  }
}
