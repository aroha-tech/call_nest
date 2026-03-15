import * as defaultDispositionActionsMapService from '../../services/superAdmin/defaultDispositionActionsMapService.js';

export async function getAll(req, res, next) {
  try {
    const { disposition_id } = req.query;
    
    if (!disposition_id) {
      return res.status(400).json({ error: 'disposition_id query parameter is required' });
    }
    
    const mappings = await defaultDispositionActionsMapService.findAll(disposition_id);
    res.json({ data: mappings });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { default_disposition_id, action_id, priority_order } = req.body;
    
    if (!default_disposition_id || !action_id) {
      return res.status(400).json({ error: 'default_disposition_id and action_id are required' });
    }
    
    const mapping = await defaultDispositionActionsMapService.create(
      { default_disposition_id, action_id, priority_order }
    );
    
    res.status(201).json({ data: mapping });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await defaultDispositionActionsMapService.remove(req.params.id);
    res.json({ message: 'Mapping removed successfully' });
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
    
    await defaultDispositionActionsMapService.move(req.params.id, direction, position);
    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    next(err);
  }
}
