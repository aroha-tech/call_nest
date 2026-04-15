import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermission';
import { callsAPI } from '../../services/callsAPI';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import styles from './ContactCallHistorySection.module.scss';
import { buildAttemptHistoryEntries } from '../../utils/callAttemptNotesDisplay';

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
 *
 * @param {{ contactId: string }} props
 */
export function ContactCallHistorySection({ contactId }) {
  const navigate = useNavigate();
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);

  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    if (!canView || !contactId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await callsAPI.list({
        contact_id: contactId,
        page,
        limit,
        meaningful_only: true,
      });
      setPayload(res?.data ?? null);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load call history');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [canView, contactId, limit, page]);

  useEffect(() => {
    setPage(1);
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) return null;

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };

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
          Open in Activities
        </Button>
      </div>
      <p className={styles.desc}>
        Entries appear after you set a disposition and/or save call notes on an attempt. Raw “dial started” rows are
        hidden. Contact-level notes are in the Contact notes section above.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size="sm" /> Loading…
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <p className={styles.empty}>
          No logged outcomes or call notes yet (empty dials are not listed).
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <div className={styles.timelineScroll}>
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
          </div>
          {pagination.totalPages > 1 ? (
            <div className={styles.footer}>
              <Pagination
                page={pagination.page || page}
                totalPages={pagination.totalPages || 1}
                total={pagination.total ?? 0}
                limit={pagination.limit || limit}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
