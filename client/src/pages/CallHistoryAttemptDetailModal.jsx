import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { sanitizeAttemptNotesForDisplay } from '../utils/callAttemptNotesDisplay';
import styles from './CallHistoryAttemptDetailModal.module.scss';

function formatDurationSec(sec) {
  const n = Number(sec ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const s = Math.floor(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/**
 * Read-only detail view for a single call attempt row (same data as the list API).
 */
export function CallHistoryAttemptDetailModal({ isOpen, onClose, row, formatWhen, onFilterByParty }) {
  const navigate = useNavigate();
  if (!row) return null;

  const notesFull = sanitizeAttemptNotesForDisplay(row.notes || '');
  const dialSid = row.dialer_session_id;
  const dialNo = row.dialer_user_session_no;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Call attempt #${row.id}`}
      size="lg"
      closeOnEscape
      footer={
        <ModalFooter className={styles.footer}>
          {row.contact_id != null && onFilterByParty ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onFilterByParty(String(row.contact_id));
                onClose();
              }}
            >
              Show all calls for this party
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      }
    >
      <p className={styles.lead}>
        Single call attempt — full details below. This is not the CRM lead/contact screen.
      </p>
      <dl className={styles.grid}>
        <dt className={styles.label}>When (created)</dt>
        <dd className={styles.value}>{formatWhen?.(row.created_at) ?? row.created_at ?? '—'}</dd>

        <dt className={styles.label}>Attempt id</dt>
        <dd className={styles.value}>
          <code className={styles.mono}>#{row.id}</code>
        </dd>

        <dt className={styles.label}>Called party</dt>
        <dd className={styles.value}>
          {row.display_name || '—'}{' '}
          {row.contact_id != null ? <span className={styles.muted}>(party id {row.contact_id})</span> : null}
        </dd>

        <dt className={styles.label}>Phone</dt>
        <dd className={styles.value}>{row.phone_e164 || '—'}</dd>

        <dt className={styles.label}>Agent</dt>
        <dd className={styles.value}>{row.agent_name || (row.agent_user_id ? `#${row.agent_user_id}` : '—')}</dd>

        <dt className={styles.label}>Direction</dt>
        <dd className={styles.value}>
          <Badge variant="muted" size="sm">
            {row.direction || '—'}
          </Badge>
        </dd>

        <dt className={styles.label}>Status</dt>
        <dd className={styles.value}>
          <Badge variant="default" size="sm">
            {row.status || '—'}
          </Badge>
        </dd>

        <dt className={styles.label}>Connectivity</dt>
        <dd className={styles.value}>
          <Badge variant={Number(row.is_connected) === 1 ? 'success' : 'warning'} size="sm">
            {Number(row.is_connected) === 1 ? 'Connected' : 'Not connected'}
          </Badge>
        </dd>

        <dt className={styles.label}>Disposition</dt>
        <dd className={styles.value}>{row.disposition_name || '—'}</dd>

        <dt className={styles.label}>Duration</dt>
        <dd className={styles.value}>{formatDurationSec(row.duration_sec)}</dd>

        <dt className={styles.label}>Started</dt>
        <dd className={styles.value}>{formatWhen?.(row.started_at) ?? '—'}</dd>

        <dt className={styles.label}>Ended</dt>
        <dd className={styles.value}>{formatWhen?.(row.ended_at) ?? '—'}</dd>

        <dt className={styles.label}>Provider</dt>
        <dd className={styles.value}>{row.provider || '—'}</dd>

        <dt className={styles.label}>Dial session</dt>
        <dd className={styles.value}>
          {!dialSid && (dialNo == null || dialNo === '') ? (
            '—'
          ) : (
            <div className={styles.dialSessionRow}>
              <span>
                {dialNo != null && dialNo !== '' ? (
                  <>
                    Session <strong>#{dialNo}</strong>
                  </>
                ) : null}
                {dialSid ? <span className={styles.muted}> · id {dialSid}</span> : null}
              </span>
              {dialSid ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/dialer/session/${dialSid}`)}>
                  Open dial session
                </Button>
              ) : null}
            </div>
          )}
        </dd>

        <dt className={styles.label}>Notes</dt>
        <dd className={styles.value}>{notesFull ? <pre className={styles.notesPre}>{notesFull}</pre> : '—'}</dd>
      </dl>
    </Modal>
  );
}
