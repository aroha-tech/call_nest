import fs from 'fs/promises';
import path from 'path';
import { query, withConnection } from '../../config/db.js';
import { env } from '../../config/env.js';
import { publishTenantRealtimeEvent } from '../../realtime/publishTenantRealtime.js';
import { getUserPermissions } from '../rbacService.js';

export const JOB_TYPES = {
  CONTACTS_IMPORT_CSV: 'contacts_import_csv',
  CONTACTS_EXPORT_CSV: 'contacts_export_csv',
  CONTACTS_BULK_ASSIGN: 'contacts_bulk_assign',
  CONTACTS_BULK_ADD_TAGS: 'contacts_bulk_add_tags',
  CONTACTS_BULK_REMOVE_TAGS: 'contacts_bulk_remove_tags',
  CONTACTS_BULK_DELETE: 'contacts_bulk_delete',
  EMAIL_CAMPAIGN_SEND: 'email_campaign_send',
};

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Absolute directory for this job's files: {dataDir}/{tenantId}/{jobId}
 */
export function jobArtifactDir(tenantId, jobId) {
  return path.join(env.backgroundJobDataDir, String(tenantId), String(jobId));
}

export async function ensureJobDir(tenantId, jobId) {
  const dir = jobArtifactDir(tenantId, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** In-memory CSV import: row is not claimable until buffer is registered (see enqueueImportCsv). */
export const JOB_STATUS_STAGING = 'staging';

export async function createJob(
  tenantId,
  userId,
  { jobType, payload = {}, artifactPath = null, initialStatus = 'pending' } = {}
) {
  const res = await query(
    `INSERT INTO tenant_background_jobs (
 tenant_id, job_type, status, payload_json, artifact_path, created_by, updated_by
     ) VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
    [
      tenantId,
      jobType,
      initialStatus,
      JSON.stringify(payload ?? {}),
      artifactPath,
      userId || null,
      userId || null,
    ]
  );
  return Number(res.insertId);
}

export async function getJobById(tenantId, jobId) {
  const [row] = await query(
    `SELECT *
 FROM tenant_background_jobs
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [jobId, tenantId]
  );
  return row || null;
}

/**
 * Soft-delete all terminal jobs for the tenant (completed / failed / cancelled).
 * Called from the Background jobs UI after the user has seen the list and refreshes or after the auto-refresh interval.
 */
export async function dismissTerminalBackgroundJobsForTenant(tenantId, deletedByUserId) {
  await query(
    `UPDATE tenant_background_jobs
     SET deleted_at = NOW(), deleted_by = ?
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND status IN ('completed', 'failed', 'cancelled')`,
    [deletedByUserId ?? null, tenantId]
  );
}

export async function listJobs(tenantId, { page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
  const limitNum = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM tenant_background_jobs WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tenantId]
  );
  const total = countRow?.total ?? 0;

  const rows = await query(
    `SELECT id, tenant_id, job_type, status, progress_percent, processed_count, total_count,
            current_step, result_json, error_message, artifact_path, created_by, created_at, started_at, finished_at,
            NULLIF(TRIM(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.export.type')),
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.list_filter.type')),
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.type'))
            )), '') AS record_type
     FROM tenant_background_jobs
     WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
    [tenantId]
  );

  return {
    data: rows,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  };
}

/**
 * Atomically claim the next pending job (MySQL 8+ InnoDB: FOR UPDATE SKIP LOCKED).
 * Safe for multiple API processes/workers claiming different rows in parallel.
 */
export async function claimNextPendingJob() {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute(
        `SELECT id, tenant_id, job_type, payload_json, created_by, artifact_path
         FROM tenant_background_jobs
         WHERE deleted_at IS NULL AND status = 'pending'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      if (!rows?.length) {
        await conn.commit();
        return null;
      }
      const row = rows[0];
      const [upd] = await conn.execute(
        `UPDATE tenant_background_jobs
         SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
         WHERE id = ? AND status = 'pending' AND deleted_at IS NULL`,
        [row.id]
      );
      await conn.commit();
      if (!upd || Number(upd.affectedRows ?? 0) !== 1) return null;
      return row;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

/** Same row shape as list APIs + record_type (for realtime / client merge). */
export async function getBackgroundJobRowForClient(tenantId, jobId) {
  const [row] = await query(
    `SELECT id, tenant_id, job_type, status, progress_percent, processed_count, total_count,
            current_step, result_json, error_message, artifact_path, created_by, created_at, started_at, finished_at,
            NULLIF(TRIM(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.export.type')),
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.list_filter.type')),
              JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.type'))
            )), '') AS record_type
     FROM tenant_background_jobs
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [jobId, tenantId]
  );
  return row || null;
}

export async function notifyBackgroundJobUpdated(tenantId, jobId) {
  try {
    const job = await getBackgroundJobRowForClient(tenantId, jobId);
    if (!job) return;
    await publishTenantRealtimeEvent(tenantId, 'background_job', { job });
  } catch (e) {
    console.error('[realtime] notifyBackgroundJobUpdated failed:', e?.message || e);
  }
}

export async function updateJobProgress(tenantId, jobId, { progressPercent, processed, total, step } = {}) {
  const sets = [];
  const params = [];
  if (progressPercent !== undefined) {
    sets.push('progress_percent = ?');
    params.push(Math.min(100, Math.max(0, Math.floor(Number(progressPercent)))));
  }
  if (processed !== undefined) {
    sets.push('processed_count = ?');
    params.push(Math.max(0, Math.floor(Number(processed))));
  }
  if (total !== undefined) {
    sets.push('total_count = ?');
    params.push(Math.max(0, Math.floor(Number(total))));
  }
  if (step !== undefined) {
    sets.push('current_step = ?');
    params.push(String(step).slice(0, 512));
  }
  if (sets.length === 0) return;
  params.push(jobId);
  await query(`UPDATE tenant_background_jobs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
  await notifyBackgroundJobUpdated(tenantId, jobId);
}

export async function completeJob(tenantId, jobId, { result = null, artifactPath = undefined } = {}) {
  const sets = [
    `status = 'completed'`,
    `progress_percent = 100`,
    `finished_at = NOW()`,
    `error_message = NULL`,
    `result_json = CAST(? AS JSON)`,
  ];
  const params = [JSON.stringify(result ?? {})];
  if (artifactPath !== undefined) {
    sets.push('artifact_path = ?');
    params.push(artifactPath);
  }
  params.push(jobId);
  await query(
    `UPDATE tenant_background_jobs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
    params
  );
  await notifyBackgroundJobUpdated(tenantId, jobId);
}

export async function failJob(tenantId, jobId, message) {
  await query(
    `UPDATE tenant_background_jobs
     SET status = 'failed', error_message = ?, finished_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [String(message || 'Job failed').slice(0, 65000), jobId]
  );
  await notifyBackgroundJobUpdated(tenantId, jobId);
}

/**
 * Request cancellation: pending jobs never start; running jobs stop at the next cooperative check.
 * Caller must enforce tenant + (creator or admin).
 */
export async function cancelJobByUser(tenantId, jobId) {
  const res = await query(
    `UPDATE tenant_background_jobs
     SET status = 'cancelled',
         error_message = ?,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
       AND status IN ('staging', 'pending', 'running')`,
    ['Cancelled by user', jobId, tenantId]
  );
  const n = Number(res?.affectedRows ?? 0);
  if (n !== 1) {
    const err = new Error('Job could not be cancelled. It may have already finished.');
    err.status = 409;
    throw err;
  }
  await notifyBackgroundJobUpdated(tenantId, jobId);
  return { ok: true };
}

export async function isJobCancelled(jobId) {
  const [row] = await query(
    `SELECT status FROM tenant_background_jobs WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [jobId]
  );
  return row?.status === 'cancelled';
}

export async function loadUserForBackgroundJob(tenantId, userId) {
  if (!userId) {
    const err = new Error('Job has no created_by user');
    err.status = 500;
    throw err;
  }
  const [row] = await query(
    `SELECT id, email, name, role, tenant_id, role_id, COALESCE(is_platform_admin, 0) AS is_platform_admin
     FROM users
     WHERE id = ? AND tenant_id = ? AND is_deleted = 0
     LIMIT 1`,
    [userId, tenantId]
  );
  if (!row) {
    const err = new Error('User for job not found');
    err.status = 500;
    throw err;
  }
  const isPlatformAdmin = Boolean(row.is_platform_admin);
  const permissions = isPlatformAdmin ? [] : await getUserPermissions(row.id, row.role_id);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    roleId: row.role_id ?? null,
    tenantId: Number(tenantId),
    isPlatformAdmin,
    permissions,
  };
}

export function parsePayload(row) {
  const raw = row?.payload_json;
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function isTerminalStatus(status) {
  return TERMINAL.has(String(status || ''));
}
