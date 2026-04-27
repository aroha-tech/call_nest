import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { usePermissions } from '../../hooks/usePermission';
import { callsAPI } from '../../services/callsAPI';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { formatDateTimeDisplay, formatRelativeTimeShort } from '../../utils/dateTimeDisplay';
import styles from './ContactCallHistorySection.module.scss';
import { buildAttemptHistoryEntries } from '../../utils/callAttemptNotesDisplay';

const PAGE_LIMIT = 10;

function humanizeKey(s) {
  if (!s) return '—';
  return String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialsFromName(name) {
  if (!name || !String(name).trim()) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0].toUpperCase()).join('');
}

function avatarHueFromString(str) {
  let h = 0;
  const s = String(str || 'x');
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % 360;
  return h;
}

function attemptStatusPresentation(status, isConnected) {
  const s = String(status || '').toLowerCase();
  if (s.includes('complete') || isConnected) return { label: 'Completed', variant: 'teal' };
  if (s.includes('no_answer') || s.includes('busy') || s.includes('fail') || s.includes('cancel')) {
    return { label: humanizeKey(status) || 'Unsuccessful', variant: 'rose' };
  }
  return { label: humanizeKey(status) || '—', variant: 'slate' };
}

/**
 * Call attempt log for one contact (dial scope applies: agents see their attempts only).
 * Loads 10 outcomes at a time; scroll the list to load more (infinite scroll).
 *
 * @param {{ contactId: string }} props
 */
export function ContactCallHistorySection({ contactId }) {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const dtMode = user?.datetimeDisplayMode ?? 'ist_fixed';
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);

  const scrollRootRef = useRef(null);
  const sentinelRef = useRef(null);
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const appendLockRef = useRef(false);
  const loadMoreUnlockRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [_relTick, setRelTick] = useState(0);
  const [expandedNoteAttemptIds, setExpandedNoteAttemptIds] = useState(() => new Set());

  useEffect(() => {
    const id = window.setInterval(() => setRelTick((x) => x + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  const loadMore = useCallback(async () => {
    if (!canView || !contactId || appendLockRef.current) return;
    const nextPage = pageRef.current + 1;
    if (nextPage > totalPagesRef.current) return;
    appendLockRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await callsAPI.list({
        contact_id: contactId,
        page: nextPage,
        limit: PAGE_LIMIT,
        meaningful_only: true,
      });
      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      const pag = res?.data?.pagination ?? {};
      setRows((prev) => [...prev, ...data]);
      pageRef.current = nextPage;
      const tp = Math.max(1, Number(pag.totalPages) || 1);
      totalPagesRef.current = tp;
      setTotal(Number(pag.total) || 0);
      setHasMore(nextPage < tp);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load more');
    } finally {
      appendLockRef.current = false;
      setLoadingMore(false);
    }
  }, [canView, contactId]);

  useEffect(() => {
    loadingMoreRef.current = Boolean(loadingMore);
  }, [loadingMore]);

  useEffect(() => {
    loadMoreUnlockRef.current = false;
  }, [contactId]);

  useEffect(() => {
    setExpandedNoteAttemptIds(new Set());
  }, [contactId]);

  useEffect(() => {
    if (!canView || !contactId) {
      setLoading(false);
      setRows([]);
      setHasMore(false);
      setTotal(0);
      return undefined;
    }

    let cancelled = false;
    pageRef.current = 1;
    totalPagesRef.current = 1;
    appendLockRef.current = false;
    setLoading(true);
    setError(null);
    setRows([]);

    (async () => {
      try {
        const res = await callsAPI.list({
          contact_id: contactId,
          page: 1,
          limit: PAGE_LIMIT,
          meaningful_only: true,
        });
        if (cancelled) return;
        const data = Array.isArray(res?.data?.data) ? res.data.data : [];
        const pag = res?.data?.pagination ?? {};
        setRows(data);
        pageRef.current = 1;
        const tp = Math.max(1, Number(pag.totalPages) || 1);
        totalPagesRef.current = tp;
        setTotal(Number(pag.total) || 0);
        setHasMore(tp > 1);
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || e.message || 'Failed to load call history');
          setRows([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contactId, canView]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading || !rows.length) return undefined;
    const arm = () => {
      loadMoreUnlockRef.current = true;
    };
    window.addEventListener('scroll', arm, { passive: true });
    const root = scrollRootRef.current;
    if (root) root.addEventListener('scroll', arm, { passive: true });
    return () => {
      window.removeEventListener('scroll', arm);
      if (root) root.removeEventListener('scroll', arm);
    };
  }, [hasMore, loadingMore, loading, rows.length]);

  useEffect(() => {
    if (!hasMore || loading || !rows.length) return undefined;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !loadMoreUnlockRef.current || loadingMoreRef.current) return;
        loadMoreUnlockRef.current = false;
        loadMore();
      },
      { root, rootMargin: '0px 0px 40px 0px', threshold: 0 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [hasMore, loading, rows.length, loadMore]);

  const toggleNotesForAttempt = useCallback((attemptId) => {
    const id = Number(attemptId);
    if (!Number.isFinite(id)) return;
    setExpandedNoteAttemptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!canView) return null;

  const loadedAttempts = rows.length;

  const statusClassMap = {
    teal: styles.statusTeal,
    rose: styles.statusRose,
    slate: styles.statusSlate,
  };

  return (
    <section className={styles.section} aria-labelledby="contact-section-call-history">
      <div className={styles.header}>
        <h2 id="contact-section-call-history" className={styles.title}>
          Call history
        </h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            navigate(`/calls/history?contact_id=${encodeURIComponent(String(contactId))}`)
          }
        >
          Open call history
        </Button>
      </div>
      <p className={styles.desc}>
        One row per <strong>call outcome</strong> (disposition / status). Agent notes are hidden until you use the{' '}
        <strong>+</strong> button in the Notes column. Raw dial stubs are not listed. For the full CRM story — Activity,
        WhatsApp, deals — use <strong>Activity</strong> on the record header. Open call history for the full grid for this
        customer.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <div className={styles.panel}>
          <div className={styles.tableScroll} aria-busy="true">
            <div className={styles.containerLoading}>
              <div style={{ width: '100%', display: 'grid', gap: 10 }}>
                <Skeleton width="30%" height={14} />
                <Skeleton width="100%" height={36} />
                <Skeleton width="100%" height={36} />
                <Skeleton width="100%" height={36} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <p className={styles.emptyInBox}>
              No logged outcomes or call notes yet (empty dials are not listed).
            </p>
          </div>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.panel}>
          <div ref={scrollRootRef} className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thExpand} scope="col">
                    Notes
                  </th>
                  <th className={styles.th}>Activity</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Member</th>
                  <th className={`${styles.th} ${styles.thInfo}`.trim()}>Info</th>
                  <th className={`${styles.th} ${styles.thWhen}`.trim()}>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const attemptId = Number(row.id);
                  const agent = row.agent_name?.trim() || '—';
                  const phone = row.phone_e164?.trim() || '—';
                  const hue = avatarHueFromString(agent);
                  const st = attemptStatusPresentation(row.status, row.is_connected);
                  const statusPillClass = statusClassMap[st.variant] || styles.statusSlate;
                  const noteEntries = buildAttemptHistoryEntries(row).filter((e) => e.kind === 'note');
                  const hasNotes = noteEntries.length > 0;
                  const outcomeTitle =
                    row.disposition_name?.trim() || humanizeKey(row.status) || 'Call logged';
                  const subtitle = `${row.provider ? String(row.provider) : 'Call'}${
                    hasNotes ? ` · ${noteEntries.length} note${noteEntries.length === 1 ? '' : 's'}` : ' · No notes'
                  }`;
                  const whenIso = row.ended_at || row.started_at || row.created_at;
                  const notesOpen = expandedNoteAttemptIds.has(attemptId);

                  return (
                    <React.Fragment key={row.id}>
                      <tr className={styles.tr}>
                        <td className={styles.tdExpand}>
                          <button
                            type="button"
                            className={`${styles.expandBtn} ${notesOpen ? styles.expandBtnOpen : ''}`.trim()}
                            disabled={!hasNotes}
                            aria-expanded={hasNotes ? notesOpen : undefined}
                            aria-label={
                              !hasNotes
                                ? 'No notes on this call'
                                : notesOpen
                                  ? 'Hide call notes'
                                  : 'Show call notes'
                            }
                            onClick={() => toggleNotesForAttempt(attemptId)}
                          >
                            <MaterialSymbol
                              name={notesOpen ? 'remove' : 'add'}
                              size="sm"
                              className={styles.expandGlyph}
                            />
                          </button>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.detailCell}>
                            <div className={styles.iconWrap}>
                              <MaterialSymbol name="call" size="sm" className={styles.iconGlyph} />
                            </div>
                            <div className={styles.detailText}>
                              <span className={styles.rowTitle}>{outcomeTitle}</span>
                              <span className={styles.rowSubtitle}>{subtitle}</span>
                              <span className={styles.whenMobile} title={formatDateTimeDisplay(whenIso, dtMode)}>
                                {formatRelativeTimeShort(whenIso)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.status} ${statusPillClass}`.trim()}>{st.label}</span>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.member}>
                            <span
                              className={styles.avatar}
                              style={{
                                background: `linear-gradient(135deg, hsl(${hue}, 58%, 42%) 0%, hsl(${(hue + 40) % 360}, 52%, 32%) 100%)`,
                              }}
                              aria-hidden
                            >
                              {initialsFromName(agent === '—' ? '' : agent)}
                            </span>
                            <span className={styles.memberName}>{agent}</span>
                          </div>
                        </td>
                        <td className={`${styles.td} ${styles.tdInfo}`.trim()}>
                          <span className={styles.value}>{phone}</span>
                        </td>
                        <td className={`${styles.td} ${styles.tdWhen}`.trim()}>
                          <time
                            className={styles.when}
                            dateTime={whenIso || undefined}
                            title={formatDateTimeDisplay(whenIso, dtMode)}
                          >
                            {formatRelativeTimeShort(whenIso)}
                          </time>
                        </td>
                      </tr>
                      {notesOpen && hasNotes ? (
                        <tr className={styles.notesExpandRow} aria-label="Call notes">
                          <td colSpan={6}>
                            <div className={styles.notesPanel}>
                              <p className={styles.notesPanelTitle}>Call notes</p>
                              <ul className={styles.notesList}>
                                {noteEntries.map((entry) => {
                                  const nWhen = entry.whenIso || whenIso;
                                  return (
                                    <li key={entry.key} className={styles.noteItem}>
                                      <time
                                        className={styles.noteWhen}
                                        dateTime={nWhen || undefined}
                                        title={formatDateTimeDisplay(nWhen, dtMode)}
                                      >
                                        {formatRelativeTimeShort(nWhen)}
                                      </time>
                                      <p className={styles.noteBody}>{entry.text}</p>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {hasMore ? <div ref={sentinelRef} className={styles.scrollSentinel} aria-hidden /> : null}
          </div>
          <div className={styles.footer}>
            <span className={styles.footerHint}>
              {total > 0
                ? `${loadedAttempts} of ${total} call${total === 1 ? '' : 's'} loaded`
                : `${loadedAttempts} call${loadedAttempts === 1 ? '' : 's'} loaded`}
              {hasMore ? ' · scroll the list for more' : loadedAttempts > 0 ? ' · end of list' : ''}
            </span>
            {loadingMore ? (
              <span className={styles.footerLoading}>
                <Skeleton width={16} height={16} circle />
                <Skeleton width={96} height={12} />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
