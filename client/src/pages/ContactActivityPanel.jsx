import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Alert } from '../components/ui/Alert';
import { sanitizeAttemptNotesForDisplay } from '../utils/callAttemptNotesDisplay';
import styles from './ContactActivityPanel.module.scss';

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

function formatMoney(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function assignmentSummary(payload) {
  const parts = [];
  const src = payload?.change_source ? String(payload.change_source) : '';
  const by = payload?.changed_by_name ? ` by ${payload.changed_by_name}` : '';
  if (payload?.from_assigned_name != null || payload?.to_assigned_name != null) {
    parts.push(
      `Agent: ${payload?.from_assigned_name ?? '—'} → ${payload?.to_assigned_name ?? '—'}`
    );
  }
  if (payload?.from_manager_name != null || payload?.to_manager_name != null) {
    parts.push(
      `Manager: ${payload?.from_manager_name ?? '—'} → ${payload?.to_manager_name ?? '—'}`
    );
  }
  if (payload?.from_campaign_name != null || payload?.to_campaign_name != null) {
    parts.push(
      `Campaign: ${payload?.from_campaign_name ?? '—'} → ${payload?.to_campaign_name ?? '—'}`
    );
  }
  const head = parts.length ? parts.join(' · ') : 'Assignment / ownership updated';
  const reason = payload?.change_reason ? ` — ${payload.change_reason}` : '';
  return `${head}${src ? ` (${src})` : ''}${by}${reason}`;
}

function typeBadgeVariant(type) {
  switch (type) {
    case 'contact_created':
      return 'primary';
    case 'assignment_changed':
      return 'warning';
    case 'call_attempt':
      return 'success';
    case 'whatsapp_message':
      return 'success';
    case 'email_message':
      return 'primary';
    case 'opportunity_created':
      return 'primary';
    case 'opportunity_updated':
      return 'warning';
    case 'profile_updated':
      return 'default';
    case 'tag_applied':
    case 'tag_removed':
      return 'muted';
    case 'dialer_session_queued':
    case 'dialer_session_position_called':
      return 'warning';
    default:
      return 'default';
  }
}

function typeLabel(type) {
  switch (type) {
    case 'contact_created':
      return 'Record created';
    case 'assignment_changed':
      return 'Assignment / campaign';
    case 'call_attempt':
      return 'Call';
    case 'whatsapp_message':
      return 'WhatsApp';
    case 'email_message':
      return 'Email';
    case 'opportunity_created':
      return 'Deal / opportunity';
    case 'opportunity_updated':
      return 'Opportunity updated';
    case 'profile_updated':
      return 'Profile updated';
    case 'tag_applied':
      return 'Tag added';
    case 'tag_removed':
      return 'Tag removed';
    case 'dialer_session_queued':
      return 'Dial session queue';
    case 'dialer_session_position_called':
      return 'Dial session (called)';
    default:
      return type;
  }
}

function TimelineRefs({ ev, contactId, navigate, onViewCallAttempt }) {
  const refs = ev?.refs || {};
  const cid = contactId || refs.contact_id;

  const dialSid = refs.dialer_session_id || ev.payload?.dialer_session_id;
  const attemptId = refs.call_attempt_id || ev.payload?.id;

  const showPartyCallHistory =
    Boolean(cid) &&
    (Boolean(refs.call_attempt_id) ||
      Boolean(refs.dialer_session_id) ||
      ev.type === 'call_attempt' ||
      String(ev.type || '').startsWith('dialer_session'));

  const parts = [];
  if (attemptId && ev.type === 'call_attempt') {
    parts.push(
      <Button key="att" type="button" size="sm" variant="secondary" onClick={() => onViewCallAttempt?.(ev.payload)}>
        Open attempt #{attemptId}
      </Button>
    );
  } else if (attemptId) {
    parts.push(
      <span key="attc" className={styles.refChip}>
        Call attempt #{attemptId}
      </span>
    );
  }
  if (dialSid) {
    parts.push(
      <Button key="ds" type="button" size="sm" variant="secondary" onClick={() => navigate(`/dialer/session/${dialSid}`)}>
        Open dial session #{dialSid}
      </Button>
    );
  }
  if (refs.dialer_session_item_id) {
    parts.push(
      <span key="dsi" className={styles.refChip}>
        Queue item #{refs.dialer_session_item_id}
      </span>
    );
  }
  if (refs.whatsapp_message_id) {
    const waQ = new URLSearchParams();
    if (cid) waQ.set('contact_id', String(cid));
    waQ.set('open_whatsapp', String(refs.whatsapp_message_id));
    parts.push(
      <Button
        key="wa"
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => navigate(`/whatsapp/messages?${waQ.toString()}`)}
      >
        WhatsApp #{refs.whatsapp_message_id}
      </Button>
    );
  }
  if (refs.email_message_id) {
    const emQ = new URLSearchParams();
    if (cid) emQ.set('contact_id', String(cid));
    emQ.set('open_email', String(refs.email_message_id));
    parts.push(
      <Button
        key="em"
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => navigate(`/email/sent?${emQ.toString()}`)}
      >
        Email #{refs.email_message_id}
      </Button>
    );
  }
  if (refs.opportunity_id) {
    parts.push(
      <span key="opp" className={styles.refChip}>
        Opportunity #{refs.opportunity_id}
      </span>
    );
  }
  if (refs.assignment_history_id) {
    parts.push(
      <span key="asg" className={styles.refChip}>
        Assignment #{refs.assignment_history_id}
      </span>
    );
  }
  if (refs.import_batch_id) {
    parts.push(
      <span key="imp" className={styles.refChip}>
        Import batch #{refs.import_batch_id}
      </span>
    );
  }
  if (refs.stored_event_id) {
    parts.push(
      <span key="sev" className={styles.refChip}>
        Timeline id #{refs.stored_event_id}
      </span>
    );
  }
  if (showPartyCallHistory) {
    parts.push(
      <Button
        key="chist"
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => navigate(`/calls/history?contact_id=${encodeURIComponent(String(cid))}`)}
      >
        Call history (this party)
      </Button>
    );
  }

  if (parts.length === 0) return null;
  return (
    <div className={styles.rowActions} aria-label="Cross-links">
      {parts}
    </div>
  );
}

/**
 * Lead/contact-centric activity: overview + unified timeline (backend GET /contacts/:id/activity).
 * When `timelineMeta` is set, timeline rows load in pages (`mode=summary` then `mode=timeline`).
 */
export function ContactActivityPanel({
  bundle,
  loading,
  error,
  onViewCallAttempt,
  timelineMeta = null,
  onLoadTimeline,
  onLoadMoreTimeline,
}) {
  const navigate = useNavigate();
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!timelineMeta?.loaded || !timelineMeta?.hasMore || timelineMeta?.loadingMore || !onLoadMoreTimeline) {
      return undefined;
    }
    const el = sentinelRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreTimeline();
      },
      { root: null, rootMargin: '180px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [timelineMeta?.loaded, timelineMeta?.hasMore, timelineMeta?.loadingMore, onLoadMoreTimeline]);

  const contact = bundle?.contact;
  const crmPath = useMemo(() => {
    if (!contact?.id) return null;
    return contact.type === 'lead' ? `/leads/${contact.id}` : `/contacts/${contact.id}`;
  }, [contact]);

  if (loading) {
    return (
      <div className={styles.wrap} aria-busy="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size="sm" /> Loading activity…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.wrap}>
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!contact) return null;

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const tagLine = tags.length
    ? tags
        .map((t) => t?.name || t?.label || t?.id)
        .filter(Boolean)
        .join(', ')
    : '';

  const callsTotal = bundle?.callsPagination?.total ?? bundle?.calls?.length ?? 0;
  const callsLoaded = bundle?.calls?.length ?? 0;
  const callsTruncated = Boolean(bundle?.callsTruncated) || callsTotal > callsLoaded;
  const lazyTimeline = timelineMeta != null;
  const timelineRows = bundle.timeline || [];
  const showCallsHint = !lazyTimeline || timelineMeta?.loaded;

  return (
    <div className={styles.wrap}>
      <section className={styles.overviewCard} aria-labelledby="contact-activity-overview-title">
        <div className={styles.overviewTop}>
          <div>
            <div className={styles.titleRow}>
              <h2 id="contact-activity-overview-title" className={styles.name}>
                {contact.display_name || `Party #${contact.id}`}
              </h2>
              <Badge variant={contact.type === 'lead' ? 'warning' : 'info'}>
                {contact.type === 'lead' ? 'Lead' : 'Contact'}
              </Badge>
              {contact.status_name ? (
                <Badge variant="default">{contact.status_name}</Badge>
              ) : null}
            </div>
            <p className={styles.metaLine}>
              {[contact.email, contact.primary_phone || contact.primary_phone_id].filter(Boolean).join(' · ') ||
                'No email or primary phone on file'}
              {contact.source ? ` · Source: ${contact.source}` : ''}
            </p>
          </div>
          <div className={styles.actions}>
            {crmPath ? (
              <Button type="button" variant="primary" size="sm" onClick={() => navigate(crmPath)}>
                Open CRM record
              </Button>
            ) : null}
          </div>
        </div>

        <div className={styles.grid}>
          <div>
            <span className={styles.dt}>Created</span>
            <span className={styles.dd}>{safeDateTime(contact.created_at)}</span>
          </div>
          <div>
            <span className={styles.dt}>Last updated</span>
            <span className={styles.dd}>{safeDateTime(contact.updated_at)}</span>
          </div>
          <div>
            <span className={styles.dt}>First / last call</span>
            <span className={styles.dd}>
              {safeDateTime(contact.first_called_at)} → {safeDateTime(contact.last_called_at)}
            </span>
          </div>
          <div>
            <span className={styles.dt}>Call attempts (totals)</span>
            <span className={styles.dd}>{contact.call_count_total ?? '—'}</span>
          </div>
          <div>
            <span className={styles.dt}>Campaign</span>
            <span className={styles.dd}>{contact.campaign_name || '—'}</span>
          </div>
          <div>
            <span className={styles.dt}>Manager</span>
            <span className={styles.dd}>{contact.manager_name || '—'}</span>
          </div>
          <div>
            <span className={styles.dt}>Assigned agent</span>
            <span className={styles.dd}>{contact.assigned_user_name || '—'}</span>
          </div>
          <div>
            <span className={styles.dt}>Created by</span>
            <span className={styles.dd}>{contact.created_by_name || '—'}</span>
          </div>
          {contact.company ? (
            <div>
              <span className={styles.dt}>Company</span>
              <span className={styles.dd}>{contact.company}</span>
            </div>
          ) : null}
          {contact.city || contact.state || contact.country ? (
            <div>
              <span className={styles.dt}>Location</span>
              <span className={styles.dd}>
                {[contact.city, contact.state, contact.country].filter(Boolean).join(', ')}
              </span>
            </div>
          ) : null}
        </div>

        {tagLine ? (
          <div className={styles.notesBlock}>
            <span className={styles.dt}>Tags</span>
            <p className={styles.summary} style={{ marginTop: 6 }}>
              {tagLine}
            </p>
          </div>
        ) : null}

        {contact.notes && String(contact.notes).trim() ? (
          <div className={styles.notesBlock}>
            <span className={styles.dt}>Contact notes (current)</span>
            <pre className={styles.notesPre}>{String(contact.notes)}</pre>
          </div>
        ) : null}
      </section>

      {bundle.whatsappOmitted ? (
        <p className={styles.hint}>
          WhatsApp messages are hidden — your role does not include WhatsApp view permission.
        </p>
      ) : null}

      {bundle.emailOmitted ? (
        <p className={styles.hint}>
          Email messages are hidden — your role does not include email view permission.
        </p>
      ) : null}

      {showCallsHint && callsTruncated ? (
        <p className={styles.hint}>
          Showing {callsLoaded} of {callsTotal} call attempts in this timeline (server cap). Open Call history for the
          full grid, filters, and export.
        </p>
      ) : null}

      {Array.isArray(bundle.opportunities) && bundle.opportunities.length > 0 ? (
        <section aria-labelledby="contact-activity-opps">
          <h3 id="contact-activity-opps" className={styles.sectionTitle}>
            Active opportunities
          </h3>
          <div className={styles.opps}>
            {bundle.opportunities.map((o) => (
              <div key={o.id} className={styles.oppCard}>
                <strong>{o.deal_name || 'Pipeline'}</strong>
                {o.stage_name ? ` · ${o.stage_name}` : ''}
                {o.title ? ` — ${o.title}` : ''}
                <div style={{ opacity: 0.85, marginTop: 4 }}>
                  Amount {formatMoney(o.amount ?? o.expected_revenue)} · Updated {safeDateTime(o.updated_at)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="contact-activity-timeline">
        <h3 id="contact-activity-timeline" className={styles.sectionTitle}>
          Timeline (newest first)
        </h3>
        <p className={styles.hint}>
          Origin, saves, tags, dial sessions, every call attempt (with dial-session links), WhatsApp, email, assignments,
          and deals — newest first. Use links on each row to open the related call history or dial session.
        </p>

        {lazyTimeline && !timelineMeta.loaded && !timelineMeta.loading ? (
          <div className={styles.timelineLoadRow}>
            <Button type="button" variant="secondary" onClick={onLoadTimeline}>
              Load activity timeline
            </Button>
            <span className={styles.timelineLoadHint}>
              Loads {timelineMeta.pageSize || 10} events at a time; scroll down for more.
            </span>
          </div>
        ) : null}

        {lazyTimeline && timelineMeta.loading && !timelineMeta.loaded ? (
          <div className={styles.timelineLoadingRow} aria-busy="true">
            <Spinner size="sm" /> Building timeline…
          </div>
        ) : null}

        {lazyTimeline && timelineMeta.error ? (
          <Alert variant="error">{timelineMeta.error}</Alert>
        ) : null}

        {lazyTimeline && timelineMeta.loaded && timelineRows.length === 0 ? (
          <p className={styles.hint}>No timeline events for this record yet.</p>
        ) : null}

        <ul className={styles.timeline}>
          {timelineRows.map((ev, idx) => (
            <li key={`tl-${idx}-${ev.type}-${ev.at || ''}`} className={styles.timelineItem}>
              <div className={styles.timelineHead}>
                <Badge variant={typeBadgeVariant(ev.type)}>{typeLabel(ev.type)}</Badge>
                <span className={styles.when}>{safeDateTime(ev.at)}</span>
              </div>
              {ev.type === 'contact_created' ? (
                <>
                  <p className={styles.summary}>
                    {ev.payload?.record_type === 'lead' ? 'Lead' : 'Contact'} added — source:{' '}
                    <strong>{ev.payload?.created_source || '—'}</strong>
                    {ev.payload?.created_by_name ? ` · by ${ev.payload.created_by_name}` : ''}
                  </p>
                  {Array.isArray(ev.payload?.import_batches_nearby) && ev.payload.import_batches_nearby.length > 0 ? (
                    <p className={styles.detail}>
                      Likely import file(s) near this creation time:{' '}
                      {ev.payload.import_batches_nearby
                        .map((b) => `#${b.id} ${b.original_filename || 'file'} (${safeDateTime(b.created_at)})`)
                        .join('; ')}
                    </p>
                  ) : null}
                </>
              ) : null}
              {ev.type === 'profile_updated' ? (
                <p className={styles.summary}>
                  {ev.payload?.summary || 'Record updated'}
                  {ev.payload?.actor_name ? ` · ${ev.payload.actor_name}` : ''}
                </p>
              ) : null}
              {ev.type === 'assignment_changed' ? (
                <p className={styles.summary}>{assignmentSummary(ev.payload)}</p>
              ) : null}
              {ev.type === 'tag_applied' ? (
                <p className={styles.summary}>
                  Tag <strong>{ev.payload?.tag_name || ev.payload?.tag_id}</strong>
                  {ev.payload?.assigned_by_name ? ` · by ${ev.payload.assigned_by_name}` : ''}
                </p>
              ) : null}
              {ev.type === 'tag_removed' ? (
                <p className={styles.summary}>
                  Tag <strong>{ev.payload?.tag_name || ev.payload?.tag_id}</strong> removed
                  {ev.payload?.removed_by_name ? ` · by ${ev.payload.removed_by_name}` : ''}
                </p>
              ) : null}
              {ev.type === 'dialer_session_queued' ? (
                <p className={styles.summary}>
                  Added to dial session #{ev.payload?.session_id} ({ev.payload?.session_status || '—'})
                  {ev.payload?.session_started_by_name ? ` · started by ${ev.payload.session_started_by_name}` : ''}
                </p>
              ) : null}
              {ev.type === 'dialer_session_position_called' ? (
                <p className={styles.summary}>
                  Dial session #{ev.payload?.session_id} — position processed ({ev.payload?.state || '—'})
                  {ev.payload?.last_attempt_id ? ` · attempt #${ev.payload.last_attempt_id}` : ''}
                </p>
              ) : null}
              {ev.type === 'call_attempt' ? (
                <>
                  <p className={styles.summary}>
                    {ev.payload?.direction || 'outbound'} · {ev.payload?.status || '—'}
                    {ev.payload?.is_connected ? ' · connected' : ''}
                    {ev.payload?.disposition_name ? ` · ${ev.payload.disposition_name}` : ''}
                    {ev.payload?.agent_name ? ` · ${ev.payload.agent_name}` : ''}
                  </p>
                  {ev.payload?.notes ? (
                    <p className={styles.detail}>{sanitizeAttemptNotesForDisplay(ev.payload.notes)}</p>
                  ) : null}
                  <TimelineRefs
                    ev={ev}
                    contactId={contact.id}
                    navigate={navigate}
                    onViewCallAttempt={onViewCallAttempt}
                  />
                </>
              ) : null}
              {ev.type === 'whatsapp_message' ? (
                <p className={styles.summary}>
                  {ev.payload?.status || 'pending'}
                  {ev.payload?.template_name ? ` · ${ev.payload.template_name}` : ''}
                  {ev.payload?.sender_name ? ` · ${ev.payload.sender_name}` : ''}
                  {ev.payload?.phone ? ` · ${ev.payload.phone}` : ''}
                </p>
              ) : null}
              {ev.type === 'whatsapp_message' && ev.payload?.message_text ? (
                <p className={styles.detail}>{String(ev.payload.message_text)}</p>
              ) : null}
              {ev.type === 'email_message' ? (
                <>
                  <p className={styles.summary}>
                    {ev.payload?.direction === 'inbound' ? 'Inbound' : 'Outbound'} email · {ev.payload?.status || '—'}
                    {ev.payload?.subject ? ` · ${ev.payload.subject}` : ''}
                    {ev.payload?.sender_name ? ` · ${ev.payload.sender_name}` : ''}
                  </p>
                  {ev.payload?.body_text ? (
                    <p className={styles.detail}>{String(ev.payload.body_text).slice(0, 500)}</p>
                  ) : null}
                </>
              ) : null}
              {ev.type === 'opportunity_created' || ev.type === 'opportunity_updated' ? (
                <p className={styles.summary}>
                  {ev.payload?.deal_name || 'Pipeline'}
                  {ev.payload?.stage_name ? ` · ${ev.payload.stage_name}` : ''}
                  {ev.payload?.title ? ` — ${ev.payload.title}` : ''}
                </p>
              ) : null}
              {ev.type !== 'call_attempt' ? (
                <TimelineRefs
                  ev={ev}
                  contactId={contact.id}
                  navigate={navigate}
                  onViewCallAttempt={onViewCallAttempt}
                />
              ) : null}
            </li>
          ))}
        </ul>

        {lazyTimeline && timelineMeta.loaded && timelineRows.length > 0 ? (
          <p className={styles.hint}>
            Showing {timelineRows.length} loaded
            {timelineMeta.hasMore ? ' · scroll for more' : ''}
          </p>
        ) : null}

        {lazyTimeline && timelineMeta.loaded && timelineMeta.hasMore ? (
          <>
            <div ref={sentinelRef} className={styles.timelineSentinel} aria-hidden />
            {timelineMeta.loadingMore ? (
              <div className={styles.timelineLoadingRow}>
                <Spinner size="sm" /> Loading more…
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
