import * as dialingSetDispositionsService from '../../services/tenant/dialingSetDispositionsService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { dialing_set_id } = req.query;
    
    if (!dialing_set_id) {
      return res.status(400).json({ error: 'dialing_set_id query parameter is required' });
    }
    
    const mappings = await dialingSetDispositionsService.findAll(tenantId, dialing_set_id);
    res.json({ data: mappings });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { dialing_set_id, disposition_id, order_index } = req.body;
    
    if (!dialing_set_id || !disposition_id) {
      return res.status(400).json({ error: 'dialing_set_id and disposition_id are required' });
    }
    
    const mapping = await dialingSetDispositionsService.create(
      tenantId,
      { dialing_set_id, disposition_id, order_index }
    );
    
    res.status(201).json({ data: mapping });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await dialingSetDispositionsService.remove(tenantId, req.params.id);
    res.json({ message: 'Mapping removed successfully' });
  } catch (err) {
    next(err);
  }
}

export async function move(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { direction, position } = req.body;
    
    if (!direction && position === undefined) {
      return res.status(400).json({ error: 'direction or position is required' });
    }
    
    await dialingSetDispositionsService.move(tenantId, req.params.id, direction, position);
    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    next(err);
  }
}
