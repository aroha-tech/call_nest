import * as contactsService from '../../services/tenant/contactsService.js';
import * as contactActivityService from '../../services/tenant/contactActivityService.js';
import * as contactCustomFieldsService from '../../services/tenant/contactCustomFieldsService.js';
import * as contactImportBatchService from '../../services/tenant/contactImportBatchService.js';

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

/** JSON array of manager user ids (admin multi-select). */
function parseFilterManagerIdsParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return undefined;
    const ids = [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    return ids.length ? ids : undefined;
  } catch {
    return undefined;
  }
}

function parseFilterUnassignedManagersParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/** campaign_id query: omit = no filter; none | no_campaign = contacts with no campaign; else numeric id */
function parseCampaignIdFilterParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === 'none' || s === 'no_campaign') return 'none';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    const err = new Error('Invalid campaign_id filter');
    err.status = 400;
    throw err;
  }
  return n;
}

/** JSON array: campaign ids and/or "none" for no campaign. When present, overrides single campaign_id. */
function parseCampaignIdsFilterParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return undefined;
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const s = String(x).trim().toLowerCase();
      if (s === 'none' || s === 'no_campaign') {
        if (!seen.has('none')) {
          seen.add('none');
          out.push('none');
        }
        continue;
      }
      const n = parseInt(x, 10);
      if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** JSON array of tag ids — contact must have all tags (AND). */
function parseFilterTagIdsParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return undefined;
    const ids = [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    return ids.length ? ids : undefined;
  } catch {
    return undefined;
  }
}

/** JSON array: status master ids and/or "none" for no status. When present, overrides single status_id. */
function parseStatusIdsFilterParam(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return undefined;
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const s = String(x).trim().toLowerCase();
      if (s === 'none' || s === 'no_status') {
        if (!seen.has('none')) {
          seen.add('none');
          out.push('none');
        }
        continue;
      }
      const n = parseInt(x, 10);
      if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

const CONTACT_LIST_SORT_KEYS = new Set([
  'display_name',
  'primary_phone',
  'email',
  'tag_names',
  'campaign_name',
  'type',
  'manager_name',
  'assigned_user_name',
  'status_name',
  'source',
  'city',
  'company',
  'website',
  'job_title',
  'industry',
  'state',
  'country',
  'pin_code',
  'address',
  'address_line_2',
  'tax_id',
  'date_of_birth',
  'created_at',
]);

function parseContactListSort(reqQuery) {
  const raw = reqQuery.sort_by ?? reqQuery.sortBy;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { sortBy: undefined, sortDir: undefined };
  }
  const sortBy = String(raw).trim();
  if (!CONTACT_LIST_SORT_KEYS.has(sortBy)) {
    const err = new Error('Invalid sort_by');
    err.status = 400;
    throw err;
  }
  const dirRaw = String(reqQuery.sort_dir ?? reqQuery.sortDir ?? 'desc').toLowerCase();
  const sortDir = dirRaw === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortDir };
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { search = '', page = '1', limit = '20', type, status_id } = req.query;
    const touch_status = req.query.touch_status ? String(req.query.touch_status).trim().toLowerCase() : undefined;
    const min_call_count =
      req.query.min_call_count === undefined || req.query.min_call_count === null || String(req.query.min_call_count).trim() === ''
        ? undefined
        : Number(req.query.min_call_count);
    const max_call_count =
      req.query.max_call_count === undefined || req.query.max_call_count === null || String(req.query.max_call_count).trim() === ''
        ? undefined
        : Number(req.query.max_call_count);
    const last_called_after =
      req.query.last_called_after === undefined || req.query.last_called_after === null || String(req.query.last_called_after).trim() === ''
        ? undefined
        : String(req.query.last_called_after).trim();
    const last_called_before =
      req.query.last_called_before === undefined || req.query.last_called_before === null || String(req.query.last_called_before).trim() === ''
        ? undefined
        : String(req.query.last_called_before).trim();

    const filterManagerId = parseContactListFilterParam(req.query.filter_manager_id);
    const filterAssignedUserId = parseContactListFilterParam(req.query.filter_assigned_user_id);
    const filterManagerIds = parseFilterManagerIdsParam(req.query.filter_manager_ids);
    const filterUnassignedManagers = parseFilterUnassignedManagersParam(req.query.filter_unassigned_managers);
    const campaignIdFilter = parseCampaignIdFilterParam(req.query.campaign_id);
    const campaignIdsFilter = parseCampaignIdsFilterParam(req.query.campaign_ids);
    const filterTagIds = parseFilterTagIdsParam(req.query.filter_tag_ids);
    const { sortBy, sortDir } = parseContactListSort(req.query);
    const columnFilters = contactsService.normalizeContactListColumnFilters(req.query.column_filters);

    const result = await contactsService.listContacts(tenantId, req.user, {
      search,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      type: type || undefined,
      statusId: status_id || undefined,
      touchStatus: touch_status || undefined,
      minCallCount: Number.isFinite(min_call_count) ? min_call_count : undefined,
      maxCallCount: Number.isFinite(max_call_count) ? max_call_count : undefined,
      lastCalledAfter: last_called_after || undefined,
      lastCalledBefore: last_called_before || undefined,
      filterManagerId,
      filterAssignedUserId,
      filterManagerIds,
      filterUnassignedManagers,
      campaignIdFilter,
      campaignIdsFilter,
      filterTagIds,
      sortBy,
      sortDir,
      columnFilters,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listIds(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { search = '', type, status_id } = req.query;
    const touch_status = req.query.touch_status ? String(req.query.touch_status).trim().toLowerCase() : undefined;
    const min_call_count =
      req.query.min_call_count === undefined || req.query.min_call_count === null || String(req.query.min_call_count).trim() === ''
        ? undefined
        : Number(req.query.min_call_count);
    const max_call_count =
      req.query.max_call_count === undefined || req.query.max_call_count === null || String(req.query.max_call_count).trim() === ''
        ? undefined
        : Number(req.query.max_call_count);
    const last_called_after =
      req.query.last_called_after === undefined || req.query.last_called_after === null || String(req.query.last_called_after).trim() === ''
        ? undefined
        : String(req.query.last_called_after).trim();
    const last_called_before =
      req.query.last_called_before === undefined || req.query.last_called_before === null || String(req.query.last_called_before).trim() === ''
        ? undefined
        : String(req.query.last_called_before).trim();

    const filterManagerId = parseContactListFilterParam(req.query.filter_manager_id);
    const filterAssignedUserId = parseContactListFilterParam(req.query.filter_assigned_user_id);
    const filterManagerIds = parseFilterManagerIdsParam(req.query.filter_manager_ids);
    const filterUnassignedManagers = parseFilterUnassignedManagersParam(req.query.filter_unassigned_managers);
    const campaignIdFilter = parseCampaignIdFilterParam(req.query.campaign_id);
    const campaignIdsFilter = parseCampaignIdsFilterParam(req.query.campaign_ids);
    const filterTagIds = parseFilterTagIdsParam(req.query.filter_tag_ids);
    const statusIdsFilter = parseStatusIdsFilterParam(req.query.status_ids);
    const columnFilters = contactsService.normalizeContactListColumnFilters(req.query.column_filters);

    const result = await contactsService.listContactIds(tenantId, req.user, {
      search,
      type: type || undefined,
      statusId: statusIdsFilter ? undefined : status_id || undefined,
      statusIdsFilter,
      touchStatus: touch_status || undefined,
      minCallCount: Number.isFinite(min_call_count) ? min_call_count : undefined,
      maxCallCount: Number.isFinite(max_call_count) ? max_call_count : undefined,
      lastCalledAfter: last_called_after || undefined,
      lastCalledBefore: last_called_before || undefined,
      filterManagerId,
      filterAssignedUserId,
      filterManagerIds,
      filterUnassignedManagers,
      campaignIdFilter,
      campaignIdsFilter,
      filterTagIds,
      columnFilters,
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

export async function getActivity(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const mode = String(req.query.mode || 'full').toLowerCase();
    if (mode === 'summary') {
      const data = await contactActivityService.getContactActivitySummary(tenantId, req.user, req.params.id);
      res.json({ data });
      return;
    }
    if (mode === 'timeline') {
      const limit = req.query.timeline_limit != null ? parseInt(req.query.timeline_limit, 10) : 10;
      const cursor =
        req.query.timeline_cursor != null && String(req.query.timeline_cursor).trim() !== ''
          ? String(req.query.timeline_cursor).trim()
          : null;
      const data = await contactActivityService.getContactActivityTimelinePage(tenantId, req.user, req.params.id, {
        limit: Number.isFinite(limit) ? limit : 10,
        cursor,
      });
      res.json({ data });
      return;
    }
    const data = await contactActivityService.getContactActivity(tenantId, req.user, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function appendPhone(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { phone, label } = req.body || {};
    const contact = await contactsService.appendContactPhone(tenantId, req.user, req.params.id, {
      phone,
      label,
    });
    res.status(201).json({ data: contact });
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

    const { email, display_name } = req.body || {};
    const phones = req.body?.phones;

    // Validation:
    // - display_name is always required
    // - either email OR at least one phone number must be provided
    if (!display_name || !String(display_name).trim()) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    const hasEmail = !!(email && String(email).trim());
    const hasPhone =
      Array.isArray(phones) && phones.some((p) => p?.phone && String(p.phone).trim());
    if (!hasEmail && !hasPhone) {
      return res.status(400).json({ error: 'Either email or at least one phone number is required' });
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
    const { display_name } = payload;

    // If any of these fields are being changed, enforce the same rules:
    // - display_name cannot be empty if provided
    // - final record must still have email or at least one phone (enforced in contactsService)
    if (display_name !== undefined && !String(display_name).trim()) {
      return res.status(400).json({ error: 'display_name cannot be empty' });
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

export async function leadPipelineSummary(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const data = await contactsService.getLeadPipelineSummary(tenantId, req.user);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function contactDashboardSummary(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const data = await contactsService.getContactDashboardSummary(tenantId, req.user);
    res.json({ data });
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

export async function bulkRemove(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    const result = await contactsService.softDeleteContactsBulk(ids, tenantId, req.user, {
      deleted_source: req.body?.deleted_source || 'manual',
    });
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function bulkAddTags(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const body = req.body || {};
    const contact_ids = body.contact_ids ?? body.contactIds;
    const tag_ids = body.tag_ids ?? body.tagIds;

    const result = await contactsService.bulkAddTagsToContacts(tenantId, req.user, {
      contact_ids,
      tag_ids,
    });
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function bulkRemoveTags(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const body = req.body || {};
    const contact_ids = body.contact_ids ?? body.contactIds;
    const tag_ids = body.tag_ids ?? body.tagIds;

    const result = await contactsService.bulkRemoveTagsFromContacts(tenantId, req.user, {
      contact_ids,
      tag_ids,
    });
    res.json({ ok: true, data: result });
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

/** POST body can carry export_scope / columns / ids; filters usually stay on the query string (same as GET /). */
function pickMergedBodyQuery(req, key) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const q = req.query || {};
  if (b[key] !== undefined && b[key] !== null && b[key] !== '') return b[key];
  if (q[key] !== undefined && q[key] !== null && q[key] !== '') return q[key];
  return undefined;
}

export async function exportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const q = req.query || {};

    const search = String(b.search ?? q.search ?? '');
    const type = b.type ?? q.type;
    const status_id = b.status_id ?? q.status_id;

    const touch_status = pickMergedBodyQuery(req, 'touch_status');
    const touchStatus = touch_status ? String(touch_status).trim().toLowerCase() : undefined;

    const minRaw = pickMergedBodyQuery(req, 'min_call_count');
    const maxRaw = pickMergedBodyQuery(req, 'max_call_count');
    const min_call_count =
      minRaw === undefined || minRaw === null || String(minRaw).trim() === '' ? undefined : Number(minRaw);
    const max_call_count =
      maxRaw === undefined || maxRaw === null || String(maxRaw).trim() === '' ? undefined : Number(maxRaw);

    const lacRaw = pickMergedBodyQuery(req, 'last_called_after');
    const lbcRaw = pickMergedBodyQuery(req, 'last_called_before');
    const last_called_after =
      lacRaw === undefined || lacRaw === null || String(lacRaw).trim() === '' ? undefined : String(lacRaw).trim();
    const last_called_before =
      lbcRaw === undefined || lbcRaw === null || String(lbcRaw).trim() === '' ? undefined : String(lbcRaw).trim();

    const filterManagerId = parseContactListFilterParam(pickMergedBodyQuery(req, 'filter_manager_id'));
    const filterAssignedUserId = parseContactListFilterParam(pickMergedBodyQuery(req, 'filter_assigned_user_id'));
    const filterManagerIds = parseFilterManagerIdsParam(pickMergedBodyQuery(req, 'filter_manager_ids'));
    const filterUnassignedManagers = parseFilterUnassignedManagersParam(pickMergedBodyQuery(req, 'filter_unassigned_managers'));
    const campaignIdFilter = parseCampaignIdFilterParam(pickMergedBodyQuery(req, 'campaign_id'));
    const campaignIdsFilter = parseCampaignIdsFilterParam(pickMergedBodyQuery(req, 'campaign_ids'));
    const filterTagIds = parseFilterTagIdsParam(pickMergedBodyQuery(req, 'filter_tag_ids'));
    const statusIdsFilter = parseStatusIdsFilterParam(pickMergedBodyQuery(req, 'status_ids'));

    const columnFilters = contactsService.normalizeContactListColumnFilters(
      pickMergedBodyQuery(req, 'column_filters')
    );

    const includeRaw = b.include_custom_fields ?? q.include_custom_fields ?? '1';
    const includeCustomFields = includeRaw !== '0' && includeRaw !== false && includeRaw !== 0;

    const export_scope_raw = String(b.export_scope ?? b.exportScope ?? q.export_scope ?? 'filtered').toLowerCase();
    const exportScope = export_scope_raw === 'selected' ? 'selected' : 'filtered';

    let selectedIds = [];
    const sd = b.selected_ids ?? b.selectedIds ?? q.selected_ids;
    if (Array.isArray(sd)) {
      selectedIds = sd;
    } else if (typeof sd === 'string' && sd.trim()) {
      try {
        const parsed = JSON.parse(sd);
        if (Array.isArray(parsed)) selectedIds = parsed;
      } catch {
        /* ignore */
      }
    }

    let columnKeys = null;
    const cols = b.columns ?? b.column_keys ?? q.columns;
    if (Array.isArray(cols) && cols.length > 0) {
      columnKeys = cols;
    } else if (typeof cols === 'string' && cols.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(cols);
        if (Array.isArray(parsed) && parsed.length > 0) columnKeys = parsed;
      } catch {
        /* ignore */
      }
    }

    const csv = await contactsService.exportContactsCsv(tenantId, req.user, {
      search,
      type: type || undefined,
      statusId: statusIdsFilter ? undefined : status_id || undefined,
      statusIdsFilter,
      includeCustomFields,
      filterManagerId,
      filterAssignedUserId,
      filterManagerIds,
      filterUnassignedManagers,
      campaignIdFilter,
      campaignIdsFilter,
      filterTagIds,
      touchStatus: touchStatus || undefined,
      minCallCount: Number.isFinite(min_call_count) ? min_call_count : undefined,
      maxCallCount: Number.isFinite(max_call_count) ? max_call_count : undefined,
      lastCalledAfter: last_called_after || undefined,
      lastCalledBefore: last_called_before || undefined,
      columnFilters,
      exportScope,
      selectedIds,
      columnKeys,
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
      return res.status(400).json({ error: 'CSV or Excel file is required (multipart field "file")' });
    }

    const preview = await contactsService.previewContactsImportCsv(tenantId, {
      buffer: file.buffer,
      originalFilename: file.originalname || '',
    });

    res.json(preview);
  } catch (err) {
    next(err);
  }
}

export async function previewResolvedImportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'CSV or Excel file is required (multipart field "file")' });
    }

    const {
      mode = 'skip',
      default_country_code = '+91',
      mapping,
      limit = '12',
      type: previewType = 'lead',
    } = req.body || {};

    let parsedMapping = undefined;
    if (mapping) {
      try {
        parsedMapping = JSON.parse(mapping);
      } catch {
        return res.status(400).json({ error: 'Invalid mapping JSON' });
      }
    }

    const data = await contactsService.previewResolvedContactsImportCsv(tenantId, {
      buffer: file.buffer,
      originalFilename: file.originalname || '',
      mapping: parsedMapping,
      defaultCountryCode: default_country_code,
      mode,
      limit: parseInt(limit, 10) || 12,
      type: previewType === 'contact' ? 'contact' : 'lead',
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listImportHistory(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { page = '1', limit = '20', type } = req.query;
    const result = await contactImportBatchService.listContactImportBatches(tenantId, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      contactType: type || undefined,
    });
    res.json(result);
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
      return res.status(400).json({ error: 'CSV or Excel file is required (multipart field "file")' });
    }

    const {
      type = 'lead',
      mode = 'skip', // skip | update
      created_source = 'import',
      default_country_code = '+91',
      mapping,
      tag_ids: tag_ids_raw,
      import_manager_id: import_manager_id_raw,
      import_assigned_user_id: import_assigned_user_id_raw,
    } = req.body || {};

    let parsedMapping = undefined;
    if (mapping) {
      try {
        parsedMapping = JSON.parse(mapping);
      } catch {
        return res.status(400).json({ error: 'Invalid mapping JSON' });
      }
    }

    let tagIdsOpt;
    if (tag_ids_raw !== undefined && tag_ids_raw !== null && String(tag_ids_raw).trim() !== '') {
      try {
        const p = JSON.parse(tag_ids_raw);
        tagIdsOpt = Array.isArray(p) ? p : undefined;
      } catch {
        return res.status(400).json({ error: 'Invalid tag_ids JSON' });
      }
    }

    const result = await contactsService.importContactsCsv(tenantId, req.user, {
      buffer: file.buffer,
      originalFilename: file.originalname || '',
      type,
      mode,
      created_source,
      defaultCountryCode: default_country_code,
      mapping: parsedMapping,
      tagIds: tagIdsOpt,
      importManagerId: import_manager_id_raw,
      importAssignedUserId: import_assigned_user_id_raw,
    });

    try {
      await contactImportBatchService.insertContactImportBatch(tenantId, req.user?.id, {
        contactType: type,
        originalFilename: file.originalname,
        mode,
        defaultCountryCode: default_country_code,
        rowCount: result.rowCount ?? 0,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        errorSample: result.errors,
      });
    } catch (e) {
      console.error('contact import history insert failed', e);
    }

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

