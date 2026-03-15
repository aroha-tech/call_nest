import * as defaultDialingSetDispositionsService from '../../services/superAdmin/defaultDialingSetDispositionsService.js';

export async function getAll(req, res, next) {
  try {
    const { dialing_set_id } = req.query;
    
    if (!dialing_set_id) {
      return res.status(400).json({ error: 'dialing_set_id query parameter is required' });
    }
    
    const mappings = await defaultDialingSetDispositionsService.findAll(dialing_set_id);
    res.json({ data: mappings });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { default_dialing_set_id, default_disposition_id, order_index } = req.body;
    
    if (!default_dialing_set_id || !default_disposition_id) {
      return res.status(400).json({ error: 'default_dialing_set_id and default_disposition_id are required' });
    }
    
    const mapping = await defaultDialingSetDispositionsService.create(
      { default_dialing_set_id, default_disposition_id, order_index }
    );
    
    res.status(201).json({ data: mapping });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await defaultDialingSetDispositionsService.remove(req.params.id);
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
    
    await defaultDialingSetDispositionsService.move(req.params.id, direction, position);
    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    next(err);
  }
}
