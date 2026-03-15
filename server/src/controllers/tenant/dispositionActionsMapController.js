import * as dispositionActionsMapService from '../../services/tenant/dispositionActionsMapService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { disposition_id } = req.query;
    
    if (!disposition_id) {
      return res.status(400).json({ error: 'disposition_id query parameter is required' });
    }
    
    const mappings = await dispositionActionsMapService.findAll(tenantId, disposition_id);
    res.json({ data: mappings });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { disposition_id, action_id, priority_order, email_template_id, whatsapp_template_id } = req.body;
    
    if (!disposition_id || !action_id) {
      return res.status(400).json({ error: 'disposition_id and action_id are required' });
    }
    
    const mapping = await dispositionActionsMapService.create(
      tenantId,
      { disposition_id, action_id, priority_order, email_template_id, whatsapp_template_id }
    );
    
    res.status(201).json({ data: mapping });
  } catch (err) {
    next(err);
  }
}

export async function updateTemplates(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { email_template_id, whatsapp_template_id } = req.body;
    
    const mapping = await dispositionActionsMapService.updateTemplates(
      tenantId,
      req.params.id,
      { email_template_id, whatsapp_template_id }
    );
    
    res.json({ data: mapping });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await dispositionActionsMapService.remove(tenantId, req.params.id);
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
    
    await dispositionActionsMapService.move(tenantId, req.params.id, direction, position);
    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    next(err);
  }
}
