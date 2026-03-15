import * as dialingSetsService from '../../services/tenant/dialingSetsService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const dialingSets = await dialingSetsService.findAll(tenantId, includeInactive);
    res.json({ data: dialingSets });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const dialingSet = await dialingSetsService.findById(tenantId, req.params.id);
    if (!dialingSet) {
      return res.status(404).json({ error: 'Dialing set not found' });
    }
    res.json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { name, description, is_default, is_active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const dialingSet = await dialingSetsService.create(
      tenantId,
      { name, description, is_default, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { name, description, is_default, is_active } = req.body;
    
    const dialingSet = await dialingSetsService.update(
      tenantId,
      req.params.id,
      { name, description, is_default, is_active },
      req.user.id
    );
    
    res.json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await dialingSetsService.remove(tenantId, req.params.id);
    res.json({ message: 'Dialing set deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function setDefault(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const dialingSet = await dialingSetsService.setDefault(tenantId, req.params.id);
    res.json({ data: dialingSet, message: 'Default dialing set updated' });
  } catch (err) {
    next(err);
  }
}
