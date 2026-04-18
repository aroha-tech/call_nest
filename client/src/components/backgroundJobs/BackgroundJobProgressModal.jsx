import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import { backgroundJobsAPI } from '../../services/backgroundJobsAPI';
import { getStoredAccessToken } from '../../services/axiosInstance';
import { connectTenantRealtimeSocket } from '../../services/tenantRealtimeSocket';
import styles from './BackgroundJobProgressModal.module.scss';
import {
  computeRawEtaSec,
  ETA_EMA,
  formatEtaDisplay,
  humanizeStepLabel,
  TERMINAL_JOB_STATUSES,
} from '../../utils/backgroundJobEta';

const TERMINAL = TERMINAL_JOB_STATUSES;
const POLL_MS = 5000;

function normalizeJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: Number(raw.id),
    status: raw.status,
    progressPercent: Math.min(100, Math.max(0, Number(raw.progress_percent ?? raw.progressPercent ?? 0))),
    processedCount: Math.max(0, Number(raw.processed_count ?? raw.processedCount ?? 0)),
    totalCount: Math.max(0, Number(raw.total_count ?? raw.totalCount ?? 0)),
    currentStep: raw.current_step ?? raw.currentStep ?? '',
    errorMessage: raw.error_message ?? raw.errorMessage ?? '',
    jobType: raw.job_type ?? raw.jobType ?? '',
    startedAt: raw.started_at ?? raw.startedAt ?? null,
  };
}

function successMessageForJobType(jobType) {
  switch (String(jobType || '')) {
    case 'contacts_bulk_delete':
      return 'The selected records have been removed. When you go back, the list will show the latest data.';
    case 'contacts_bulk_assign':
      return 'Your changes are saved. Return to the list to see the updated assignments.';
    case 'contacts_bulk_add_tags':
    case 'contacts_bulk_remove_tags':
      return 'Tags are updated for the records you selected.';
    case 'contacts_import_csv':
      return 'Import finished. New and updated records are available in your workspace.';
    case 'contacts_export_csv':
      return 'Your export is ready. You can download the file from Background tasks.';
    default:
      return 'Everything completed successfully. You can return to your list or stay on Background tasks.';
  }
}

/**
 * Live progress for a single tenant background job (Socket.IO + light polling).
 * Replaces browser confirm/alert after enqueueing bulk work or large imports.
 * @param {(info: { jobId: number, status: string, jobType?: string }) => void} [onJobFinished] — fired once when the job reaches completed / failed / cancelled (e.g. refetch list).
 */
export function BackgroundJobProgressModal({
  isOpen,
  onClose,
  jobId,
  title,
  description,
  returnToPath = '/',
  returnToLabel = 'Back to list',
  backgroundJobsPath = '/settings/background-jobs',
  onJobFinished,
}) {
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [initialLoading, setInitialLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const jid = jobId != null ? Number(jobId) : NaN;
  const terminalNotifyDoneRef = useRef(false);
  const etaSamplesRef = useRef([]);
  const etaSmoothedRef = useRef(null);
  const etaJidRef = useRef(null);

  const applyJobPayload = useCallback((raw) => {
    const n = normalizeJob(raw);
    if (n && Number.isFinite(jid) && n.id === jid) setJob(n);
  }, [jid]);

  const fetchJob = useCallback(async () => {
    if (!Number.isFinite(jid)) return;
    try {
      const res = await backgroundJobsAPI.get(jid);
      applyJobPayload(res?.data?.data);
      setLoadError('');
    } catch (e) {
      setLoadError(e?.response?.data?.error || e?.message || 'Failed to load job');
    }
  }, [jid, applyJobPayload]);

  useEffect(() => {
    if (!isOpen || !Number.isFinite(jid)) {
      setJob(null);
      setLoadError('');
      setInitialLoading(false);
      setCancelLoading(false);
      setCancelError('');
      return;
    }
    terminalNotifyDoneRef.current = false;
    etaSamplesRef.current = [];
    etaSmoothedRef.current = null;
    etaJidRef.current = jid;
    setInitialLoading(true);
    setJob(null);
    setLoadError('');
    setCancelError('');
    void (async () => {
      await fetchJob();
      setInitialLoading(false);
    })();
  }, [isOpen, jid, fetchJob]);

  useEffect(() => {
    if (!isOpen || !Number.isFinite(jid) || !job || terminalNotifyDoneRef.current) return;
    const s = String(job.status);
    if (!TERMINAL.has(s)) return;
    terminalNotifyDoneRef.current = true;
    onJobFinished?.({ jobId: jid, status: s, jobType: job.jobType });
  }, [isOpen, jid, job, job?.status, job?.jobType, onJobFinished]);

  useEffect(() => {
    if (!isOpen || !Number.isFinite(jid)) return undefined;
    let cancelled = false;
    const disconnect = connectTenantRealtimeSocket({
      getToken: getStoredAccessToken,
      onEvent: (event, data) => {
        if (event !== 'background_job' || !data || typeof data !== 'object') return;
        const row = data.job;
        if (!row || Number(row.id) !== jid) return;
        if (cancelled) return;
        applyJobPayload(row);
      },
    });
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [isOpen, jid, applyJobPayload]);

  useEffect(() => {
    if (!isOpen || !Number.isFinite(jid)) return undefined;
    if (job && TERMINAL.has(String(job.status))) return undefined;
    const id = window.setInterval(() => void fetchJob(), POLL_MS);
    return () => clearInterval(id);
  }, [isOpen, jid, fetchJob, job?.status]);

  const etaLine = useMemo(() => {
    if (!job || job.status !== 'running') return { primary: null, hint: null };
    const total = job.totalCount;
    const processed = job.processedCount;
    if (total <= 0 || processed <= 0 || processed >= total) return { primary: null, hint: null };

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
        hint: 'Estimate in a moment.',
      };
    }
    const prev = etaSmoothedRef.current;
    if (prev == null || !Number.isFinite(prev)) {
      etaSmoothedRef.current = raw;
    } else {
      etaSmoothedRef.current = prev * (1 - ETA_EMA) + raw * ETA_EMA;
    }
    return {
      primary: formatEtaDisplay(etaSmoothedRef.current),
      hint: null,
    };
  }, [job, job?.processedCount, job?.totalCount, job?.status]);

  const status = job?.status ?? '';
  const statusStr = String(status);
  const isTerminal = TERMINAL.has(statusStr);
  const isRunning = statusStr === 'running';
  const isPreparing =
    initialLoading || !job || statusStr === 'pending' || (Boolean(job) && !isTerminal && statusStr !== 'running');
  const humanStep = job?.currentStep ? humanizeStepLabel(job.currentStep) : null;

  const barPct = useMemo(() => {
    if (isPreparing) return null;
    if (!job) return 0;
    if (job.totalCount > 0) return Math.min(100, Math.floor((job.processedCount / job.totalCount) * 100));
    return Math.min(100, job.progressPercent ?? 0);
  }, [isPreparing, job, job?.processedCount, job?.totalCount, job?.progressPercent]);

  const progressCaption = useMemo(() => {
    if (isPreparing) {
      if (initialLoading || !job) return 'Connecting…';
      return 'Starting your request…';
    }
    if (!job || !isRunning) return '';
    if (job.totalCount > 0) {
      const p = Math.min(100, Math.floor((job.processedCount / job.totalCount) * 100));
      return `${job.processedCount.toLocaleString()} / ${job.totalCount.toLocaleString()} (${p}%)`;
    }
    return `${job.progressPercent ?? 0}% complete`;
  }, [isPreparing, initialLoading, job, isRunning]);

  const handleOpenJobs = () => {
    onClose?.();
    navigate(backgroundJobsPath);
  };

  const handleReturnMain = () => {
    onClose?.();
    if (returnToPath) navigate(returnToPath);
  };

  const canEndTask =
    !isTerminal &&
    Number.isFinite(jid) &&
    !loadError &&
    (initialLoading ||
      !job ||
      statusStr === 'staging' ||
      statusStr === 'pending' ||
      statusStr === 'running');

  const handleStopTask = async () => {
    if (!Number.isFinite(jid) || cancelLoading) return;
    setCancelError('');
    setCancelLoading(true);
    try {
      await backgroundJobsAPI.cancel(jid);
      await fetchJob();
    } catch (e) {
      setCancelError(e?.response?.data?.error || e?.message || 'Could not stop this task');
    } finally {
      setCancelLoading(false);
    }
  };

  const showProgressUi = !isTerminal;
  /** Hide extra copy during “starting” — show queued detail only once the job is running. */
  const showQueuedDescription = Boolean(
    description && isRunning && !TERMINAL.has(String(job?.status ?? ''))
  );

  if (!isOpen || !Number.isFinite(jid)) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Background task'}
      size="md"
      closeOnOverlay={isTerminal}
      closeOnEscape={isTerminal}
      footer={
        <ModalFooter>
          {isTerminal ? (
            <div className={styles.footerRowTerminal}>
              <Button type="button" variant="secondary" onClick={handleOpenJobs}>
                Open Background tasks
              </Button>
              <Button type="button" variant="primary" onClick={handleReturnMain}>
                {returnToLabel}
              </Button>
            </div>
          ) : isPreparing ? (
            <div className={styles.footerRowStarting}>
              {canEndTask ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleStopTask}
                  loading={cancelLoading}
                >
                  End task
                </Button>
              ) : null}
            </div>
          ) : (
            <div className={styles.footerRowProgress}>
              {canEndTask ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleStopTask}
                  loading={cancelLoading}
                >
                  End task
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={handleOpenJobs}>
                Open Background tasks
              </Button>
              <Button type="button" variant="primary" onClick={handleReturnMain}>
                {returnToLabel}
              </Button>
            </div>
          )}
        </ModalFooter>
      }
    >
      {showQueuedDescription ? <p className={styles.desc}>{description}</p> : null}

      {loadError ? <Alert variant="error">{loadError}</Alert> : null}

      {cancelError ? <Alert variant="error">{cancelError}</Alert> : null}

      {showProgressUi && !loadError ? (
        <>
          {isPreparing ? (
            <div className={styles.startingBody}>
              <Spinner size="sm" />
              <span>Starting…</span>
            </div>
          ) : (
            <>
              <div className={styles.progressWrap}>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={barPct == null ? undefined : { width: `${barPct}%` }}
                  />
                </div>
                <div className={styles.progressLine}>
                  <span>{progressCaption}</span>
                </div>
              </div>
              {isRunning && humanStep ? (
                <div className={styles.step}>
                  <strong>{humanStep}</strong>
                </div>
              ) : null}
              {isRunning && etaLine.primary ? <div className={styles.eta}>{etaLine.primary}</div> : null}
              {isRunning && etaLine.hint ? <div className={styles.etaHint}>{etaLine.hint}</div> : null}
            </>
          )}
        </>
      ) : null}

      {job && statusStr === 'completed' ? (
        <div className={styles.successBlock}>
          <span className={styles.successIcon} aria-hidden>
            {'\u2713'}
          </span>
          <div>
            <div className={styles.successTitle}>Success</div>
            <p className={styles.successBody}>{successMessageForJobType(job.jobType)}</p>
          </div>
        </div>
      ) : null}

      {job && statusStr === 'failed' ? (
        <Alert variant="error">
          <strong>We couldn’t complete this.</strong>
          <div className={styles.failLead}>
            {job.errorMessage ||
              'Something went wrong. Try again, or open Background tasks for details. Contact support if it keeps happening.'}
          </div>
        </Alert>
      ) : null}

      {job && statusStr === 'cancelled' ? (
        <Alert variant="warning">This task was stopped. No further changes will run for it.</Alert>
      ) : null}
    </Modal>
  );
}
