import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Skeleton } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { backgroundJobsAPI } from '../services/backgroundJobsAPI';
import { axiosInstance, getStoredAccessToken } from '../services/axiosInstance';
import { connectTenantRealtimeSocket } from '../services/tenantRealtimeSocket';
import listStyles from '../components/admin/adminDataList.module.scss';
import importStyles from '../features/contacts/ContactImportPage.module.scss';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import {
  computeRawEtaSec,
  ETA_EMA,
  formatEtaDisplay,
  humanizeStepLabel,
  TERMINAL_JOB_STATUSES,
} from '../utils/backgroundJobEta';
import pageStyles from './BackgroundJobsPage.module.scss';

/** After this interval, finished rows are soft-deleted server-side and the list reloads (user has had time to see them). */
const BACKGROUND_JOBS_DISMISS_POLL_MS = 90000;

const JOB_LABEL = {
  contacts_import_csv: 'Import CSV',
  contacts_export_csv: 'Export CSV',
  contacts_bulk_assign: 'Bulk assign',
  contacts_bulk_add_tags: 'Bulk add tags',
  contacts_bulk_remove_tags: 'Bulk remove tags',
  contacts_bulk_delete: 'Bulk delete',
};

function recordKindLabel(recordType) {
  const t = String(recordType || '').toLowerCase();
  if (t === 'lead') return 'Leads';
  if (t === 'contact') return 'Contacts';
  return null;
}

function jobLabel(row) {
  const type = row?.job_type;
  const kind = recordKindLabel(row?.record_type);
  if (type === 'contacts_import_csv') return kind ? `${kind} import (CSV)` : JOB_LABEL[type] || type;
  if (type === 'contacts_export_csv') return kind ? `${kind} export (CSV)` : JOB_LABEL[type] || type;
  if (type === 'contacts_bulk_assign') return kind ? `${kind}: bulk assign` : JOB_LABEL[type] || type;
  if (type === 'contacts_bulk_add_tags') return kind ? `${kind}: bulk add tags` : JOB_LABEL[type] || type;
  if (type === 'contacts_bulk_remove_tags') return kind ? `${kind}: bulk remove tags` : JOB_LABEL[type] || type;
  if (type === 'contacts_bulk_delete') return kind ? `${kind}: bulk delete` : JOB_LABEL[type] || type;
  return JOB_LABEL[type] || type || '—';
}

/** Brief server-side state while the import file is bound to the job (not shown as raw `staging` in UI). */
function displayJobStatus(status) {
  const s = String(status || '');
  if (s === 'staging') return 'pending';
  return s;
}

/** Merge one job row from realtime into the current list response (same shape as list API). */
function mergeJobIntoListPayload(prev, job, page, limit) {
  if (!prev || !Array.isArray(prev.data) || !job) return prev;
  const jid = Number(job.id);
  if (!Number.isFinite(jid)) return prev;
  const data = [...prev.data];
  const ix = data.findIndex((r) => Number(r.id) === jid);
  if (ix >= 0) {
    data[ix] = { ...data[ix], ...job };
    return { ...prev, data };
  }
  if (page === 1) {
    const next = [job, ...data];
    if (next.length > limit) next.pop();
    return {
      ...prev,
      data: next,
      total: Number(prev.total ?? 0) + 1,
    };
  }
  return {
    ...prev,
    total: Number(prev.total ?? 0) + 1,
  };
}

function BackgroundJobTableRow({
  r,
  formatDateTime,
  onDownload,
  downloadingId,
  onStop,
  stopLoadingId,
}) {
  const etaSamplesRef = useRef([]);
  const etaSmoothedRef = useRef(null);

  useEffect(() => {
    etaSamplesRef.current = [];
    etaSmoothedRef.current = null;
  }, [r.id]);

  const statusStr = String(r.status || '');
  const isTerminal = TERMINAL_JOB_STATUSES.has(statusStr);
  const isRunning = statusStr === 'running';
  const isPreparing =
    statusStr === 'staging' ||
    statusStr === 'pending' ||
    (!isTerminal && statusStr !== 'running');

  const total = Number(r.total_count ?? 0);
  const processed = Number(r.processed_count ?? 0);
  const progressPct = Number(r.progress_percent ?? 0);

  const barPct = useMemo(() => {
    if (isPreparing) return null;
    if (total > 0) return Math.min(100, Math.floor((processed / total) * 100));
    return Math.min(100, progressPct);
  }, [isPreparing, total, processed, progressPct]);

  const caption = useMemo(() => {
    if (isPreparing) return 'Starting…';
    if (isRunning) {
      if (total > 0) {
        const p = Math.min(100, Math.floor((processed / total) * 100));
        return `${processed.toLocaleString()} / ${total.toLocaleString()} (${p}%)`;
      }
      return `${progressPct}%`;
    }
    if (total > 0) return `${processed.toLocaleString()} / ${total.toLocaleString()} — done`;
    return `${progressPct}%`;
  }, [isPreparing, isRunning, total, processed, progressPct]);

  const etaLine = useMemo(() => {
    if (!isRunning || total <= 0 || processed <= 0 || processed >= total) {
      return { primary: null, hint: null };
    }
    if (processed > 0) {
      const now = Date.now();
      const arr = etaSamplesRef.current;
      const last = arr[arr.length - 1];
      if (!last || last.p !== processed) {
        arr.push({ t: now, p: processed });
        if (arr.length > 24) arr.shift();
      }
    }
    const raw = computeRawEtaSec(total, processed, etaSamplesRef.current);
    if (raw == null) {
      return {
        primary: null,
        hint: 'Time estimate will appear after a short stretch of steady progress.',
      };
    }
    const prev = etaSmoothedRef.current;
    if (prev == null || !Number.isFinite(prev)) {
      etaSmoothedRef.current = raw;
    } else {
      etaSmoothedRef.current = prev * (1 - ETA_EMA) + raw * ETA_EMA;
    }
    const jt = String(r.job_type || '');
    const hint =
      jt === 'contacts_import_csv'
        ? 'Rough estimate — import speed can vary by row size and server load.'
        : 'Rough estimate — speed depends on how many records are affected and server load.';
    return { primary: formatEtaDisplay(etaSmoothedRef.current), hint };
  }, [isRunning, total, processed, r.job_type]);

  const stepHuman = r.current_step ? humanizeStepLabel(r.current_step) : null;
  const canStop = statusStr === 'staging' || statusStr === 'pending' || statusStr === 'running';

  return (
    <tr>
      <td>{r.id}</td>
      <td>{jobLabel(r)}</td>
      <td>{displayJobStatus(r.status)}</td>
      <td className={pageStyles.progressCell}>
        <div
          className={`${pageStyles.progressTrack} ${isPreparing ? pageStyles.progressTrackIndeterminate : ''}`.trim()}
        >
          <div
            className={pageStyles.progressFill}
            style={isPreparing || barPct == null ? undefined : { width: `${barPct}%` }}
          />
        </div>
        <div className={pageStyles.progressCaption}>{caption}</div>
        {isRunning && stepHuman ? <div className={pageStyles.progressStep}>{stepHuman}</div> : null}
        {isRunning && etaLine.primary ? <div className={pageStyles.eta}>{etaLine.primary}</div> : null}
        {isRunning && etaLine.hint ? <div className={pageStyles.etaHint}>{etaLine.hint}</div> : null}
      </td>
      <td>{r.created_at ? formatDateTime(r.created_at) : '—'}</td>
      <td>{r.finished_at ? formatDateTime(r.finished_at) : '—'}</td>
      <td className={pageStyles.actionsCell}>
        <div className={pageStyles.actionsStack}>
          {canStop ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={stopLoadingId === r.id}
              disabled={stopLoadingId != null && stopLoadingId !== r.id}
              onClick={() => onStop(r.id)}
            >
              End
            </Button>
          ) : null}
          {r.status === 'completed' && r.job_type === 'contacts_export_csv' && r.artifact_path ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={downloadingId === r.id}
              onClick={() => onDownload(r.id)}
            >
              {downloadingId === r.id ? 'Downloading…' : 'Download CSV'}
            </Button>
          ) : null}
          {r.status === 'failed' && r.error_message ? (
            <span style={{ color: 'var(--color-danger, #f87171)', fontSize: 12 }} title={r.error_message}>
              Error
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function BackgroundJobsPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [stopLoadingId, setStopLoadingId] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);

  const load = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const res = await backgroundJobsAPI.list({ page, limit });
        setPayload(res?.data || null);
        if (!silent) setError('');
      } catch (e) {
        if (!silent) {
          setError(e?.response?.data?.error || e?.message || 'Failed to load jobs');
          setPayload(null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, limit]
  );

  /** Clear completed / failed / cancelled from the list, then reload (Refresh button or 90s timer). */
  const dismissFinishedAndReload = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      try {
        await backgroundJobsAPI.dismissFinished();
      } catch (e) {
        if (!silent) {
          setError(e?.response?.data?.error || e?.message || 'Could not update the job list');
        }
        return;
      }
      await load(opts);
    },
    [load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      void dismissFinishedAndReload({ silent: true });
    }, BACKGROUND_JOBS_DISMISS_POLL_MS);
    return () => clearInterval(id);
  }, [dismissFinishedAndReload]);

  useEffect(() => {
    let cancelled = false;
    let disconnect = () => {};
    const connect = () => {
      disconnect();
      disconnect = connectTenantRealtimeSocket({
        getToken: getStoredAccessToken,
        onConnect: () => {
          if (!cancelled) setLiveConnected(true);
        },
        onDisconnect: () => {
          if (!cancelled) setLiveConnected(false);
        },
        onEvent: (event, data) => {
          if (event === 'background_job' && data && typeof data === 'object' && data.job) {
            setPayload((prev) => mergeJobIntoListPayload(prev, data.job, page, limit));
          }
        },
        onError: (err) => {
          if (cancelled) return;
          setLiveConnected(false);
          if (String(err?.message || '').includes('Authentication')) return;
        },
      });
    };
    connect();
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [page, limit]);

  const rows = payload?.data || [];
  const total = payload?.total ?? 0;
  const totalPages = payload?.totalPages ?? 1;

  const downloadExport = async (jobId) => {
    setDownloadingId(jobId);
    try {
      const res = await axiosInstance.get(`/api/tenant/background-jobs/${jobId}/download`, {
        responseType: 'blob',
      });
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e?.response?.data?.error || e?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const stopJob = async (jobId) => {
    setStopLoadingId(jobId);
    try {
      await backgroundJobsAPI.cancel(jobId);
      await load({ silent: true });
    } catch (e) {
      window.alert(e?.response?.data?.error || e?.message || 'Could not stop this task');
    } finally {
      setStopLoadingId(null);
    }
  };

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Background tasks"
        description="Background imports, exports, and bulk jobs with live progress. Finished rows clear on refresh—download exports before they drop off."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 13,
                color: liveConnected ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)',
              }}
              title="Live Socket.IO connection for tenant realtime updates"
            >
              {liveConnected ? '● Live updates' : '○ Connecting…'}
            </span>
            <Button variant="secondary" onClick={() => void dismissFinishedAndReload()} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={listStyles.tableCard}>
        {loading && rows.length === 0 ? (
          <div style={{ display: 'grid', gap: 10, padding: 16 }}>
            <Skeleton width="24%" height={14} />
            <Skeleton width="100%" height={40} />
            <Skeleton width="100%" height={40} />
            <Skeleton width="100%" height={40} />
          </div>
        ) : null}

        {!loading && rows.length === 0 ? (
          <div style={{ padding: 16 }}>
            No active background tasks right now. When something is running, it will appear here with progress and an
            optional time estimate.
          </div>
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className={importStyles.mappingScroll} style={{ maxHeight: 'none' }}>
              <table className={importStyles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Created</th>
                    <th>Finished</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <BackgroundJobTableRow
                      key={r.id}
                      r={r}
                      formatDateTime={formatDateTime}
                      onDownload={downloadExport}
                      downloadingId={downloadingId}
                      onStop={stopJob}
                      stopLoadingId={stopLoadingId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
          </>
        ) : null}
      </div>
    </div>
  );
}
