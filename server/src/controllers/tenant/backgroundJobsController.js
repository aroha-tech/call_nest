import fs from 'fs/promises';
import path from 'path';
import * as contactsService from '../../services/tenant/contactsService.js';
import {
  cancelJobByUser,
  createJob,
  dismissTerminalBackgroundJobsForTenant,
  getJobById,
  jobArtifactDir,
  JOB_STATUS_STAGING,
  JOB_TYPES,
  listJobs,
  notifyBackgroundJobUpdated,
} from '../../services/tenant/tenantBackgroundJobService.js';
import {
  discardBackgroundImportBuffer,
  stashBackgroundImportBuffer,
} from '../../services/tenant/backgroundImportBufferRegistry.js';
import { query } from '../../config/db.js';

/** Build list filter options for jobs from a plain object (same fields as contacts list-ids API). */
function listFilterOptionsFromObject(b) {
  if (!b || typeof b !== 'object') return null;
  const search = String(b.search ?? '');
  const type = b.type || undefined;
  const status_id = b.status_id;
  const touch_status = b.touch_status ? String(b.touch_status).trim().toLowerCase() : undefined;
  const min_call_count =
    b.min_call_count === undefined || b.min_call_count === null || String(b.min_call_count).trim() === ''
      ? undefined
      : Number(b.min_call_count);
  const max_call_count =
    b.max_call_count === undefined || b.max_call_count === null || String(b.max_call_count).trim() === ''
      ? undefined
      : Number(b.max_call_count);
  const last_called_after =
    b.last_called_after === undefined || b.last_called_after === null || String(b.last_called_after).trim() === ''
      ? undefined
      : String(b.last_called_after).trim();
  const last_called_before =
    b.last_called_before === undefined || b.last_called_before === null || String(b.last_called_before).trim() === ''
      ? undefined
      : String(b.last_called_before).trim();

  const parseContactListFilterParam = (raw) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
    const s = String(raw).trim().toLowerCase();
    if (s === 'unassigned') return 'unassigned';
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return n;
  };
  const parseFilterManagerIdsParam = (raw) => {
    if (raw === undefined || raw === null) return undefined;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return undefined;
      const ids = [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
      return ids.length ? ids : undefined;
    } catch {
      return undefined;
    }
  };
  const parseCampaignIdFilterParam = (raw) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
    const s = String(raw).trim().toLowerCase();
    if (s === 'none' || s === 'no_campaign') return 'none';
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return n;
  };
  const parseCampaignIdsFilterParam = (raw) => {
    if (raw === undefined || raw === null) return undefined;
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
  };
  const parseFilterTagIdsParam = (raw) => {
    if (raw === undefined || raw === null) return undefined;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return undefined;
      const ids = [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
      return ids.length ? ids : undefined;
    } catch {
      return undefined;
    }
  };
  const parseStatusIdsFilterParam = (raw) => {
    if (raw === undefined || raw === null) return undefined;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return undefined;
      const out = [];
      const seen = new Set();
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
  };

  const filterManagerId = parseContactListFilterParam(b.filter_manager_id);
  const filterAssignedUserId = parseContactListFilterParam(b.filter_assigned_user_id);
  const filterManagerIds = parseFilterManagerIdsParam(b.filter_manager_ids);
  const filterUnassignedManagers =
    b.filter_unassigned_managers === true ||
    b.filter_unassigned_managers === 1 ||
    String(b.filter_unassigned_managers || '').toLowerCase() === 'true';
  const campaignIdFilter = parseCampaignIdFilterParam(b.campaign_id);
  const campaignIdsFilter = parseCampaignIdsFilterParam(b.campaign_ids);
  const filterTagIds = parseFilterTagIdsParam(b.filter_tag_ids);
  const statusIdsFilter = parseStatusIdsFilterParam(b.status_ids);
  const columnFilters = contactsService.normalizeContactListColumnFilters(b.column_filters);

  return {
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
    filterUnassignedManagers: filterUnassignedManagers || undefined,
    campaignIdFilter,
    campaignIdsFilter,
    filterTagIds,
    columnFilters,
  };
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await listJobs(tenantId, { page, limit });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/** Soft-delete completed / failed / cancelled jobs for this tenant (Background jobs page refresh flow). */
export async function dismissFinished(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const uid = req.user?.id != null ? Number(req.user.id) : null;
    await dismissTerminalBackgroundJobsForTenant(tenantId, Number.isFinite(uid) ? uid : null);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const job = await getJobById(tenantId, Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ data: job });
  } catch (e) {
    next(e);
  }
}

export async function cancel(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId) || jobId < 1) {
      return res.status(400).json({ error: 'Invalid job id' });
    }
    const job = await getJobById(tenantId, jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const uid = Number(req.user?.id);
    const role = req.user?.role;
    const owner = job.created_by != null ? Number(job.created_by) : null;
    if (role !== 'admin') {
      if (owner == null || owner !== uid) {
        return res.status(403).json({ error: 'You can only cancel jobs you started' });
      }
    }
    await cancelJobByUser(tenantId, jobId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function download(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const job = await getJobById(tenantId, Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job is not completed' });
    }
    const artifactPath = job.artifact_path;
    if (!artifactPath) return res.status(404).json({ error: 'No file for this job' });
    const resolved = path.resolve(artifactPath);
    const base = path.resolve(jobArtifactDir(tenantId, job.id));
    if (!resolved.startsWith(base)) {
      return res.status(403).json({ error: 'Invalid artifact path' });
    }
    try {
      await fs.access(resolved);
    } catch {
      return res.status(404).json({ error: 'File missing' });
    }
    res.download(resolved, path.basename(resolved));
  } catch (e) {
    next(e);
  }
}

export async function enqueueImportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'CSV or Excel file is required (multipart field "file")' });
    }

    const {
      type = 'lead',
      mode = 'skip',
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

    const payload = {
      memoryImport: true,
      type,
      mode,
      created_source,
      defaultCountryCode: default_country_code,
      mapping: parsedMapping,
      originalFilename: file.originalname || '',
      tagIds: tagIdsOpt,
      importManagerId: import_manager_id_raw,
      importAssignedUserId: import_assigned_user_id_raw,
    };

    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_IMPORT_CSV,
      payload,
      initialStatus: JOB_STATUS_STAGING,
    });

    try {
      stashBackgroundImportBuffer(jobId, file.buffer);
      const upd = await query(
        `UPDATE tenant_background_jobs
         SET status = 'pending', updated_at = NOW(), updated_by = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL AND status = ?`,
        [req.user?.id || null, jobId, tenantId, JOB_STATUS_STAGING]
      );
      if (Number(upd?.affectedRows ?? 0) !== 1) {
        throw new Error('Import job could not be activated');
      }
    } catch (e) {
      discardBackgroundImportBuffer(jobId);
      const msg = String(e?.message || 'Import could not be queued').slice(0, 65000);
      await query(
        `UPDATE tenant_background_jobs
         SET status = 'failed',
             error_message = ?,
             finished_at = NOW(),
             updated_at = NOW(),
             updated_by = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [msg, req.user?.id || null, jobId, tenantId]
      );
      await notifyBackgroundJobUpdated(tenantId, jobId);
      return res.status(500).json({ error: 'Could not queue import. Please try again.' });
    }

    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}

export async function enqueueExportCsv(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const b = req.body || {};
    const lf = listFilterOptionsFromObject(b) || {};
    const exportOpts = {
      search: b.search ?? '',
      type: b.type || undefined,
      statusId: lf.statusId,
      statusIdsFilter: lf.statusIdsFilter,
      includeCustomFields: b.include_custom_fields !== '0' && b.include_custom_fields !== false && b.include_custom_fields !== 0,
      filterManagerId: lf.filterManagerId,
      filterAssignedUserId: lf.filterAssignedUserId,
      filterManagerIds: lf.filterManagerIds,
      filterUnassignedManagers: lf.filterUnassignedManagers,
      campaignIdFilter: lf.campaignIdFilter,
      campaignIdsFilter: lf.campaignIdsFilter,
      filterTagIds: lf.filterTagIds,
      minCallCount: lf.minCallCount,
      maxCallCount: lf.maxCallCount,
      lastCalledAfter: lf.lastCalledAfter,
      lastCalledBefore: lf.lastCalledBefore,
      touchStatus: lf.touchStatus,
      columnFilters: lf.columnFilters,
      exportScope: String(b.export_scope ?? 'filtered').toLowerCase() === 'selected' ? 'selected' : 'filtered',
      selectedIds: Array.isArray(b.selected_ids) ? b.selected_ids : Array.isArray(b.selectedIds) ? b.selectedIds : [],
      columnKeys: Array.isArray(b.columns) ? b.columns : Array.isArray(b.column_keys) ? b.column_keys : null,
    };

    if (exportOpts.exportScope === 'selected' && (!exportOpts.selectedIds || exportOpts.selectedIds.length === 0)) {
      return res.status(400).json({ error: 'selected_ids required when export_scope is selected' });
    }

    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_EXPORT_CSV,
      payload: { export: exportOpts },
    });

    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}

function bulkPayloadFromBody(b) {
  const contact_ids = b.contact_ids ?? b.contactIds;
  const list_filter = b.list_filter ?? b.listFilter;
  const out = {};
  if (Array.isArray(contact_ids) && contact_ids.length > 0) out.contact_ids = contact_ids;
  if (list_filter && typeof list_filter === 'object') {
    out.list_filter = listFilterOptionsFromObject(list_filter);
  }
  return out;
}

export async function enqueueBulkAddTags(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const b = req.body || {};
    const tag_ids = b.tag_ids ?? b.tagIds;
    if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
      return res.status(400).json({ error: 'tag_ids required' });
    }
    const payload = { ...bulkPayloadFromBody(b), tag_ids };
    if (!payload.contact_ids && !payload.list_filter) {
      return res.status(400).json({ error: 'contact_ids or list_filter required' });
    }
    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_BULK_ADD_TAGS,
      payload,
    });
    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}

export async function enqueueBulkRemoveTags(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const b = req.body || {};
    const tag_ids = b.tag_ids ?? b.tagIds;
    if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
      return res.status(400).json({ error: 'tag_ids required' });
    }
    const payload = { ...bulkPayloadFromBody(b), tag_ids };
    if (!payload.contact_ids && !payload.list_filter) {
      return res.status(400).json({ error: 'contact_ids or list_filter required' });
    }
    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_BULK_REMOVE_TAGS,
      payload,
    });
    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}

export async function enqueueBulkDelete(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const b = req.body || {};
    const payload = {
      ...bulkPayloadFromBody(b),
      deleted_source: b.deleted_source || 'bulk_job',
    };
    if (!payload.contact_ids && !payload.list_filter) {
      return res.status(400).json({ error: 'contact_ids or list_filter required' });
    }
    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_BULK_DELETE,
      payload,
    });
    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}

export async function enqueueBulkAssign(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const b = req.body || {};
    const payload = {
      ...bulkPayloadFromBody(b),
      manager_id: b.manager_id,
      assigned_user_id: b.assigned_user_id,
      campaign_id: b.campaign_id,
    };
    if (!payload.contact_ids && !payload.list_filter) {
      return res.status(400).json({ error: 'contact_ids or list_filter required' });
    }
    const jobId = await createJob(tenantId, req.user?.id, {
      jobType: JOB_TYPES.CONTACTS_BULK_ASSIGN,
      payload,
    });
    await notifyBackgroundJobUpdated(tenantId, jobId);
    res.status(202).json({ ok: true, jobId, status: 'pending' });
  } catch (e) {
    next(e);
  }
}
