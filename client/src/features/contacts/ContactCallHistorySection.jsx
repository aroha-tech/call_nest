import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermission';
import { callsAPI } from '../../services/callsAPI';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import styles from './ContactCallHistorySection.module.scss';
import { buildAttemptHistoryEntries } from '../../utils/callAttemptNotesDisplay';

const PAGE_LIMIT = 10;

function formatWhen(iso) {
  if (iso == null || iso === '') return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/**
 * Call attempt log for one contact (dial scope applies: agents see their attempts only).
 * Loads 10 outcomes at a time; scroll the list to load more (infinite scroll).
 *
 * @param {{ contactId: string }} props
 */
export function ContactCallHistorySection({ contactId }) {
  const navigate = useNavigate();
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);

  const scrollRootRef = useRef(null);
  const sentinelRef = useRef(null);
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const appendLockRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

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
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: '100px', threshold: 0 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, rows.length, loadMore]);

  if (!canView) return null;

  const loadedCount = rows.length;

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
        This list is <strong>call outcomes only</strong> (dispositions and call notes). Raw dial stubs are hidden. For
        the full CRM story — every attempt, assignments, WhatsApp, deals — use <strong>Activity</strong> on the record
        header. To filter the global call-history grid by this party, use Open call history.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <div className={styles.timelineScroll} aria-busy="true">
          <div className={styles.containerLoading}>
            <Spinner size="sm" /> Loading…
          </div>
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className={styles.timelineScroll}>
          <p className={styles.emptyInBox}>
            No logged outcomes or call notes yet (empty dials are not listed).
          </p>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div ref={scrollRootRef} className={styles.timelineScroll}>
          <ol className={styles.timeline}>
            {rows.flatMap((row) => {
              const agent =
                row.agent_name?.trim() ||
                (row.agent_user_id != null ? `User #${row.agent_user_id}` : '—');
              const phone = row.phone_e164?.trim() || '—';
              const attemptEntries = buildAttemptHistoryEntries(row);
              return attemptEntries.map((entry) => {
                const when = formatWhen(entry.whenIso || row.started_at || row.created_at);
                return (
                  <li key={entry.key} className={styles.item}>
                    <div className={styles.logLine}>
                      — {when} by {agent} — {phone} — {entry.text}
                    </div>
                    <div className={styles.metaRow}>
                      <span>Attempt #{row.id}</span>
                      <span className={styles.metaSep}>·</span>
                      <span>{row.status || '—'}</span>
                      {row.provider ? (
                        <>
                          <span className={styles.metaSep}>·</span>
                          <span>{row.provider}</span>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              });
            })}
          </ol>
          {hasMore ? <div ref={sentinelRef} className={styles.scrollSentinel} aria-hidden /> : null}
          <div className={styles.footer}>
            <span className={styles.footerHint}>
              {total > 0
                ? `Showing ${loadedCount} of ${total} outcome${total === 1 ? '' : 's'}`
                : `Showing ${loadedCount} outcome${loadedCount === 1 ? '' : 's'}`}
              {hasMore ? ' · scroll for more' : loadedCount > 0 ? ' · end of list' : ''}
            </span>
            {loadingMore ? (
              <span className={styles.footerLoading}>
                <Spinner size="sm" /> Loading…
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
