import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { callsAPI } from '../services/callsAPI';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { contactsAPI } from '../services/contactsAPI';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { extractTemplateKeys, renderScriptHtml } from '../utils/callScriptHtml';
import styles from './DialerSessionPage.module.scss';

function safeDateTime(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function formatTimerHms(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'pause') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M8 6v12M16 6v12" />
      </svg>
    );
  }
  if (name === 'play') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M8 5l11 7-11 7V5z" />
      </svg>
    );
  }
  if (name === 'micOff') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 1a3 3 0 0 1 3 3v6a3 3 0 0 1-5.12 2.12" />
        <path {...stroke} d="M19 11a7 7 0 0 1-12 4" />
        <path {...stroke} d="M12 18v4" />
        <path {...stroke} d="M8 22h8" />
        <path {...stroke} d="M3 3l18 18" />
      </svg>
    );
  }
  if (name === 'stop') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M7 7h10v10H7z" />
      </svg>
    );
  }
  return null;
}

function normItemState(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function resolveCurrentItem(items = []) {
  return items.find((i) => i.state === 'calling') || items.find((i) => i.state === 'queued') || null;
}

function resolveLastAttemptId(items = []) {
  const active = items.find((i) => i.state === 'calling' && i.last_attempt_id);
  if (active?.last_attempt_id) return active.last_attempt_id;
  const last = [...items].reverse().find((i) => i.last_attempt_id);
  return last?.last_attempt_id || null;
}

export function DialerSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);
  /** Bumps when POST /next applies session — stale in-flight GET /session must not overwrite. */
  const loadEpochRef = useRef(0);
  const callNextInFlightRef = useRef(false);
  const [templateSample, setTemplateSample] = useState(null);
  const [activeTemplateKeys, setActiveTemplateKeys] = useState(null);
  const [tick, setTick] = useState(0);
  const [uiTimer, setUiTimer] = useState(() => {
    if (!id) return { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    try {
      const raw = sessionStorage.getItem(`dialerTimer:${id}`);
      return raw ? JSON.parse(raw) : { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    } catch {
      return { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    }
  });

  const requestedStep = String(searchParams.get('step') || '').toLowerCase();
  const [view, setView] = useState(requestedStep === 'preflight' ? 'preflight' : 'active');

  useEffect(() => {
    if (requestedStep === 'preflight') setView('preflight');
  }, [requestedStep]);

  useEffect(() => {
    if (!id) return;
    try {
      sessionStorage.setItem(`dialerTimer:${id}`, JSON.stringify(uiTimer));
    } catch {
      // ignore
    }
  }, [id, uiTimer]);

  const items = useMemo(
    () =>
      (session?.items || []).map((row) => ({
        ...row,
        state: normItemState(row.state),
      })),
    [session?.items]
  );
  const currentItem = useMemo(() => resolveCurrentItem(items), [items]);
  const lastAttemptId = useMemo(() => resolveLastAttemptId(items), [items]);
  const queuedCount = useMemo(() => items.filter((i) => i.state === 'queued').length, [items]);
  const calledCount = useMemo(() => items.filter((i) => i.state === 'called').length, [items]);
  const failedCount = useMemo(() => items.filter((i) => i.state === 'failed').length, [items]);
  const callingCount = useMemo(() => items.filter((i) => i.state === 'calling').length, [items]);
  const connectedCount = useMemo(
    () => items.filter((i) => i.state === 'called' && Number(i.attempt_is_connected) === 1).length,
    [items]
  );

  const totalCount = items.length;
  const completedCount = calledCount + failedCount;
  const progressCount = completedCount + callingCount;
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((progressCount / totalCount) * 100)) : 0;

  const currentContactNumber = useMemo(() => {
    if (!currentItem) return 0;
    const idx = items.findIndex((it) => it.id === currentItem.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [items, currentItem]);

  useEffect(() => {
    if (!uiTimer?.startedAtMs) return;
    if (uiTimer?.pausedAtMs) return;
    if (session?.ended_at) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [uiTimer?.startedAtMs, uiTimer?.pausedAtMs, session?.ended_at]);

  const durationMs = useMemo(() => {
    const startedAtMs = Number(uiTimer?.startedAtMs || 0);
    if (!startedAtMs) return 0;
    const endMs = session?.ended_at ? new Date(session.ended_at).getTime() : Date.now();
    const pausedTotalMs = Number(uiTimer?.pausedTotalMs || 0);
    const extraPausedMs = uiTimer?.pausedAtMs ? Math.max(0, Date.now() - Number(uiTimer.pausedAtMs)) : 0;
    return Math.max(0, endMs - startedAtMs - pausedTotalMs - extraPausedMs);
  }, [uiTimer?.startedAtMs, uiTimer?.pausedTotalMs, uiTimer?.pausedAtMs, session?.ended_at, tick]);

  const load = useCallback(async () => {
    if (!id) return;
    const rid = ++loadEpochRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.getById(id);
      if (rid !== loadEpochRef.current) return;
      const s = res?.data?.data ?? null;
      setSession(s);
    } catch (e) {
      if (rid !== loadEpochRef.current) return;
      setError(e?.response?.data?.error || e?.message || 'Failed to load session');
      setSession(null);
    } finally {
      if (rid === loadEpochRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await templateVariablesAPI.getPreviewSample();
        if (!cancelled) setTemplateSample(res?.data ?? {});
      } catch {
        if (!cancelled) setTemplateSample({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await templateVariablesAPI.getGrouped();
        const grouped = res?.data ?? {};
        const keys = [];
        Object.keys(grouped).forEach((mod) => {
          (grouped[mod] || []).forEach((v) => {
            if (v?.key) keys.push(String(v.key));
          });
        });
        if (!cancelled) setActiveTemplateKeys(new Set(keys));
      } catch {
        if (!cancelled) setActiveTemplateKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const missingTemplateKeys = useMemo(() => {
    const scriptText = session?.script?.script_body || '';
    if (!scriptText) return [];
    if (!activeTemplateKeys) return [];
    const used = extractTemplateKeys(scriptText);
    return used.filter((k) => !activeTemplateKeys.has(k));
  }, [session?.script?.script_body, activeTemplateKeys]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cid = currentItem?.contact_id;
        if (!cid) {
          if (!cancelled) setContact(null);
          return;
        }
        const res = await contactsAPI.getById(cid);
        if (!cancelled) setContact(res?.data?.data ?? null);
      } catch {
        if (!cancelled) setContact(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentItem?.contact_id]);

  async function callNext() {
    if (!id || callNextInFlightRef.current) return;
    callNextInFlightRef.current = true;
    setUiTimer((prev) => {
      if (prev?.startedAtMs) return prev;
      return { startedAtMs: Date.now(), pausedAtMs: null, pausedTotalMs: 0 };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.next(id);
      const payload = res?.data?.data;
      let nextSession =
        payload?.session && Array.isArray(payload.session.items) ? payload.session : null;
      if (!nextSession && payload && Array.isArray(payload.items)) {
        nextSession = payload;
      }
      if (nextSession) {
        loadEpochRef.current += 1;
        setSession(nextSession);
      } else {
        await load();
      }
      if (view !== 'active') setView('active');
      if (requestedStep) setSearchParams({}, { replace: true });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to call next');
    } finally {
      setBusy(false);
      callNextInFlightRef.current = false;
    }
  }

  async function cancelSession() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.cancel(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to cancel session');
    } finally {
      setBusy(false);
    }
  }

  const sessionEnded = session?.status === 'completed' || session?.status === 'cancelled';

  async function pauseSession() {
    if (!id) return;
    setUiTimer((prev) => {
      if (!prev?.startedAtMs) return prev;
      if (prev?.pausedAtMs) return prev;
      return { ...prev, pausedAtMs: Date.now() };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.pause(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to pause session');
    } finally {
      setBusy(false);
    }
  }

  async function resumeSession() {
    if (!id) return;
    setUiTimer((prev) => {
      if (!prev?.startedAtMs) return prev;
      if (!prev?.pausedAtMs) return prev;
      const add = Math.max(0, Date.now() - Number(prev.pausedAtMs));
      return { ...prev, pausedAtMs: null, pausedTotalMs: Number(prev.pausedTotalMs || 0) + add };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.resume(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to resume session');
    } finally {
      setBusy(false);
    }
  }

  async function setDisposition(dispositionId, nextAction) {
    if (!lastAttemptId) return;
    const dispNum = Number(dispositionId);
    if (!Number.isFinite(dispNum) || dispNum <= 0) return;
    setBusy(true);
    setError('');
    try {
      await callsAPI.setDisposition(lastAttemptId, { disposition_id: dispNum });
      await load();
      if (String(nextAction || '').toLowerCase().includes('next')) {
        await callNext();
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to set disposition');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dialer session"
        description={id ? `Session #${id}` : 'Session'}
        actions={
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={() => navigate('/dialer')}>
              Back to leads
            </Button>
            <Button variant="secondary" onClick={() => navigate('/calls/history')}>
              Call history
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading && !session ? (
        <div className={styles.loadingCenter}>
          <Spinner size="lg" />
        </div>
      ) : null}

      {session ? (
        <>
          {sessionEnded ? (
            <div className={styles.summaryWrap}>
              <div className={styles.summaryHero}>
                <div className={styles.summaryHeroText}>
                  <div className={styles.summaryEyebrow}>Dialer session</div>
                  <h2 className={styles.summaryHeadline}>
                    Session #{id} · <span className={styles.summaryStatus}>{session.status}</span>
                  </h2>
                  <p className={styles.summarySub}>
                    Here is how this run finished. You can return to leads when you are ready.
                  </p>
                </div>
                <div className={styles.summaryHeroAside}>
                  <div className={styles.summaryDurationLabel}>Session time</div>
                  <div className={styles.summaryDurationValue}>{formatTimerHms(durationMs)}</div>
                </div>
              </div>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Total contacts</div>
                  <div className={styles.summaryValue}>{totalCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Called</div>
                  <div className={styles.summaryValue}>{calledCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Connected</div>
                  <div className={styles.summaryValue}>{connectedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Failed</div>
                  <div className={styles.summaryValue}>{failedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Queued left</div>
                  <div className={styles.summaryValue}>{queuedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Script</div>
                  <div className={styles.summaryValueSmall}>{session?.script?.script_name || '—'}</div>
                </div>
              </div>
              <div className={styles.summaryActions}>
                <Button onClick={() => navigate('/dialer')}>Done — back to leads</Button>
              </div>
            </div>
          ) : null}

          {view === 'preflight' && !sessionEnded ? (
            <div className={styles.preflightCard}>
              <div className={styles.preflightTitle}>Before you start</div>
              <div className={styles.preflightBody}>
                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Session settings</div>
                  <div className={styles.preflightList}>
                    <div>
                      <span className={styles.preflightKey}>Dialing set</span>
                      <span className={styles.preflightVal}>{session?.dialing_set_id ? `#${session.dialing_set_id}` : '—'}</span>
                    </div>
                    <div>
                      <span className={styles.preflightKey}>Call script</span>
                      <span className={styles.preflightVal}>{session?.script?.script_name || '—'}</span>
                    </div>
                    <div>
                      <span className={styles.preflightKey}>Selected contacts</span>
                      <span className={styles.preflightVal}>{totalCount}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Instructions</div>
                  <ul className={styles.preflightBullets}>
                    <li>Review the script and the disposition buttons before starting.</li>
                    <li>Use Pause if you need to temporarily stop dialing.</li>
                    <li>After each call, set the disposition to keep your session accurate.</li>
                  </ul>
                </div>

                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Legal & compliance</div>
                  <ul className={styles.preflightBullets}>
                    <li>Only call leads you are authorized to contact.</li>
                    <li>Respect local DND/consent rules and your company’s policy.</li>
                    <li>Do not store sensitive info in notes unless policy allows it.</li>
                  </ul>
                </div>

                <div className={styles.preflightActions}>
                  <Button
                    onClick={callNext}
                    disabled={busy || session.status === 'paused' || callingCount > 0}
                    title={
                      callingCount > 0
                        ? 'Finish the current call (set a disposition) before starting another dial.'
                        : undefined
                    }
                  >
                    {busy ? 'Working…' : 'Start session'}
                  </Button>
                  <Button variant="secondary" onClick={() => setView('active')} disabled={busy}>
                    Skip
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {sessionEnded ? null : (
          <div className={styles.dialerConsole}>
            <div className={styles.consoleMain}>
              <div className={styles.consoleLeft}>
                <div className={styles.consoleTitleRow}>
                  <div className={styles.sessionTitle}>
                    Session <span className={styles.sessionId}>#{id}</span>
                  </div>
                  <span className={`${styles.statusPill} ${styles[`status_${session.status}`] || ''}`.trim()}>{session.status || '—'}</span>
                </div>

                <div className={styles.progressRow}>
                  <div className={styles.progressText}>
                    <div className={styles.progressPrimary}>
                      {totalCount > 0 ? (
                        <>
                          {completedCount} completed
                          {callingCount ? <span className={styles.progressSubtle}> · {callingCount} in call</span> : null}
                          {queuedCount ? <span className={styles.progressSubtle}> · {queuedCount} queued</span> : null}
                        </>
                      ) : (
                        'No contacts in this session'
                      )}
                    </div>
                    <div className={styles.progressSecondary}>
                      {totalCount > 0 ? (
                        <>
                          {progressCount} / {totalCount} ({progressPct}%)
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div className={styles.progressBar} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                <div className={styles.consoleStats}>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Started</div>
                    <div className={styles.kpiValue}>{uiTimer?.startedAtMs ? 'Dialing started' : 'Not started'}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Duration</div>
                    <div className={styles.kpiValue}>{formatTimerHms(durationMs)}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Called</div>
                    <div className={styles.kpiValue}>{calledCount}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Failed</div>
                    <div className={styles.kpiValue}>{failedCount}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Connected</div>
                    <div className={styles.kpiValue}>{connectedCount}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Contacts</div>
                    <div className={styles.kpiValue}>
                      {totalCount > 0 ? (currentContactNumber ? `${currentContactNumber} / ${totalCount}` : `— / ${totalCount}`) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.consoleRight}>
                <div className={styles.controlRow}>
                  <Button
                    variant="secondary"
                    onClick={session.status === 'paused' ? resumeSession : pauseSession}
                    disabled={
                      busy ||
                      session.status === 'ready' ||
                      session.status === 'completed' ||
                      session.status === 'cancelled'
                    }
                    title={session.status === 'paused' ? 'Resume dialing' : 'Pause dialing'}
                  >
                    <span className={styles.iconBtnInner}>
                      <Icon name={session.status === 'paused' ? 'play' : 'pause'} />
                      <span className={styles.iconBtnText}>{session.status === 'paused' ? 'Resume' : 'Pause'}</span>
                    </span>
                  </Button>

                  <Button
                    variant="secondary"
                    disabled
                    title="Mute/unmute requires live call provider support (not available for dummy provider yet)"
                  >
                    <span className={styles.iconBtnInner}>
                      <Icon name="micOff" />
                      <span className={styles.iconBtnText}>Mute</span>
                    </span>
                  </Button>

                  <Button
                    variant="warning"
                    onClick={cancelSession}
                    disabled={busy || session.status === 'completed' || session.status === 'cancelled'}
                    title="Ends the session (no more calls will be placed)"
                  >
                    <span className={styles.iconBtnInner}>
                      <Icon name="stop" />
                      <span className={styles.iconBtnText}>End</span>
                    </span>
                  </Button>
                </div>

                <div className={styles.primaryAction}>
                  {view === 'preflight' ? (
                    <p className={styles.preflightPrimaryHint}>
                      Use <strong>Start session</strong> above to place the first call.
                    </p>
                  ) : (
                    <Button
                      onClick={callNext}
                      disabled={
                        busy ||
                        session.status === 'paused' ||
                        session.status === 'completed' ||
                        session.status === 'cancelled' ||
                        callingCount > 0
                      }
                      title={
                        callingCount > 0
                          ? 'Set a disposition for the current call before dialing the next lead.'
                          : undefined
                      }
                    >
                      {busy ? 'Working…' : session.status === 'ready' ? 'Start dialing' : 'Call next'}
                    </Button>
                  )}
                </div>

                <div className={styles.nowDialing}>
                  <div className={styles.nowLabel}>Now dialing</div>
                  <div className={styles.nowValue}>
                    {contact?.display_name ||
                      contact?.first_name ||
                      contact?.email ||
                      (currentItem ? currentItem.display_name || `Contact #${currentItem.contact_id}` : '—')}
                  </div>
                  <div className={styles.nowSub}>
                    {contact?.primary_phone || currentItem?.primary_phone ? (
                      <span>{contact?.primary_phone || currentItem?.primary_phone}</span>
                    ) : (
                      <span>—</span>
                    )}
                    <span className={styles.dot}>·</span>
                    <span>{currentItem?.state ? `State: ${currentItem.state}` : 'State: —'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {sessionEnded || view === 'preflight' ? null : (
          <div className={styles.grid}>
            <aside className={styles.left}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Current contact</div>
                <div className={styles.contactName}>
                  {contact?.display_name || contact?.first_name || contact?.email || (currentItem ? `#${currentItem.contact_id}` : '—')}
                </div>
                <div className={styles.contactMeta}>
                  <div>
                    <span className={styles.metaLabel}>Phone</span>
                    <div className={styles.metaValue}>{contact?.primary_phone || currentItem?.primary_phone || '—'}</div>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Email</span>
                    <div className={styles.metaValue}>{contact?.email || '—'}</div>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Company</span>
                    <div className={styles.metaValue}>{contact?.company || '—'}</div>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Job title</span>
                    <div className={styles.metaValue}>{contact?.job_title || '—'}</div>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>City</span>
                    <div className={styles.metaValue}>{contact?.city || '—'}</div>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Notes</span>
                    <div className={styles.metaValue}>{contact?.notes || '—'}</div>
                  </div>
                </div>
              </div>
            </aside>

            <main className={styles.center}>
              <div className={styles.card}>
                <div className={styles.cardTitleRow}>
                  <div className={styles.cardTitle}>{session?.script?.script_name || 'Script'}</div>
                  <div className={styles.cardSubtle}>Dialing: {session?.dialing_set_id ? `#${session.dialing_set_id}` : '—'}</div>
                </div>
                {import.meta?.env?.DEV && missingTemplateKeys.length > 0 ? (
                  <div className={styles.devWarn} role="status">
                    <div className={styles.devWarnTitle}>Missing template variables</div>
                    <div className={styles.devWarnBody}>
                      {missingTemplateKeys.map((k) => (
                        <code key={k} className={styles.devWarnCode}>
                          {k}
                        </code>
                      ))}
                    </div>
                    <div className={styles.devWarnHint}>
                      Add these keys in <code>template_variables</code> or replace them in the script editor.
                    </div>
                  </div>
                ) : null}
                <div
                  className={styles.scriptBody}
                  dangerouslySetInnerHTML={{
                    __html: renderScriptHtml(
                      session?.script?.script_body,
                      contact || currentItem,
                      user,
                      tenant,
                      templateSample
                    ),
                  }}
                />
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Queue</div>
                <div className={styles.queueTableWrap}>
                  <table className={styles.queueTable}>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Order</th>
                        <th>Lead</th>
                        <th style={{ width: 120 }}>State</th>
                        <th style={{ width: 140 }}>Called at</th>
                        <th style={{ width: 120 }}>Attempt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className={currentItem?.id === it.id ? styles.queueRowActive : undefined}>
                          <td>{it.order_index + 1}</td>
                          <td>
                            <div className={styles.queueName}>{it.display_name || `#${it.contact_id}`}</div>
                            <div className={styles.queueSub}>
                              #{it.contact_id} · {it.primary_phone || '—'}
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.statePill} ${styles[`state_${it.state}`] || ''}`.trim()}>
                              {it.state}
                            </span>
                          </td>
                          <td>{safeDateTime(it.called_at)}</td>
                          <td>{it.last_attempt_id ? `#${it.last_attempt_id}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>

            <aside className={styles.right}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Disposition set</div>
                <div className={styles.dispoList}>
                  {(session?.dispositions || []).length === 0 ? (
                    <div className={styles.dispoEmpty}>No dispositions configured for this dialing set.</div>
                  ) : (
                    session.dispositions.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={styles.dispoBtn}
                        disabled={busy || !lastAttemptId}
                        title={!lastAttemptId ? 'Call at least one lead first' : d.next_action || ''}
                        onClick={() => setDisposition(d.id, d.next_action)}
                      >
                        <div className={styles.dispoBtnName}>{d.name}</div>
                        {d.next_action ? <div className={styles.dispoBtnHint}>{d.next_action}</div> : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
          )}
        </>
      ) : null}
    </div>
  );
}

