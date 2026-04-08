import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { callsAPI } from '../services/callsAPI';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { contactsAPI } from '../services/contactsAPI';
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

function resolveCurrentItem(items = []) {
  return items.find((i) => i.state === 'calling') || items.find((i) => i.state === 'queued') || null;
}

function resolveLastAttemptId(items = []) {
  const last = [...items].reverse().find((i) => i.last_attempt_id);
  return last?.last_attempt_id || null;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function looksLikeHtml(s) {
  const str = String(s || '').trim();
  if (!str) return false;
  // quick heuristic: rich text editor outputs tags like <p>, <br>, <div>, etc.
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

function renderScriptHtml(body, contact, agent) {
  const raw = String(body || '');
  const displayName = contact?.display_name || contact?.first_name || contact?.email || '';
  const firstName = contact?.first_name || (displayName || '').split(' ')[0] || '';
  const lastName = contact?.last_name || (displayName || '').split(' ').slice(1).join(' ') || '';
  const phone = contact?.primary_phone || '';
  const email = contact?.email || '';
  const company = contact?.company || '';
  const city = contact?.city || '';
  const agentName = agent?.name || agent?.full_name || agent?.display_name || agent?.first_name || agent?.email || '';

  const map = {
    contact_name: displayName,
    display_name: displayName,
    contact_first_name: firstName,
    contact_last_name: lastName,
    contact_phone: phone,
    contact_email: email,
    company_name: company,
    city: city,
    agent_name: agentName,
    customer: displayName,
    customer_name: displayName,
  };

  const applyVars = (text) =>
    String(text)
      // {{var}} style
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => (map[k] ?? ''))
      // [var] style
      .replace(/\[\s*([a-zA-Z0-9_]+)\s*\]/g, (_, k) => (map[k] ?? ''));

  const substituted = applyVars(raw);

  if (looksLikeHtml(substituted)) {
    return substituted;
  }

  // plain text: escape then preserve line breaks
  return escapeHtml(substituted).replace(/\r\n|\r|\n/g, '<br/>');
}

export function DialerSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);

  const items = session?.items || [];
  const currentItem = useMemo(() => resolveCurrentItem(items), [items]);
  const lastAttemptId = useMemo(() => resolveLastAttemptId(items), [items]);
  const queuedCount = useMemo(() => items.filter((i) => i.state === 'queued').length, [items]);
  const calledCount = useMemo(() => items.filter((i) => i.state === 'called').length, [items]);
  const failedCount = useMemo(() => items.filter((i) => i.state === 'failed').length, [items]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.getById(id);
      const s = res?.data?.data ?? null;
      setSession(s);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load session');
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.next(id);
      setSession(res?.data?.data?.session ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to call next');
    } finally {
      setBusy(false);
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

  async function setDisposition(dispositionId, nextAction) {
    if (!lastAttemptId) return;
    setBusy(true);
    setError('');
    try {
      await callsAPI.setDisposition(lastAttemptId, { disposition_id: dispositionId });
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
          <div className={styles.topBar}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Status</div>
                <div className={styles.statValue}>{session.status || '—'}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Contacts</div>
                <div className={styles.statValue}>
                  {calledCount + failedCount + queuedCount > 0 ? `${calledCount + failedCount + 1} of ${items.length}` : `0 of ${items.length}`}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Queued</div>
                <div className={styles.statValue}>{queuedCount}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Called</div>
                <div className={styles.statValue}>{calledCount}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Failed</div>
                <div className={styles.statValue}>{failedCount}</div>
              </div>
            </div>
            <div className={styles.controls}>
              <Button onClick={callNext} disabled={busy || session.status !== 'active'}>
                {busy ? 'Working…' : 'Call next'}
              </Button>
              <Button variant="warning" onClick={cancelSession} disabled={busy || session.status !== 'active'}>
                Pause/Cancel session
              </Button>
            </div>
          </div>

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
                <div
                  className={styles.scriptBody}
                  dangerouslySetInnerHTML={{
                    __html: renderScriptHtml(session?.script?.script_body, contact || currentItem, user),
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
        </>
      ) : null}
    </div>
  );
}

