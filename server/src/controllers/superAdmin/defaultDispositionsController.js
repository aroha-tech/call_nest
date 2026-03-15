import * as defaultDispositionsService from '../../services/superAdmin/defaultDispositionsService.js';

export async function getAll(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const search = req.query.search ?? '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    let industryId;
    if (req.query.industry_id === 'null') {
      industryId = null;
    } else if (req.query.industry_id) {
      industryId = req.query.industry_id;
    } else {
      industryId = undefined;
    }
    const result = await defaultDispositionsService.findAllPaginated(industryId, {
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
    const disposition = await defaultDispositionsService.findById(req.params.id);
    if (!disposition) {
      return res.status(404).json({ error: 'Default disposition not found' });
    }
    res.json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const {
      industry_id,
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
    
    const disposition = await defaultDispositionsService.create(
      { industry_id: industry_id || null, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const {
      industry_id,
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
    
    const disposition = await defaultDispositionsService.update(
      req.params.id,
      { industry_id, dispo_type_id, contact_status_id, contact_temperature_id, name, code, next_action, is_connected, actions, is_active },
      req.user.id
    );
    
    res.json({ data: disposition });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await defaultDispositionsService.remove(req.params.id);
    res.json({ message: 'Default disposition deactivated successfully' });
  } catch (err) {
    next(err);
  }
}
