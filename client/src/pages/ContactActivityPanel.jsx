import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Alert } from '../components/ui/Alert';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { PERMISSIONS } from '../utils/permissionUtils';
import { sanitizeAttemptNotesForDisplay } from '../utils/callAttemptNotesDisplay';
import { formatDateTimeDisplay, formatRelativeTimeShort } from '../utils/dateTimeDisplay';
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

/** Assignment line without trailing “by …” (actor is in the Member column). */
function assignmentDetailLine(payload) {
  const parts = [];
  const src = payload?.change_source ? String(payload.change_source) : '';
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
  return `${head}${src ? ` (${src})` : ''}${reason}`;
}

function initialsFromName(name) {
  if (!name || !String(name).trim()) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0].toUpperCase()).join('');
}

function avatarHueFromString(s) {
  let h = 0;
  const str = String(s || 'x');
  for (let i = 0; i < str.length; i += 1) h = (h + str.charCodeAt(i) * (i + 1)) % 360;
  return h;
}

function formatDurationSecShort(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return null;
  const s = Math.round(Number(sec));
  if (s <= 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function truncateText(str, max) {
  if (str == null || str === '') return null;
  const t = String(str);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function humanizeKey(s) {
  if (!s) return '—';
  return String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function contactTimelineFilterBucket(type) {
  if (type === 'call_attempt') return 'calls';
  if (type === 'dialer_session_queued' || type === 'dialer_session_position_called') return 'dialer';
  if (type === 'whatsapp_message' || type === 'email_message') return 'messages';
  return 'crm';
}

function contactTimelineIcon(ev) {
  switch (ev.type) {
    case 'call_attempt':
      return { name: 'call', wrap: 'caIconCall' };
    case 'whatsapp_message':
      return { name: 'chat', wrap: 'caIconWa' };
    case 'email_message':
      return { name: 'mail', wrap: 'caIconEmail' };
    case 'assignment_changed':
    case 'tag_applied':
    case 'tag_removed':
      return { name: 'person', wrap: 'caIconTeam' };
    case 'dialer_session_queued':
    case 'dialer_session_position_called':
      return { name: 'phone_forwarded', wrap: 'caIconDialer' };
    case 'opportunity_created':
    case 'opportunity_updated':
      return { name: 'trending_up', wrap: 'caIconDeal' };
    case 'contact_created':
      return { name: 'person_add', wrap: 'caIconCrm' };
    default:
      return { name: 'edit_note', wrap: 'caIconCrm' };
  }
}

function callStatusPresentation(status, isConnected) {
  const s = String(status || '').toLowerCase();
  if (s.includes('complete') || isConnected) return { label: 'Completed', variant: 'teal' };
  if (s.includes('no_answer') || s.includes('busy') || s.includes('fail') || s.includes('cancel'))
    return { label: 'Unsuccessful', variant: 'rose' };
  return { label: humanizeKey(status) || 'Call', variant: 'slate' };
}

function messageStatusPresentation(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('fail') || s.includes('error')) return { label: 'Failed', variant: 'rose' };
  if (s.includes('pending') || s.includes('queue')) return { label: 'Pending', variant: 'slate' };
  if (s.includes('deliver')) return { label: 'Delivered', variant: 'teal' };
  if (s.includes('read')) return { label: 'Read', variant: 'teal' };
  if (s.includes('sent')) return { label: 'Sent', variant: 'blue' };
  return { label: humanizeKey(raw) || 'Message', variant: 'blue' };
}

/**
 * Row model for the activity table: what happened, status, who, info, icon.
 * @returns {{ title: string, subtitle: string, detail: string|null, info: string, statusLabel: string, statusVariant: string, actorName: string|null, iconName: string, iconWrap: string }}
 */
function contactTimelineRowModel(ev) {
  const p = ev.payload || {};
  const cat = typeLabel(ev.type);
  const icon = contactTimelineIcon(ev);

  const base = {
    title: '',
    subtitle: cat,
    detail: null,
    info: '—',
    statusLabel: 'Activity',
    statusVariant: 'slate',
    actorName: null,
    iconName: icon.name,
    iconWrap: icon.wrap,
  };

  switch (ev.type) {
    case 'contact_created': {
      const kind = p.record_type === 'lead' ? 'Lead' : 'Contact';
      const importLines =
        Array.isArray(p.import_batches_nearby) && p.import_batches_nearby.length > 0
          ? p.import_batches_nearby
              .map((b) => `${b.original_filename || 'Import'} · ${safeDateTime(b.created_at)}`)
              .join('\n')
          : null;
      return {
        ...base,
        title: `${kind} added`,
        subtitle: `Source: ${p.created_source || '—'}`,
        detail: importLines,
        info: truncateText(p.import_batches_nearby?.[0]?.original_filename, 36) || '—',
        statusLabel: 'Created',
        statusVariant: 'purple',
        actorName: p.created_by_name || null,
      };
    }
    case 'profile_updated':
      return {
        ...base,
        title: p.summary || 'Record updated',
        subtitle: cat,
        detail: null,
        statusLabel: 'Updated',
        statusVariant: 'slate',
        actorName: p.actor_name || null,
      };
    case 'assignment_changed': {
      return {
        ...base,
        title: 'Assignment updated',
        subtitle: assignmentDetailLine(p),
        detail: null,
        info: '—',
        statusLabel: 'Assignment',
        statusVariant: 'amber',
        actorName: p.changed_by_name || null,
      };
    }
    case 'tag_applied':
      return {
        ...base,
        title: `Tag: ${p.tag_name || '—'}`,
        subtitle: cat,
        info: '—',
        statusLabel: 'Tag',
        statusVariant: 'slate',
        actorName: p.assigned_by_name || null,
      };
    case 'tag_removed':
      return {
        ...base,
        title: `Tag removed: ${p.tag_name || '—'}`,
        subtitle: cat,
        info: '—',
        statusLabel: 'Removed',
        statusVariant: 'rose',
        actorName: p.removed_by_name || null,
      };
    case 'dialer_session_queued':
      return {
        ...base,
        title: 'Added to dial session',
        subtitle: `Queue · ${p.session_status || '—'}`,
        detail: null,
        info: p.order_index != null ? `#${p.order_index}` : '—',
        statusLabel: humanizeKey(p.session_status) || 'Queued',
        statusVariant: 'amber',
        actorName: p.session_started_by_name || null,
      };
    case 'dialer_session_position_called':
      return {
        ...base,
        title: 'Dial session — position processed',
        subtitle: `State: ${p.state || '—'}`,
        detail: p.last_error ? String(p.last_error) : null,
        info: p.last_attempt_id ? `Attempt #${p.last_attempt_id}` : '—',
        statusLabel: 'Dialer',
        statusVariant: 'teal',
        actorName: null,
      };
    case 'call_attempt': {
      const st = callStatusPresentation(p.status, p.is_connected);
      const dur = formatDurationSecShort(p.duration_sec);
      const dirLabel = p.direction ? humanizeKey(p.direction) : 'Outbound';
      const titleText = [dirLabel, 'call', p.disposition_name ? `· ${p.disposition_name}` : ''].filter(Boolean).join(' ');
      return {
        ...base,
        title: titleText,
        subtitle: cat,
        detail: p.notes ? sanitizeAttemptNotesForDisplay(p.notes) : null,
        info: dur || truncateText(p.notes, 28) || '—',
        statusLabel: st.label,
        statusVariant: st.variant,
        actorName: p.agent_name || null,
      };
    }
    case 'whatsapp_message': {
      const st = messageStatusPresentation(p.status);
      return {
        ...base,
        title: p.template_name ? `Template: ${p.template_name}` : 'WhatsApp message',
        subtitle: [p.status, p.phone].filter(Boolean).join(' · ') || cat,
        detail: p.message_text ? String(p.message_text) : null,
        info: truncateText(p.phone, 22) || truncateText(p.message_text, 28) || '—',
        statusLabel: st.label,
        statusVariant: st.variant,
        actorName: p.sender_name || null,
      };
    }
    case 'email_message': {
      const st = messageStatusPresentation(p.status);
      const dir = p.direction === 'inbound' ? 'Inbound' : 'Outbound';
      return {
        ...base,
        title: p.subject ? String(p.subject) : `${dir} email`,
        subtitle: [p.status, dir].filter(Boolean).join(' · '),
        detail: p.body_text ? String(p.body_text).slice(0, 800) : null,
        info: truncateText(p.subject, 36) || '—',
        statusLabel: st.label,
        statusVariant: st.variant,
        actorName: p.sender_name || null,
      };
    }
    case 'opportunity_created':
      return {
        ...base,
        title: p.deal_name || 'Pipeline',
        subtitle: [p.stage_name, p.title].filter(Boolean).join(' · ') || 'New opportunity',
        info: formatMoney(p.amount ?? p.expected_revenue),
        statusLabel: 'Deal',
        statusVariant: 'purple',
        actorName: null,
      };
    case 'opportunity_updated':
      return {
        ...base,
        title: p.deal_name || 'Pipeline',
        subtitle: [p.stage_name, 'Updated'].filter(Boolean).join(' · '),
        info: truncateText(p.title, 40) || (p.amount != null || p.expected_revenue != null ? formatMoney(p.amount ?? p.expected_revenue) : '—'),
        statusLabel: 'Updated',
        statusVariant: 'purple',
        actorName: null,
      };
    default:
      return {
        ...base,
        title: p.summary || humanizeKey(ev.type),
        subtitle: cat,
        detail:
          p.payload_json && typeof p.payload_json === 'object'
            ? JSON.stringify(p.payload_json).slice(0, 220)
            : null,
        info: '—',
        statusLabel: 'Activity',
        statusVariant: 'slate',
        actorName: p.actor_name || null,
      };
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

function TimelineRefs({ ev, contactId, navigate, onViewCallAttempt, actionBtnClass }) {
  const refs = ev?.refs || {};
  const cid = contactId || refs.contact_id;

  const dialSid = refs.dialer_session_id || ev.payload?.dialer_session_id;
  const attemptId = refs.call_attempt_id || ev.payload?.id;

  const showCustomerCallHistory =
    Boolean(cid) &&
    (Boolean(refs.call_attempt_id) ||
      Boolean(refs.dialer_session_id) ||
      ev.type === 'call_attempt' ||
      String(ev.type || '').startsWith('dialer_session'));

  const parts = [];
  const ac = actionBtnClass || '';

  if (attemptId && ev.type === 'call_attempt') {
    parts.push(
      <Button
        key="att"
        type="button"
        size="xs"
        variant="ghost"
        className={ac}
        onClick={() => onViewCallAttempt?.(ev.payload)}
      >
        View call details
      </Button>
    );
  }
  if (dialSid) {
    parts.push(
      <Button
        key="ds"
        type="button"
        size="xs"
        variant="ghost"
        className={ac}
        onClick={() => navigate(`/dialer/session/${dialSid}`)}
      >
        Open dial session
      </Button>
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
        size="xs"
        variant="ghost"
        className={ac}
        onClick={() => navigate(`/whatsapp/messages?${waQ.toString()}`)}
      >
        Open WhatsApp message
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
        size="xs"
        variant="ghost"
        className={ac}
        onClick={() => navigate(`/email/sent?${emQ.toString()}`)}
      >
        Open email
      </Button>
    );
  }
  if (showCustomerCallHistory) {
    parts.push(
      <Button
        key="chist"
        type="button"
        size="xs"
        variant="ghost"
        className={ac}
        onClick={() => navigate(`/calls/history?contact_id=${encodeURIComponent(String(cid))}`)}
      >
        Call history (this customer)
      </Button>
    );
  }

  if (parts.length === 0) return null;
  return (
    <div className={styles.caRowActions} aria-label="Related actions">
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
  const tableScrollRef = useRef(null);
  /** Set true only after user scrolls (page or list); cleared when a fetch is triggered. Prevents auto-chaining pages. */
  const loadMoreUnlockRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const user = useAppSelector(selectUser);
  const dtMode = user?.datetimeDisplayMode ?? 'ist_fixed';
  const { canAny } = usePermissions();
  const canCallHistory = canAny([PERMISSIONS.DIAL_EXECUTE, PERMISSIONS.DIAL_MONITOR]);
  const canBrowseCrm = canAny([PERMISSIONS.LEADS_READ, PERMISSIONS.CONTACTS_READ]);
  const [activityFilter, setActivityFilter] = useState('all');
  const [_relTick, setRelTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setRelTick((x) => x + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  const contact = bundle?.contact;
  const crmPath = useMemo(() => {
    if (!contact?.id) return null;
    return contact.type === 'lead' ? `/leads/${contact.id}` : `/contacts/${contact.id}`;
  }, [contact]);

  const rawTimeline = bundle?.timeline;
  const filteredTimelineRows = useMemo(() => {
    const rows = Array.isArray(rawTimeline) ? rawTimeline : [];
    if (activityFilter === 'all') return rows;
    return rows.filter((ev) => contactTimelineFilterBucket(ev.type) === activityFilter);
  }, [rawTimeline, activityFilter]);

  const lazyTimeline = timelineMeta != null;

  useEffect(() => {
    loadingMoreRef.current = Boolean(timelineMeta?.loadingMore);
  }, [timelineMeta?.loadingMore]);

  useEffect(() => {
    loadMoreUnlockRef.current = false;
  }, [bundle?.contact?.id, activityFilter]);

  useEffect(() => {
    if (!lazyTimeline || !timelineMeta?.loaded || !timelineMeta?.hasMore) return undefined;
    const arm = () => {
      loadMoreUnlockRef.current = true;
    };
    window.addEventListener('scroll', arm, { passive: true });
    const root = tableScrollRef.current;
    if (root) root.addEventListener('scroll', arm, { passive: true });
    return () => {
      window.removeEventListener('scroll', arm);
      if (root) root.removeEventListener('scroll', arm);
    };
  }, [
    lazyTimeline,
    timelineMeta?.loaded,
    timelineMeta?.hasMore,
    activityFilter,
    rawTimeline,
  ]);

  useEffect(() => {
    if (!lazyTimeline || !timelineMeta?.loaded || !timelineMeta?.hasMore || !onLoadMoreTimeline) {
      return undefined;
    }
    const root = tableScrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting || !loadMoreUnlockRef.current || loadingMoreRef.current) return;
        loadMoreUnlockRef.current = false;
        onLoadMoreTimeline();
      },
      { root, rootMargin: '0px 0px 32px 0px', threshold: 0 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [
    lazyTimeline,
    timelineMeta?.loaded,
    timelineMeta?.hasMore,
    onLoadMoreTimeline,
    rawTimeline,
    activityFilter,
  ]);

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
        <Alert variant="error" display="inline">
          {error}
        </Alert>
      </div>
    );
  }

  if (!contact) return null;

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const tagLine = tags.length
    ? tags
        .map((t) => t?.name || t?.label)
        .filter(Boolean)
        .join(', ')
    : '';

  const callsTotal = bundle?.callsPagination?.total ?? bundle?.calls?.length ?? 0;
  const callsLoaded = bundle?.calls?.length ?? 0;
  const callsTruncated = Boolean(bundle?.callsTruncated) || callsTotal > callsLoaded;
  const timelineRows = Array.isArray(rawTimeline) ? rawTimeline : [];
  const showCallsHint = !lazyTimeline || timelineMeta?.loaded;

  return (
    <div className={styles.wrap}>
      <section className={styles.overviewCard} aria-labelledby="contact-activity-overview-title">
        <div className={styles.overviewTop}>
          <div>
            <div className={styles.titleRow}>
              <h2 id="contact-activity-overview-title" className={styles.name}>
                {contact.display_name || 'Record'}
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
          Activity
        </h3>
        <p className={styles.hint}>
          Newest first — each row shows what happened, current status, extra context, who was involved, and how long ago.
          Use the action buttons to open dial sessions, call details, or messages.
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

        {(!lazyTimeline || timelineMeta.loaded) && timelineRows.length > 0 ? (
          <div className={styles.caFeedPanel}>
            <div className={styles.caFeedHead}>
              <div className={styles.caTabs} role="tablist" aria-label="Filter activity timeline">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'calls', label: 'Calls' },
                  { id: 'dialer', label: 'Dialer' },
                  { id: 'messages', label: 'Messages' },
                  { id: 'crm', label: 'CRM' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={activityFilter === t.id}
                    className={`${styles.caTab} ${activityFilter === t.id ? styles.caTabActive : ''}`.trim()}
                    onClick={() => setActivityFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTimelineRows.length === 0 ? (
              <p className={styles.caFeedEmpty}>No events in this category.</p>
            ) : (
              <div ref={tableScrollRef} className={styles.caTableScroll}>
                <table className={styles.caTable}>
                  <thead>
                    <tr>
                      <th className={styles.caTh}>Activity</th>
                      <th className={styles.caTh}>Status</th>
                      <th className={styles.caTh}>Member</th>
                      <th className={`${styles.caTh} ${styles.caThInfo}`.trim()}>Info</th>
                      <th className={`${styles.caTh} ${styles.caThWhen}`.trim()}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTimelineRows.map((ev, idx) => {
                      const row = contactTimelineRowModel(ev);
                      const statusClass =
                        {
                          teal: styles.caStatusTeal,
                          blue: styles.caStatusBlue,
                          purple: styles.caStatusPurple,
                          amber: styles.caStatusAmber,
                          rose: styles.caStatusRose,
                          slate: styles.caStatusSlate,
                        }[row.statusVariant] || styles.caStatusSlate;
                      const memberName = row.actorName?.trim() || '—';
                      const hue = avatarHueFromString(memberName);
                      const iconWrapCls = styles[row.iconWrap] || styles.caIconCrm;
                      return (
                        <tr key={`tl-${idx}-${ev.type}-${ev.at || ''}`} className={styles.caTr}>
                          <td className={styles.caTd}>
                            <div className={styles.caDetailCell}>
                              <div className={`${styles.caIconWrap} ${iconWrapCls}`.trim()}>
                                <MaterialSymbol name={row.iconName} size="sm" className={styles.caIconGlyph} />
                              </div>
                              <div className={styles.caDetailText}>
                                <span className={styles.caRowTitle}>{row.title}</span>
                                <span className={styles.caRowSubtitle}>{row.subtitle}</span>
                                <span className={styles.caWhenMobile} title={formatDateTimeDisplay(ev.at, dtMode)}>
                                  {formatRelativeTimeShort(ev.at)}
                                </span>
                                {row.detail ? (
                                  <span className={styles.caRowDetail}>{row.detail}</span>
                                ) : null}
                                <TimelineRefs
                                  ev={ev}
                                  contactId={contact.id}
                                  navigate={navigate}
                                  onViewCallAttempt={onViewCallAttempt}
                                  actionBtnClass={styles.caGhostBtn}
                                />
                              </div>
                            </div>
                          </td>
                          <td className={styles.caTd}>
                            <span className={`${styles.caStatus} ${statusClass}`.trim()}>{row.statusLabel}</span>
                          </td>
                          <td className={styles.caTd}>
                            <div className={styles.caMember}>
                              <span
                                className={styles.caAvatar}
                                style={{
                                  background: `linear-gradient(135deg, hsl(${hue}, 58%, 42%) 0%, hsl(${(hue + 40) % 360}, 52%, 32%) 100%)`,
                                }}
                                aria-hidden
                              >
                                {initialsFromName(memberName === '—' ? '' : memberName)}
                              </span>
                              <span className={styles.caMemberName}>{memberName}</span>
                            </div>
                          </td>
                          <td className={`${styles.caTd} ${styles.caTdInfo}`.trim()}>
                            <span className={styles.caValue}>{row.info}</span>
                          </td>
                          <td className={`${styles.caTd} ${styles.caTdWhen}`.trim()}>
                            <time
                              className={styles.caWhen}
                              dateTime={ev.at || undefined}
                              title={formatDateTimeDisplay(ev.at, dtMode)}
                            >
                              {formatRelativeTimeShort(ev.at)}
                            </time>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lazyTimeline && timelineMeta?.loaded && timelineMeta.hasMore ? (
                  <>
                    <div ref={sentinelRef} className={styles.caInfiniteSentinel} aria-hidden />
                    {timelineMeta.loadingMore ? (
                      <div className={styles.caPanelLoadingRow} aria-busy="true">
                        <Spinner size="sm" /> Loading more…
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}

            {timelineRows.length > 0 && (!lazyTimeline || timelineMeta?.loaded) ? (
              <p className={styles.caPanelMeta}>
                Showing {filteredTimelineRows.length}
                {activityFilter !== 'all' ? ' (filtered)' : ''} of {timelineRows.length} loaded
                {lazyTimeline && timelineMeta?.hasMore ? ' · scroll the list to load more' : ''}
              </p>
            ) : null}

            {canCallHistory || canBrowseCrm ? (
              <div className={styles.caFeedFooter}>
                {canCallHistory ? (
                  <Link
                    to={`/calls/history?contact_id=${encodeURIComponent(String(contact.id))}`}
                    className={styles.caFooterLink}
                  >
                    Call history for this record →
                  </Link>
                ) : null}
                {canBrowseCrm ? (
                  <Link to="/leads" className={styles.caFooterLink}>
                    Browse leads →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
