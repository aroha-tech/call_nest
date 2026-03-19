import * as contactsService from '../../services/tenant/contactsService.js';
import * as contactCustomFieldsService from '../../services/tenant/contactCustomFieldsService.js';

/** Query: omit / empty = no filter; unassigned = pool / no agent; else positive int user id */
function parseContactListFilterParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === 'unassigned') return 'unassigned';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    const err = new Error('Invalid filter_manager_id or filter_assigned_user_id');
    err.status = 400;
    throw err;
  }
  return n;
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { search = '', page = '1', limit = '20', type, status_id } = req.query;

    const filterManagerId = parseContactListFilterParam(req.query.filter_manager_id);
    const filterAssignedUserId = parseContactListFilterParam(req.query.filter_assigned_user_id);

    const result = await contactsService.listContacts(tenantId, req.user, {
      search,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      type: type || undefined,
      statusId: status_id || undefined,
      filterManagerId,
      filterAssignedUserId,
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

    const contact = await contactsService.getContactById(req.params.id, tenantId, req.user);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ data: contact });
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

    const { first_name, email, display_name } = req.body || {};

    // Validation:
    // - display_name is always required
    // - either first_name OR email must be provided
    if (!display_name || !String(display_name).trim()) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    if (!first_name && !email) {
      return res.status(400).json({ error: 'Either first_name or email is required' });
    }

    const contact = await contactsService.createContact(tenantId, req.user, req.body || {});
    res.status(201).json({ data: contact });
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

    const payload = req.body || {};
    const { first_name, email, display_name } = payload;

    // If any of these fields are being changed, enforce the same rules:
    // - display_name cannot be empty if provided
    // - at least one of first_name or email must be present in final data
    if (display_name !== undefined && !String(display_name).trim()) {
      return res.status(400).json({ error: 'display_name cannot be empty' });
    }

    // For simplicity, when client wants to clear both first_name and email,
    // they must still satisfy "either first_name or email" rule.
    if (first_name === '' && !email) {
      return res.status(400).json({ error: 'Either first_name or email is required' });
    }

    const contact = await contactsService.updateContact(
      req.params.id,
      tenantId,
      req.user,
      payload
    );

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ data: contact });
  } catch (err) {
    next(err);
  }
}

export async function assign(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const result = await contactsService.assignContacts(
      tenantId,
      req.user,
      req.body || {}
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listCustomFields(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const fields = await contactCustomFieldsService.listActiveCustomFields(tenantId);
    res.json({ data: fields });
  } catch (err) {
    next(err);
  }
}

export async function listContactCustomFields(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const contactId = req.params.id;
    const fields = await contactCustomFieldsService.listContactCustomFieldValues(tenantId, contactId, req.user);
    res.json({ data: fields });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const result = await contactsService.softDeleteContact(
      req.params.id,
      tenantId,
      req.user,
      { deleted_source: req.body?.deleted_source || 'manual' }
    );

    if (!result) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function exportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { search = '', type, status_id, include_custom_fields = '1' } = req.query;

    const filterManagerId = parseContactListFilterParam(req.query.filter_manager_id);
    const filterAssignedUserId = parseContactListFilterParam(req.query.filter_assigned_user_id);

    const csv = await contactsService.exportContactsCsv(tenantId, req.user, {
      search,
      type: type || undefined,
      statusId: status_id || undefined,
      includeCustomFields: include_custom_fields !== '0',
      filterManagerId,
      filterAssignedUserId,
    });

    const filename = `${type === 'contact' ? 'contacts' : type === 'lead' ? 'leads' : 'contacts'}_export_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

export async function previewImportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'CSV file is required (multipart field "file")' });
    }

    const preview = await contactsService.previewContactsImportCsv(tenantId, {
      buffer: file.buffer,
    });

    res.json(preview);
  } catch (err) {
    next(err);
  }
}

export async function importCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'CSV file is required (multipart field "file")' });
    }

    const {
      type = 'lead',
      mode = 'skip', // skip | update
      created_source = 'import',
      default_country_code = '+91',
      mapping,
    } = req.body || {};

    let parsedMapping = undefined;
    if (mapping) {
      try {
        parsedMapping = JSON.parse(mapping);
      } catch {
        return res.status(400).json({ error: 'Invalid mapping JSON' });
      }
    }

    const result = await contactsService.importContactsCsv(tenantId, req.user, {
      buffer: file.buffer,
      type,
      mode,
      created_source,
      defaultCountryCode: default_country_code,
      mapping: parsedMapping,
    });

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

