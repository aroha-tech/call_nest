import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { SearchInput } from '../components/ui/SearchInput';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { contactsAPI } from '../services/contactsAPI';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { callsAPI } from '../services/callsAPI';
import { dialingSetsAPI, callScriptsAPI } from '../services/dispositionAPI';
import { dialerPreferencesAPI } from '../services/dialerPreferencesAPI';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './DialerPage.module.scss';

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

function resolveCurrentItem(items = []) {
  return items.find((i) => i.state === 'calling') || items.find((i) => i.state === 'queued') || null;
}

function resolveLastAttemptId(items = []) {
  const last = [...items].reverse().find((i) => i.last_attempt_id);
  return last?.last_attempt_id || null;
}

function renderScriptBody(body, contact, agent) {
  const raw = String(body || '');
  const displayName = contact?.display_name || contact?.first_name || contact?.email || '';
  const firstName = contact?.first_name || (displayName || '').split(' ')[0] || '';
  const lastName = contact?.last_name || (displayName || '').split(' ').slice(1).join(' ') || '';
  const phone = contact?.primary_phone || '';
  const agentName = agent?.name || agent?.full_name || agent?.display_name || agent?.first_name || agent?.email || '';

  return raw
    .replaceAll('{{contact_name}}', displayName)
    .replaceAll('{{display_name}}', displayName)
    .replaceAll('{{contact_first_name}}', firstName)
    .replaceAll('{{contact_last_name}}', lastName)
    .replaceAll('{{contact_phone}}', phone)
    .replaceAll('{{agent_name}}', agentName);
}

export function DialerPage() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [payload, setPayload] = useState(null);
  const leads = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [provider, setProvider] = useState('dummy');

  const [dialingSets, setDialingSets] = useState([]);
  const [callScripts, setCallScripts] = useState([]);
  const [defaults, setDefaults] = useState(null);

  const [activeSessionId, setActiveSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [startDialingSetId, setStartDialingSetId] = useState('');
  const [startCallScriptId, setStartCallScriptId] = useState('');
  const [startError, setStartError] = useState('');

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await contactsAPI.getAll({
        type: 'lead',
        search: searchQuery || undefined,
        page,
        limit,
      });
      setPayload(res?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load leads');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page, limit]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dsRes, csRes, prefRes] = await Promise.all([
          dialingSetsAPI.getAll(true),
          callScriptsAPI.getAll({ includeInactive: false, page: 1, limit: 200 }),
          dialerPreferencesAPI.get(),
        ]);
        if (cancelled) return;
        setDialingSets(dsRes?.data?.data ?? []);
        setCallScripts(csRes?.data?.data ?? []);
        setDefaults(prefRes?.data?.data ?? null);
      } catch {
        if (!cancelled) {
          setDialingSets([]);
          setCallScripts([]);
          setDefaults(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dialingSetOptions = useMemo(() => {
    const rows = (dialingSets || []).filter((d) => (d?.is_deleted ?? 0) === 0);
    return [
      { value: '', label: '— Select dialing set —' },
      ...rows.map((d) => ({ value: String(d.id), label: d.name || d.id })),
    ];
  }, [dialingSets]);

  const callScriptOptions = useMemo(() => {
    const rows = callScripts || [];
    return [
      { value: '', label: '— Select script —' },
      ...rows.map((s) => ({ value: String(s.id), label: s.script_name || `#${s.id}` })),
    ];
  }, [callScripts]);

  const queuedCount = useMemo(() => (session?.items || []).filter((i) => i.state === 'queued').length, [session]);
  const calledCount = useMemo(() => (session?.items || []).filter((i) => i.state === 'called').length, [session]);
  const failedCount = useMemo(() => (session?.items || []).filter((i) => i.state === 'failed').length, [session]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const pageIds = leads.map((l) => l.id);
      const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  async function loadSession(id) {
    if (!id) return;
    setSessionLoading(true);
    setSessionError('');
    try {
      const res = await dialerSessionsAPI.getById(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setSessionError(e?.response?.data?.error || e?.message || 'Failed to load session');
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  async function createSessionFromSelection() {
    setStartError('');
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setSessionError('Select at least 1 lead from the left list to start dialing.');
      return;
    }

    const dsDefault =
      defaults?.default_dialing_set_id ||
      dialingSets.find((d) => d.is_default === 1)?.id ||
      dialingSets[0]?.id ||
      '';
    const csDefault =
      defaults?.default_call_script_id ||
      callScripts.find((s) => s.is_default === 1)?.id ||
      callScripts[0]?.id ||
      '';

    setStartDialingSetId(dsDefault ? String(dsDefault) : '');
    setStartCallScriptId(csDefault ? String(csDefault) : '');
    setStartModalOpen(true);
  }

  async function confirmStartSession() {
    setStartError('');
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setStartError('Select at least 1 lead.');
      return;
    }
    if (!startDialingSetId) {
      setStartError('Dialing set is required.');
      return;
    }
    if (!startCallScriptId) {
      setStartError('Call script is required.');
      return;
    }
    setSessionLoading(true);
    try {
      const res = await dialerSessionsAPI.create({
        contact_ids: ids,
        provider,
        dialing_set_id: startDialingSetId,
        call_script_id: Number(startCallScriptId),
      });
      const s = res?.data?.data ?? null;
      setActiveSessionId(s?.id ?? null);
      setSession(s);
      setStartModalOpen(false);
      clearSelection();
    } catch (e) {
      setStartError(e?.response?.data?.error || e?.message || 'Failed to start session');
    } finally {
      setSessionLoading(false);
    }
  }

  async function callNext() {
    if (!activeSessionId) return;
    setSessionError('');
    setSessionLoading(true);
    try {
      const res = await dialerSessionsAPI.next(activeSessionId);
      const data = res?.data?.data ?? null;
      setSession(data?.session ?? null);

      // Auto-advance: keep consuming queue until done or a failure happens.
      if (autoAdvance && data && data.done === false && data.attempt && data.attempt.is_connected === 1 && queuedCount > 1) {
        // After state refresh, we may still have queued items; trigger next tick.
        setTimeout(() => {
          callNext();
        }, 250);
      }
    } catch (e) {
      setSessionError(e?.response?.data?.error || e?.message || 'Failed to call next');
    } finally {
      setSessionLoading(false);
    }
  }

  async function cancelSession() {
    if (!activeSessionId) return;
    setSessionLoading(true);
    setSessionError('');
    try {
      const res = await dialerSessionsAPI.cancel(activeSessionId);
      const s = res?.data?.data ?? null;
      setSession(s);
    } catch (e) {
      setSessionError(e?.response?.data?.error || e?.message || 'Failed to cancel session');
    } finally {
      setSessionLoading(false);
    }
  }

  useEffect(() => {
    if (!activeSessionId) return;
    loadSession(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Dialer"
        description="Create a calling session, then dial leads one-by-one in order."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate('/calls/history')}>
              Call history
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {sessionError ? <Alert variant="error">{sessionError}</Alert> : null}

      <div className={styles.grid}>
        <section className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <div className={styles.sidebarTitle}>Leads</div>
            <div className={styles.sidebarMeta}>
              <span>{pagination.total || 0} total</span>
            </div>
          </div>

          <div className={styles.sidebarControls}>
            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(v || '');
                setPage(1);
              }}
              placeholder="Search leads... (press Enter)"
            />

            <div className={styles.sideRow}>
              <Select
                label="Provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                options={[{ value: 'dummy', label: 'Dummy (dev)' }]}
              />
              <Button
                variant="primary"
                onClick={createSessionFromSelection}
                disabled={sessionLoading || selectedIds.size === 0}
                title={selectedIds.size === 0 ? 'Select leads first' : undefined}
              >
                Start session ({selectedIds.size})
              </Button>
            </div>

            <div className={styles.sideRow}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                Auto-call next (after connecting)
              </label>
              <Button variant="ghost" onClick={clearSelection} disabled={selectedIds.size === 0}>
                Clear
              </Button>
            </div>
          </div>

          <div className={styles.sidebarList}>
            {loading ? (
              <div className={styles.loadingRow}>
                <Spinner size="sm" /> Loading…
              </div>
            ) : null}

            {!loading && leads.length === 0 ? <div className={styles.empty}>No leads found.</div> : null}

            {!loading && leads.length > 0 ? (
              <div className={styles.listTableWrap}>
                <table className={styles.listTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={leads.length > 0 && leads.every((l) => selectedIds.has(l.id))}
                          onChange={toggleSelectAllOnPage}
                        />
                      </th>
                      <th>Lead</th>
                      <th style={{ width: 110 }}>Phone</th>
                      <th style={{ width: 90 }}>Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className={selectedIds.has(l.id) ? styles.rowSelected : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(l.id)}
                            onChange={() => toggleSelect(l.id)}
                            aria-label={`Select lead ${l.display_name || l.id}`}
                          />
                        </td>
                        <td>
                          <div className={styles.leadName}>{l.display_name || l.first_name || l.email || `#${l.id}`}</div>
                          <div className={styles.leadSub}>#{l.id}</div>
                        </td>
                        <td>{l.primary_phone || '—'}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedIds(new Set([l.id]));
                              setTimeout(() => createSessionFromSelection(), 0);
                            }}
                          >
                            Call
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className={styles.sidebarFooter}>
            <Pagination
              page={pagination.page || page}
              totalPages={pagination.totalPages || 1}
              total={pagination.total || 0}
              limit={pagination.limit || limit}
              onPageChange={setPage}
              onLimitChange={(nextLimit) => {
                setLimit(nextLimit);
                setPage(1);
              }}
            />
          </div>
        </section>

        <section className={styles.main}>
          <div className={styles.mainHead}>
            <div>
              <div className={styles.mainTitle}>Session</div>
              <div className={styles.mainMeta}>
                {activeSessionId ? (
                  <>
                    <span>#{activeSessionId}</span>
                    <span>·</span>
                    <span>Status: {session?.status || '—'}</span>
                    <span>·</span>
                    <span>
                      Queued: {queuedCount} · Called: {calledCount} · Failed: {failedCount}
                    </span>
                  </>
                ) : (
                  'No active session yet'
                )}
              </div>
            </div>
            <div className={styles.mainActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveSessionId(null);
                  setSession(null);
                }}
                disabled={!activeSessionId || sessionLoading}
              >
                Close
              </Button>
              <Button
                onClick={callNext}
                disabled={!activeSessionId || sessionLoading || session?.status !== 'active'}
              >
                {sessionLoading ? 'Working…' : queuedCount === 0 ? 'Finish' : 'Call next'}
              </Button>
              <Button
                variant="warning"
                onClick={cancelSession}
                disabled={!activeSessionId || sessionLoading || session?.status !== 'active'}
              >
                Cancel session
              </Button>
            </div>
          </div>

          <div className={styles.mainBody}>
            {sessionLoading && !session ? (
              <div className={styles.loadingCenter}>
                <Spinner size="lg" />
              </div>
            ) : null}

            {!activeSessionId ? (
              <div className={styles.emptyMain}>
                <div className={styles.emptyTitle}>Create a session from the left list</div>
                <div className={styles.emptyHint}>
                  Select leads, click <strong>Start session</strong>, then use <strong>Call next</strong>.
                </div>
              </div>
            ) : null}

            {activeSessionId && session ? (
              <>
                <div className={styles.dialerTop}>
                  <div className={styles.dialerContact}>
                    <div className={styles.dialerLabel}>Current lead</div>
                    <div className={styles.dialerName}>
                      {resolveCurrentItem(session.items || [])?.display_name ||
                        resolveCurrentItem(session.items || [])?.first_name ||
                        resolveCurrentItem(session.items || [])?.email ||
                        (resolveCurrentItem(session.items || []) ? `#${resolveCurrentItem(session.items || [])?.contact_id}` : '—')}
                    </div>
                    <div className={styles.dialerSub}>
                      {resolveCurrentItem(session.items || []) ? (
                        <>
                          #{resolveCurrentItem(session.items || [])?.contact_id} ·{' '}
                          {resolveCurrentItem(session.items || [])?.primary_phone || '—'}
                        </>
                      ) : (
                        'Queue is empty'
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.dialerMid}>
                  <div className={styles.scriptBox}>
                    <div className={styles.scriptHead}>
                      <div className={styles.scriptTitle}>{session?.script?.script_name || 'Script'}</div>
                    </div>
                    <div
                      className={styles.scriptBody}
                      // scripts are tenant-authored rich text; render as HTML
                      dangerouslySetInnerHTML={{
                        __html: renderScriptBody(
                          session?.script?.script_body,
                          resolveCurrentItem(session.items || []),
                          user
                        ),
                      }}
                    />
                  </div>

                  <div className={styles.dispoBox}>
                    <div className={styles.dispoTitle}>Dispositions</div>
                    <div className={styles.dispoGrid}>
                      {(session?.dispositions || []).length === 0 ? (
                        <div className={styles.dispoEmpty}>No dispositions in this dialing set.</div>
                      ) : (
                        session.dispositions.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className={styles.dispoBtn}
                            disabled={!resolveLastAttemptId(session.items || []) || sessionLoading}
                            title={
                              !resolveLastAttemptId(session.items || [])
                                ? 'Call at least one lead first'
                                : d.next_action || ''
                            }
                            onClick={async () => {
                              const attemptId = resolveLastAttemptId(session.items || []);
                              if (!attemptId) return;
                              await callsAPI.setDisposition(attemptId, { disposition_id: d.id });
                              await loadSession(activeSessionId);
                              if (String(d.next_action || '').toLowerCase().includes('next')) {
                                await callNext();
                              }
                            }}
                          >
                            <div className={styles.dispoBtnName}>{d.name}</div>
                            {d.next_action ? <div className={styles.dispoBtnHint}>{d.next_action}</div> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.sessionTableWrap}>
                <table className={styles.sessionTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Order</th>
                      <th>Lead</th>
                      <th style={{ width: 120 }}>State</th>
                      <th style={{ width: 120 }}>Called at</th>
                      <th style={{ width: 120 }}>Attempt</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(session.items || []).map((it) => (
                      <tr key={it.id}>
                        <td>{it.order_index + 1}</td>
                        <td>
                          <div className={styles.leadName}>{it.display_name || `#${it.contact_id}`}</div>
                          <div className={styles.leadSub}>
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
                        <td>{it.last_error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : null}
          </div>
        </section>
      </div>

      <Modal
        isOpen={startModalOpen}
        onClose={() => (!sessionLoading ? setStartModalOpen(false) : null)}
        title={`Start dialing (${selectedIds.size} selected)`}
        size="md"
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setStartModalOpen(false)} disabled={sessionLoading}>
              Cancel
            </Button>
            <Button onClick={confirmStartSession} disabled={sessionLoading}>
              {sessionLoading ? 'Starting…' : 'Continue'}
            </Button>
          </ModalFooter>
        }
      >
        <div className={styles.startModalBody}>
          {startError ? <Alert variant="error">{startError}</Alert> : null}
          <Select
            label="Dialing set"
            value={startDialingSetId}
            onChange={(e) => setStartDialingSetId(e.target.value)}
            options={dialingSetOptions}
          />
          <Select
            label="Call script"
            value={startCallScriptId}
            onChange={(e) => setStartCallScriptId(e.target.value)}
            options={callScriptOptions}
          />
          <Input label="Selected leads" value={String(selectedIds.size)} disabled />
        </div>
      </Modal>
    </div>
  );
}

