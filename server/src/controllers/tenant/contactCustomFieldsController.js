import * as contactCustomFieldsService from '../../services/tenant/contactCustomFieldsService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const includeInactive = req.query.include_inactive === 'true';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const result = await contactCustomFieldsService.listCustomFields(tenantId, {
      includeInactive,
      page,
      limit,
    });

    res.json({ data: result.data, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { name, label, type, options, is_required } = req.body || {};

    if (!name || !String(name).trim() || !label || !String(label).trim() || !type) {
      return res.status(400).json({
        error: 'name, label, and type are required',
      });
    }

    const allowedTypes = [
      'text',
      'number',
      'date',
      'boolean',
      'select',
      'multiselect',
      'multiselect_dropdown',
    ];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${allowedTypes.join(', ')}` });
    }

    const field = await contactCustomFieldsService.createCustomField(tenantId, {
      name,
      label,
      type,
      options_json:
        type === 'select' || type === 'multiselect' || type === 'multiselect_dropdown' ? options ?? [] : null,
      is_required: !!is_required,
    });

    res.status(201).json({ data: field });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { label, type, options, is_required } = req.body || {};

    const payload = {};
    if (label !== undefined) payload.label = label;
    if (type !== undefined) payload.type = type;
    if (options !== undefined) payload.options_json = options;
    if (is_required !== undefined) payload.is_required = !!is_required;

    const field = await contactCustomFieldsService.updateCustomField(
      tenantId,
      req.params.id,
      payload
    );

    if (!field) return res.status(404).json({ error: 'Custom field not found' });
    res.json({ data: field });
  } catch (err) {
    next(err);
  }
}

export async function activate(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const field = await contactCustomFieldsService.setCustomFieldActive(
      tenantId,
      req.params.id,
      true
    );
    if (!field) return res.status(404).json({ error: 'Custom field not found' });
    res.json({ data: field });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const field = await contactCustomFieldsService.setCustomFieldActive(
      tenantId,
      req.params.id,
      false
    );
    if (!field) return res.status(404).json({ error: 'Custom field not found' });
    res.json({ data: field });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    await contactCustomFieldsService.deleteCustomField(tenantId, req.params.id);
    res.json({ message: 'Custom field deleted' });
  } catch (err) {
    next(err);
  }
}

