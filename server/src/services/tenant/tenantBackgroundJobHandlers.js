import fs from 'fs/promises';
import path from 'path';
import { takeBackgroundImportBuffer } from './backgroundImportBufferRegistry.js';
import * as contactsService from './contactsService.js';
import * as contactImportBatchService from './contactImportBatchService.js';
import {
  JOB_TYPES,
  completeJob,
  failJob,
  isJobCancelled,
  jobArtifactDir,
  loadUserForBackgroundJob,
  notifyBackgroundJobUpdated,
  parsePayload,
  updateJobProgress,
} from './tenantBackgroundJobService.js';

async function resolveJobContactIds(tenantId, user, payload) {
  if (Array.isArray(payload.contact_ids) && payload.contact_ids.length > 0) {
    return [
      ...new Set(payload.contact_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
    ];
  }
  if (payload.list_filter && typeof payload.list_filter === 'object') {
    return contactsService.listAllContactIdsForBulkJob(tenantId, user, payload.list_filter);
  }
  const err = new Error('Payload requires contact_ids or list_filter');
  err.status = 400;
  throw err;
}

/**
 * @param {{ id: number, tenant_id: number, job_type: string, payload_json?: unknown, created_by?: number }} jobRow
 */
export async function runTenantBackgroundJobRow(jobRow) {
  const tenantId = jobRow.tenant_id;
  const jobId = jobRow.id;
  const user = await loadUserForBackgroundJob(tenantId, jobRow.created_by);
  const payload = parsePayload(jobRow);

  try {
    await notifyBackgroundJobUpdated(tenantId, jobId);
    switch (jobRow.job_type) {
      case JOB_TYPES.CONTACTS_BULK_ADD_TAGS: {
        const ids = await resolveJobContactIds(tenantId, user, payload);
        const tag_ids = payload.tag_ids ?? payload.tagIds;
        if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
          const err = new Error('tag_ids required');
          err.status = 400;
          throw err;
        }
        const outer = 8000;
        for (let i = 0; i < ids.length; i += outer) {
          if (await isJobCancelled(jobId)) return;
          const part = ids.slice(i, i + outer);
          await contactsService.bulkAddTagsToContacts(
            tenantId,
            user,
            { contact_ids: part, tag_ids },
            { unlimited: true }
          );
          const done = Math.min(i + part.length, ids.length);
          await updateJobProgress(tenantId, jobId, {
            processed: done,
            total: ids.length,
            progressPercent: ids.length ? Math.floor((done / ids.length) * 100) : 100,
            step: 'add_tags',
          });
        }
        await completeJob(tenantId, jobId, { result: { contactsTouched: ids.length, tag_ids } });
        break;
      }

      case JOB_TYPES.CONTACTS_BULK_REMOVE_TAGS: {
        const ids = await resolveJobContactIds(tenantId, user, payload);
        const tag_ids = payload.tag_ids ?? payload.tagIds;
        if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
          const err = new Error('tag_ids required');
          err.status = 400;
          throw err;
        }
        let removedAssignments = 0;
        const outer = 8000;
        for (let i = 0; i < ids.length; i += outer) {
          if (await isJobCancelled(jobId)) return;
          const part = ids.slice(i, i + outer);
          const r = await contactsService.bulkRemoveTagsFromContacts(
            tenantId,
            user,
            { contact_ids: part, tag_ids },
            { unlimited: true }
          );
          removedAssignments += Number(r?.removedAssignmentCount ?? 0);
          const done = Math.min(i + part.length, ids.length);
          await updateJobProgress(tenantId, jobId, {
            processed: done,
            total: ids.length,
            progressPercent: ids.length ? Math.floor((done / ids.length) * 100) : 100,
            step: 'remove_tags',
          });
        }
        await completeJob(tenantId, jobId, {
          result: { contactsTouched: ids.length, removedAssignmentCount: removedAssignments },
        });
        break;
      }

      case JOB_TYPES.CONTACTS_BULK_DELETE: {
        const ids = await resolveJobContactIds(tenantId, user, payload);
        let deletedTotal = 0;
        const outer = 8000;
        for (let i = 0; i < ids.length; i += outer) {
          if (await isJobCancelled(jobId)) return;
          const part = ids.slice(i, i + outer);
          const r = await contactsService.softDeleteContactsBulk(part, tenantId, user, {
            deleted_source: payload.deleted_source || 'bulk_job',
            unlimited: true,
          });
          deletedTotal += Number(r?.deletedCount ?? 0);
          const done = Math.min(i + part.length, ids.length);
          await updateJobProgress(tenantId, jobId, {
            processed: done,
            total: ids.length,
            progressPercent: ids.length ? Math.floor((done / ids.length) * 100) : 100,
            step: 'delete',
          });
        }
        await completeJob(tenantId, jobId, { result: { deletedCount: deletedTotal } });
        break;
      }

      case JOB_TYPES.CONTACTS_BULK_ASSIGN: {
        const ids = await resolveJobContactIds(tenantId, user, payload);
        await updateJobProgress(tenantId, jobId, {
          total: ids.length,
          processed: 0,
          progressPercent: 0,
          step: 'assign',
        });
        const ASSIGN_CHUNK = 4000;
        let updatedSum = 0;
        for (let i = 0; i < ids.length; i += ASSIGN_CHUNK) {
          if (await isJobCancelled(jobId)) return;
          const part = ids.slice(i, i + ASSIGN_CHUNK);
          const result = await contactsService.assignContacts(tenantId, user, {
            contactIds: part,
            manager_id: payload.manager_id,
            assigned_user_id: payload.assigned_user_id,
            campaign_id: payload.campaign_id,
          });
          updatedSum += Number(result?.updatedCount ?? 0);
          const done = Math.min(i + part.length, ids.length);
          await updateJobProgress(tenantId, jobId, {
            total: ids.length,
            processed: done,
            progressPercent: ids.length ? Math.min(99, Math.floor((done / ids.length) * 100)) : 100,
            step: 'assign',
          });
        }
        await completeJob(tenantId, jobId, { result: { updatedCount: updatedSum } });
        break;
      }

      case JOB_TYPES.CONTACTS_IMPORT_CSV: {
        let buf;
        if (payload.memoryImport) {
          buf = takeBackgroundImportBuffer(jobId);
          if (!buf) {
            const err = new Error(
              'Import file is no longer in memory (API may have restarted). Please start the import again.'
            );
            err.status = 500;
            throw err;
          }
        } else {
          const inputPath = payload.inputPath || payload.input_path;
          if (!inputPath || typeof inputPath !== 'string') {
            const err = new Error('Import job missing inputPath');
            err.status = 500;
            throw err;
          }
          buf = await fs.readFile(inputPath);
        }
        await updateJobProgress(tenantId, jobId, {
          total: 0,
          processed: 0,
          step: 'starting',
          progressPercent: 0,
        });
        if (await isJobCancelled(jobId)) return;
        const result = await contactsService.importContactsCsv(tenantId, user, {
          buffer: buf,
          type: payload.type || 'lead',
          mode: payload.mode || 'skip',
          created_source: payload.created_source || 'import',
          defaultCountryCode: payload.defaultCountryCode || '+91',
          mapping: payload.mapping || null,
          originalFilename: payload.originalFilename || '',
          tagIds: payload.tagIds,
          importManagerId: payload.importManagerId,
          importAssignedUserId: payload.importAssignedUserId,
          skipImportRowLimit: true,
          cancelCheck: async () => isJobCancelled(jobId),
          onProgress: async ({ processed, total, step: rowStep }) => {
            if (await isJobCancelled(jobId)) {
              const err = new Error('Cancelled');
              err.code = 'JOB_CANCELLED';
              throw err;
            }
            await updateJobProgress(tenantId, jobId, {
              processed,
              total,
              progressPercent: total > 0 ? Math.min(99, Math.floor((processed / total) * 100)) : 0,
              step: rowStep || 'import',
            });
          },
        });
        try {
          await contactImportBatchService.insertContactImportBatch(tenantId, user?.id, {
            contactType: payload.type || 'lead',
            originalFilename: payload.originalFilename || null,
            mode: payload.mode || 'skip',
            defaultCountryCode: payload.defaultCountryCode || '+91',
            rowCount: result.rowCount ?? 0,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            failed: result.failed,
            errorSample: result.errors,
          });
        } catch (e) {
          console.error('background import history insert failed', e);
        }
        await updateJobProgress(tenantId, jobId, {
          total: result.rowCount ?? 0,
          processed: result.rowCount ?? 0,
          progressPercent: 100,
          step: 'import',
        });
        await completeJob(tenantId, jobId, { result });
        break;
      }

      case JOB_TYPES.CONTACTS_EXPORT_CSV: {
        const exportOpts = payload.export || payload.exportOpts || {};
        const dir = jobArtifactDir(tenantId, jobId);
        await fs.mkdir(dir, { recursive: true });
        const outPath = path.join(dir, `export-${jobId}.csv`);
        await updateJobProgress(tenantId, jobId, { total: 0, processed: 0, step: 'export', progressPercent: 0 });
        if (await isJobCancelled(jobId)) return;
        const { rowCount } = await contactsService.exportContactsCsvToJobFile(
          tenantId,
          user,
          exportOpts,
          outPath,
          async ({ processed, total, step }) => {
            await updateJobProgress(tenantId, jobId, {
              processed,
              total,
              progressPercent: total > 0 ? Math.min(99, Math.floor((processed / total) * 100)) : 0,
              step: step || 'export',
            });
          }
        );
        await updateJobProgress(tenantId, jobId, {
          total: rowCount,
          processed: rowCount,
          progressPercent: 100,
          step: 'export',
        });
        await completeJob(tenantId, jobId, { result: { rowCount }, artifactPath: outPath });
        break;
      }

      default: {
        const err = new Error(`Unknown job type: ${jobRow.job_type}`);
        err.status = 400;
        throw err;
      }
    }
  } catch (e) {
    if (await isJobCancelled(jobId)) return;
    if (e?.code === 'JOB_CANCELLED') return;
    await failJob(tenantId, jobId, e?.message || 'Job failed');
  }
}
