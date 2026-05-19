import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { DateTimePickerField } from '../components/ui/DateTimePickerField';
import { formatDateTimeLocalInputValue } from '../components/ui/dateTimePickerUtils';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { SlidePanel } from '../components/ui/SlidePanel';
import { callsAPI } from '../services/callsAPI';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { dealsAPI } from '../services/dealsAPI';
import { contactsAPI } from '../services/contactsAPI';
import { dialerWorkspaceConfigAPI, mergeDialerWorkspaceConfig } from '../services/dialerWorkspaceConfigAPI';
import { selectPermissions } from '../features/auth/authSelectors';
import { hasPermission, PERMISSIONS } from '../utils/permissionUtils';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { scheduleHubAPI } from '../services/scheduleHubAPI';
import { meetingsAPI } from '../services/meetingsAPI';
import { emailAccountsAPI } from '../services/emailAPI';
import { escapeHtml, extractTemplateKeys, htmlToPlainText, renderScriptHtml } from '../utils/callScriptHtml';
import { useToast } from '../context/ToastContext';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_NATIONAL_MAX_DIGITS,
  buildE164FromParts,
  clampNationalDigits,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
} from '../utils/phoneInput';
import {
  attemptHasDialerVisibleHistory,
  buildAttemptHistoryEntries,
  sanitizeAttemptNotesForDisplay,
} from '../utils/callAttemptNotesDisplay';
import { localDateTimeInputToUtcMysql } from '../utils/meetingDateTime';
import {
  DEFAULT_MEETING_TIMEZONE,
  addMinutesToCivilDateTimeLocalString,
  civilDateTimeLocalStringToUtcMs,
  civilDateTimeNowPlusMinutesInZone,
} from '../utils/meetingTimezone';
import { COMMON_TIMEZONE_OPTIONS } from '../utils/dateTimeDisplay';
import { DialerCreditsBar } from '../components/dialer/DialerCreditsBar';
import { DialerFlowLayout } from '../components/dialer/DialerFlowLayout';
import { DialerIcon } from '../components/dialer/DialerIcon';
import { getDialerTheme, persistDialerTheme } from '../components/dialer/dialerTheme';
import { getNextActionLabel } from '../features/disposition/constants';
import styles from './DialerSessionPage.module.scss';

/** Display-only: maps `contact_phones.label` ENUM (and primary) to a short title. */
function formatPhoneLabel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'primary') return 'Primary';
  const map = {
    mobile: 'Mobile',
    work: 'Work',
    home: 'Home',
    whatsapp: 'WhatsApp',
    other: 'Other',
  };
  return map[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
}

/** Matches `contact_phones.label` ENUM — one row per type per contact. */
const CONTACT_PHONE_LABEL_ENUM = ['mobile', 'home', 'work', 'whatsapp', 'other'];
/** Collapsed queue preview rows before "View all". */
const DIAL_QUEUE_PREVIEW_COUNT = 3;

/** Icon + short hint for disposition next-action (dialer outcomes column). */
function dispositionNextActionMeta(disposition) {
  if (disposition?.requires_deal_selection) {
    return { icon: 'briefcase', hint: 'Choose pipeline' };
  }
  const na = String(disposition?.next_action || '')
    .trim()
    .toLowerCase();
  switch (na) {
    case 'next_number':
      return { icon: 'phoneNext', hint: 'Next number on lead' };
    case 'next_contact':
      return { icon: 'user', hint: 'Next lead in queue' };
    case 'stop':
      return { icon: 'stop', hint: 'Stop dialing' };
    case 'end_session':
      return { icon: 'flag', hint: 'End session' };
    case 'pause':
      return { icon: 'pause', hint: 'Pause session' };
    case 'stay':
      return { icon: 'pin', hint: 'Stay on this lead' };
    case 'schedule_callback':
      return { icon: 'calendar', hint: 'Schedule callback' };
    default:
      return na
        ? { icon: 'arrowRight', hint: getNextActionLabel(na) }
        : { icon: null, hint: '' };
  }
}

function formatDialerHistoryLine(row, formatDateTime) {
  const when = formatDateTime?.(row.started_at || row.created_at) ?? '—';
  const agent = row.agent_name?.trim() || '—';
  const phone = row.phone_e164?.trim() || '—';
  const dispo = row.disposition_name?.trim() || null;
  const noteRaw = row.notes != null ? String(row.notes) : '';
  const noteClean = sanitizeAttemptNotesForDisplay(noteRaw);
  const note = noteClean.length ? noteClean : null;
  const summary = [dispo, note].filter(Boolean).join(' — ') || '—';
  return `— ${when} by ${agent} — ${phone} — ${summary}`;
}

function formatDialerHistoryEntryLine(row, entry, formatDateTime) {
  const when = formatDateTime?.(entry?.whenIso || row.started_at || row.created_at) ?? '—';
  const agent = row.agent_name?.trim() || '—';
  const phone = row.phone_e164?.trim() || '—';
  const text = entry?.text != null && String(entry.text).trim() ? String(entry.text).trim() : '—';
  return `— ${when} by ${agent} — ${phone} — ${text}`;
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
  if (name === 'phone') {
    return (
      <svg {...common} aria-hidden="true">
        <path
          {...stroke}
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        />
      </svg>
    );
  }
  if (name === 'plus') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === 'pencil') {
    return (
      <svg {...common} aria-hidden="true">
        <path
          {...stroke}
          d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        />
      </svg>
    );
  }
  if (name === 'info') {
    return (
      <svg {...common} aria-hidden="true">
        <circle {...stroke} cx="12" cy="12" r="10" />
        <path {...stroke} d="M12 16v-5M12 8h.01" />
      </svg>
    );
  }
  if (name === 'chevronDown') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M6 9l6 6 6-6" />
      </svg>
    );
  }
  if (name === 'chevronUp') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M18 15l-6-6-6 6" />
      </svg>
    );
  }
  if (name === 'external') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <path {...stroke} d="M15 3h6v6M10 14L21 3" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (name === 'x') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle {...stroke} cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (name === 'phoneNext') {
    return (
      <svg {...common} aria-hidden="true">
        <path
          {...stroke}
          d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"
        />
      </svg>
    );
  }
  if (name === 'flag') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M4 22V4" />
        <path {...stroke} d="M4 5h12l-2 4 2 4H4" />
      </svg>
    );
  }
  if (name === 'pin') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" />
        <circle {...stroke} cx="12" cy="11" r="2.5" />
      </svg>
    );
  }
  if (name === 'briefcase') {
    return (
      <svg {...common} aria-hidden="true">
        <rect {...stroke} x="2" y="7" width="20" height="14" rx="2" />
        <path {...stroke} d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg {...common} aria-hidden="true">
        <rect {...stroke} x="3" y="4" width="18" height="18" rx="2" />
        <path {...stroke} d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (name === 'arrowRight') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }
  if (name === 'mail') {
    return (
      <svg {...common} aria-hidden="true">
        <rect {...stroke} x="3" y="5" width="18" height="14" rx="2" />
        <path {...stroke} d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (name === 'building') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg {...common} aria-hidden="true">
        <circle {...stroke} cx="12" cy="12" r="9" />
        <path {...stroke} d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (name === 'users') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
        <circle {...stroke} cx="9" cy="7" r="3" />
        <path {...stroke} d="M22 19v-1a3 3 0 0 0-2-2.83M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === 'link') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path {...stroke} d="M14 11a5 5 0 0 0-7.54-.54l-2.92 2.92a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  if (name === 'hourglass') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M6 2h12M6 22h12M8 2v4l4 5-4 5v4M16 2v4l-4 5 4 5v4" />
      </svg>
    );
  }
  return null;
}

function PreflightRow({ icon, label, value, tone = 'violet' }) {
  return (
    <div className={styles.preflightRow} data-tone={tone}>
      <span className={styles.preflightIcon} aria-hidden="true">
        <DialerIcon name={icon} size={20} />
      </span>
      <div className={styles.preflightRowCopy}>
        <span className={styles.preflightKey}>{label}</span>
        <span className={styles.preflightVal}>{value}</span>
      </div>
    </div>
  );
}

function SummaryStatCard({ icon, label, value, tone = 'violet' }) {
  return (
    <div className={styles.summaryItem} data-tone={tone}>
      <span className={styles.summaryIcon} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div className={styles.summaryStatCopy}>
        <div className={styles.summaryLabel}>{label}</div>
        <div className={styles.summaryValue}>{value}</div>
      </div>
    </div>
  );
}

function MetricCell({ icon, label, value }) {
  return (
    <div className={styles.metricCell}>
      <div className={styles.metricLabel}>
        <span className={styles.metricLabelInner}>
          {icon ? <Icon name={icon} /> : null}
          <span>{label}</span>
        </span>
      </div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}

function ContactMetaLabel({ icon, children }) {
  return (
    <dt className={styles.metaLabel}>
      <span className={styles.metaLabelInner}>
        {icon ? <Icon name={icon} /> : null}
        <span>{children}</span>
      </span>
    </dt>
  );
}

function normItemState(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function resolveCurrentItem(items = []) {
  return items.find((i) => i.state === 'calling') || items.find((i) => i.state === 'queued') || null;
}

function coerceAttemptId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isProviderReauthError(errorLike) {
  return String(errorLike?.response?.data?.code || '').trim() === 'PROVIDER_REAUTH_REQUIRED';
}

/** Dispositions are UUID strings (CHAR(36)); never use Number() — Number(uuid) is NaN. */
function coerceDispositionId(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 36) return null;
  return s;
}

function resolveLastAttemptId(items = []) {
  const active = items.find((i) => i.state === 'calling' && coerceAttemptId(i.last_attempt_id));
  const activeId = coerceAttemptId(active?.last_attempt_id);
  if (activeId) return activeId;
  const last = [...items].reverse().find((i) => coerceAttemptId(i.last_attempt_id));
  return coerceAttemptId(last?.last_attempt_id);
}

export function DialerSessionPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);
  const permissions = useAppSelector(selectPermissions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [addPhoneLabel, setAddPhoneLabel] = useState('');
  const [addPhoneCountryCode, setAddPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [addPhoneValue, setAddPhoneValue] = useState('');
  /** Bumps when POST /next applies session — stale in-flight GET /session must not overwrite. */
  const loadEpochRef = useRef(0);
  const callNotesHydrateEpochRef = useRef(0);
  const callNextInFlightRef = useRef(false);
  /** If session payload ever lacks last_attempt_id on a calling row, still allow dispo until refetch. */
  const pendingAttemptFromNextRef = useRef(null);
  const [templateSample, setTemplateSample] = useState(null);
  const [activeTemplateKeys, setActiveTemplateKeys] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [dealPickDispo, setDealPickDispo] = useState(null);
  const [dealPickDealId, setDealPickDealId] = useState('');
  const [dealPickStageId, setDealPickStageId] = useState('');
  /** Saved on contact_call_attempts when setting disposition (not the same as contact-level notes). */
  const [callNotes, setCallNotes] = useState('');
  const [dialWorkspaceTab, setDialWorkspaceTab] = useState('script');
  const [dialerTheme, setDialerTheme] = useState(() => getDialerTheme());
  const setDialerThemeAndPersist = useCallback((next) => {
    setDialerTheme(next);
    persistDialerTheme(next);
  }, []);
  const [openDialContactNotes, setOpenDialContactNotes] = useState(true);
  const [openDialCallNotes, setOpenDialCallNotes] = useState(true);
  const [openDialPrevHistory, setOpenDialPrevHistory] = useState(true);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [queueShowAll, setQueueShowAll] = useState(false);
  const [contactNotesDraft, setContactNotesDraft] = useState('');
  const [callHistoryRows, setCallHistoryRows] = useState([]);
  const [savingDialCallNotes, setSavingDialCallNotes] = useState(false);
  const [savingDialContactNotes, setSavingDialContactNotes] = useState(false);
  const [dialerWorkspaceConfigRaw, setDialerWorkspaceConfigRaw] = useState(null);
  const [contactPanelEditing, setContactPanelEditing] = useState(false);
  const [contactEditDraft, setContactEditDraft] = useState({
    display_name: '',
    email: '',
    company: '',
    job_title: '',
    city: '',
  });
  const [savingContactEdit, setSavingContactEdit] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [dispositionActionFlow, setDispositionActionFlow] = useState(null);
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [actionModalSaving, setActionModalSaving] = useState(false);
  const [actionModalError, setActionModalError] = useState('');
  const [actionModalNeedsReconnect, setActionModalNeedsReconnect] = useState(false);
  const [callbackForm, setCallbackForm] = useState({
    assigned_user_id: '',
    scheduled_at: '',
    notes: '',
  });
  const [meetingForm, setMeetingForm] = useState({
    email_account_id: '',
    assigned_user_id: '',
    meeting_owner_user_id: '',
    meeting_platform: 'google_meet',
    meeting_duration_min: '30',
    title: '',
    attendee_email: '',
    start_at: '',
    end_at: '',
    location: '',
    description: '',
    meeting_timezone: DEFAULT_MEETING_TIMEZONE,
  });
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
  /** Dial workspace (metrics, lead strip, tabs) only after a successful Start session / Call next, or an in-flight session from the server. */
  const [dialWorkspaceUnlocked, setDialWorkspaceUnlocked] = useState(() => requestedStep !== 'preflight');

  useEffect(() => {
    if (requestedStep === 'preflight') setView('preflight');
  }, [requestedStep]);

  useEffect(() => {
    setDialWorkspaceUnlocked(requestedStep !== 'preflight');
  }, [id, requestedStep]);

  useEffect(() => {
    if (!id) return;
    try {
      sessionStorage.setItem(`dialerTimer:${id}`, JSON.stringify(uiTimer));
    } catch {
      // ignore
    }
  }, [id, uiTimer]);

  useEffect(() => {
    if (!session) {
      setPipelines([]);
      return;
    }
    let cancelled = false;
    dealsAPI
      .list({ include_inactive: false })
      .then((res) => {
        if (!cancelled) setPipelines(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) setPipelines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const dealPickPipeline = useMemo(
    () => pipelines.find((p) => String(p.id) === String(dealPickDealId)),
    [pipelines, dealPickDealId]
  );
  const dealPickStageOptions = useMemo(
    () =>
      (dealPickPipeline?.stages || []).map((s) => ({
        value: String(s.id),
        label: s.name,
      })),
    [dealPickPipeline]
  );
  const pipelineOptions = useMemo(
    () => pipelines.map((p) => ({ value: String(p.id), label: p.name })),
    [pipelines]
  );

  const items = useMemo(
    () =>
      (session?.items || []).map((row) => ({
        ...row,
        state: normItemState(row.state),
      })),
    [session?.items]
  );
  const queueHasMoreThanPreview = items.length > DIAL_QUEUE_PREVIEW_COUNT;
  const queueDisplayItems = useMemo(() => {
    if (!queueExpanded) return [];
    if (queueShowAll) return items;
    return items.slice(0, DIAL_QUEUE_PREVIEW_COUNT);
  }, [items, queueExpanded, queueShowAll]);

  const toggleQueueExpanded = useCallback(() => {
    setQueueExpanded((expanded) => {
      if (expanded) setQueueShowAll(false);
      return !expanded;
    });
  }, []);

  const currentItem = useMemo(() => resolveCurrentItem(items), [items]);

  const lastAttemptId = useMemo(() => {
    const fromItems = resolveLastAttemptId(items);
    if (fromItems) {
      pendingAttemptFromNextRef.current = null;
      return fromItems;
    }
    const hasCalling = items.some((i) => i.state === 'calling');
    if (!hasCalling) {
      pendingAttemptFromNextRef.current = null;
      return null;
    }
    return pendingAttemptFromNextRef.current || null;
  }, [items]);

  const reloadCallHistory = useCallback(async () => {
    const cid = currentItem?.contact_id;
    if (!cid) {
      setCallHistoryRows([]);
      return;
    }
    try {
      const res = await callsAPI.list({
        contact_id: cid,
        page: 1,
        limit: 30,
        meaningful_only: true,
      });
      setCallHistoryRows(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      setCallHistoryRows([]);
    }
  }, [currentItem?.contact_id]);

  useEffect(() => {
    setContactNotesDraft(contact?.notes != null ? String(contact.notes) : '');
  }, [contact?.id, contact?.notes]);

  useEffect(() => {
    let cancelled = false;
    const cid = currentItem?.contact_id;
    const aid = lastAttemptId;
    const epoch = ++callNotesHydrateEpochRef.current;
    if (!cid || !aid) {
      if (!cancelled) setCallNotes('');
      return;
    }
    (async () => {
      try {
        const res = await callsAPI.list({ contact_id: cid, limit: 50, page: 1 });
        const rows = res?.data?.data ?? [];
        const row = rows.find((r) => Number(r.id) === Number(aid));
        if (cancelled || epoch !== callNotesHydrateEpochRef.current) return;
        setCallNotes(sanitizeAttemptNotesForDisplay(row?.notes != null ? String(row.notes) : ''));
      } catch {
        if (cancelled || epoch !== callNotesHydrateEpochRef.current) return;
        setCallNotes('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastAttemptId, currentItem?.contact_id]);

  /** Script tab only: hide attempts that only exist from "Call next" with no dispo and no saved notes. */
  const previousCallLogRows = useMemo(
    () => callHistoryRows.filter((r) => attemptHasDialerVisibleHistory(r)),
    [callHistoryRows]
  );

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
    const oi = Number(currentItem.order_index);
    if (Number.isFinite(oi) && oi >= 0) return oi + 1;
    const idx = items.findIndex((it) => it.id === currentItem.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [items, currentItem]);

  const activeDialPhone = useMemo(() => {
    if (!currentItem) return '';
    if (currentItem.state === 'calling') {
      return (
        currentItem.attempt_phone ||
        currentItem.selected_phone ||
        currentItem.primary_phone ||
        ''
      );
    }
    return currentItem.selected_phone || currentItem.primary_phone || '';
  }, [currentItem]);

  const phonesList = useMemo(() => {
    if (Array.isArray(contact?.phones) && contact.phones.length > 0) {
      return [...contact.phones].sort((a, b) => {
        const pa = Number(a.is_primary) === 1 ? 1 : 0;
        const pb = Number(b.is_primary) === 1 ? 1 : 0;
        if (pb !== pa) return pb - pa;
        return Number(a.id) - Number(b.id);
      });
    }
    if (currentItem?.primary_phone) {
      return [
        {
          id: 'synthetic-primary',
          phone: currentItem.primary_phone,
          label: 'primary',
          is_primary: 1,
        },
      ];
    }
    return [];
  }, [contact?.phones, currentItem?.primary_phone]);

  const usedPhoneLabels = useMemo(() => {
    const phones = contact?.phones;
    if (!Array.isArray(phones)) return new Set();
    const s = new Set();
    for (const p of phones) {
      const k = String(p.label || '').trim().toLowerCase();
      if (k) s.add(k);
    }
    return s;
  }, [contact?.phones]);

  const missingPhoneLabels = useMemo(
    () => CONTACT_PHONE_LABEL_ENUM.filter((l) => !usedPhoneLabels.has(l)),
    [usedPhoneLabels]
  );

  const canAddPhoneNumber = Boolean(currentItem?.contact_id) && missingPhoneLabels.length > 0;

  /** Merge full contact (API) with queue row so name/phone always show even if getById fails. */
  const leadContact = useMemo(() => {
    const row = currentItem;
    const c = contact;
    if (!row && !c) return null;
    const displayName =
      c?.display_name || row?.display_name || c?.first_name || c?.email || '';
    const firstName =
      c?.first_name ||
      (displayName ? String(displayName).trim().split(/\s+/)[0] : '') ||
      undefined;
    return {
      ...(c || {}),
      display_name: displayName,
      first_name: firstName,
      last_name: c?.last_name,
      primary_phone: activeDialPhone || c?.primary_phone || row?.primary_phone || '',
      email: c?.email,
      company: c?.company,
      job_title: c?.job_title,
      city: c?.city,
      notes: c?.notes,
      id: c?.id ?? row?.contact_id,
    };
  }, [contact, currentItem, activeDialPhone]);

  const contactInitial = useMemo(() => {
    const raw = leadContact?.display_name || leadContact?.email || '';
    const c = String(raw).trim().charAt(0);
    return c ? c.toUpperCase() : '?';
  }, [leadContact]);

  const contactDetailPending = Boolean(!contact && currentItem?.contact_id);

  const leadSubtitle = useMemo(() => {
    const parts = [leadContact?.company, leadContact?.job_title].filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  }, [leadContact]);

  const dialerWorkspaceFlags = useMemo(
    () => mergeDialerWorkspaceConfig(dialerWorkspaceConfigRaw),
    [dialerWorkspaceConfigRaw]
  );

  const canEditCurrentContactInDialer = useMemo(() => {
    if (!dialerWorkspaceFlags.allow_edit_contact_in_session) return false;
    if (!contact || contactDetailPending) return false;
    const t = String(contact.type || '').toLowerCase();
    if (t === 'lead') return hasPermission(user, PERMISSIONS.LEADS_UPDATE, permissions);
    if (t === 'contact') return hasPermission(user, PERMISSIONS.CONTACTS_UPDATE, permissions);
    return (
      hasPermission(user, PERMISSIONS.LEADS_UPDATE, permissions) ||
      hasPermission(user, PERMISSIONS.CONTACTS_UPDATE, permissions)
    );
  }, [
    dialerWorkspaceFlags.allow_edit_contact_in_session,
    contact,
    contactDetailPending,
    user,
    permissions,
  ]);

  const openContactEdit = useCallback(() => {
    setContactEditDraft({
      display_name: leadContact?.display_name != null ? String(leadContact.display_name) : '',
      email: leadContact?.email != null ? String(leadContact.email) : '',
      company: leadContact?.company != null ? String(leadContact.company) : '',
      job_title: leadContact?.job_title != null ? String(leadContact.job_title) : '',
      city: leadContact?.city != null ? String(leadContact.city) : '',
    });
    setContactPanelEditing(true);
  }, [leadContact]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await dialerWorkspaceConfigAPI.get();
        if (!cancelled) setDialerWorkspaceConfigRaw(res?.data?.data ?? null);
      } catch {
        if (!cancelled) setDialerWorkspaceConfigRaw(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dialerWorkspaceFlags.show_activity_tab && dialWorkspaceTab === 'activity') {
      setDialWorkspaceTab('script');
    }
    if (!dialerWorkspaceFlags.show_email_tab && dialWorkspaceTab === 'email') {
      setDialWorkspaceTab('script');
    }
    if (!dialerWorkspaceFlags.show_website_tab && dialWorkspaceTab === 'website') {
      setDialWorkspaceTab('script');
    }
  }, [
    dialerWorkspaceFlags.show_activity_tab,
    dialerWorkspaceFlags.show_email_tab,
    dialerWorkspaceFlags.show_website_tab,
    dialWorkspaceTab,
  ]);

  useEffect(() => {
    setContactPanelEditing(false);
  }, [currentItem?.contact_id]);

  const sessionEnded = session?.status === 'completed' || session?.status === 'cancelled';

  useEffect(() => {
    if (!session || sessionEnded) return;
    const st = String(session.status || '').toLowerCase();
    if (st !== 'ready') setDialWorkspaceUnlocked(true);
  }, [session?.id, session?.status, sessionEnded]);

  const exitToCallHistory = location.state?.fromCallHistory === true;
  const leaveDialSession = useCallback(() => {
    if (exitToCallHistory && id) {
      navigate(`/calls/history?dialer_session_id=${encodeURIComponent(String(id))}`);
      return;
    }
    navigate('/dialer');
  }, [exitToCallHistory, id, navigate]);
  const leaveDialSessionDoneLabel = exitToCallHistory ? 'Done — back to call history' : 'Done — back to leads';

  useEffect(() => {
    if (!session || sessionEnded) {
      setCallHistoryRows([]);
      return;
    }
    reloadCallHistory();
  }, [session?.id, sessionEnded, reloadCallHistory, session]);

  const sessionDisplayNo = useMemo(() => {
    const n = Number(session?.user_session_no);
    if (Number.isFinite(n) && n >= 1) return n;
    return null;
  }, [session?.user_session_no]);

  const { showToast } = useToast();

  /** Live dial workspace: no inline alert bar — surface messages as fixed toasts (ToastContext). */
  useEffect(() => {
    if (!error || !session || sessionEnded) return;
    const m = String(error).toLowerCase();
    const variant = m.includes('paused') || m.includes('not active') ? 'warning' : 'error';
    showToast(error, variant);
    setError('');
  }, [error, session, sessionEnded, showToast]);

  const errorAlertVariant = useMemo(() => {
    const m = String(error || '').toLowerCase();
    if (m.includes('paused') || m.includes('not active')) return 'warning';
    return 'error';
  }, [error]);

  const showErrorOutside = Boolean(error && (!session || sessionEnded));

  useEffect(() => {
    if (!uiTimer?.startedAtMs) return;
    if (uiTimer?.pausedAtMs) return;
    if (session?.ended_at) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [uiTimer?.startedAtMs, uiTimer?.pausedAtMs, session?.ended_at]);

  const durationMs = useMemo(() => {
    const now = Date.now();
    if (sessionEnded) {
      const sec = Number(session?.duration_sec);
      if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
      const s = session?.started_at ? new Date(session.started_at).getTime() : NaN;
      const e = session?.ended_at ? new Date(session.ended_at).getTime() : NaN;
      const pausedMs = Number(session?.paused_seconds || 0) * 1000;
      if (Number.isFinite(s) && Number.isFinite(e)) return Math.max(0, e - s - pausedMs);
      return 0;
    }
    const uiStart = Number(uiTimer?.startedAtMs || 0);
    if (uiStart) {
      const endMs = session?.ended_at ? new Date(session.ended_at).getTime() : now;
      const pausedTotalMs = Number(uiTimer?.pausedTotalMs || 0);
      const extraPausedMs = uiTimer?.pausedAtMs ? Math.max(0, now - Number(uiTimer.pausedAtMs)) : 0;
      return Math.max(0, endMs - uiStart - pausedTotalMs - extraPausedMs);
    }
    const serverStart = session?.started_at ? new Date(session.started_at).getTime() : NaN;
    if (!Number.isFinite(serverStart)) return 0;
    const endMs = session?.ended_at ? new Date(session.ended_at).getTime() : now;
    const pausedSec = Number(session?.paused_seconds || 0);
    let pauseExtraMs = 0;
    if (session?.paused_at) {
      pauseExtraMs = Math.max(0, now - new Date(session.paused_at).getTime());
    }
    return Math.max(0, endMs - serverStart - pausedSec * 1000 - pauseExtraMs);
  }, [
    sessionEnded,
    session?.duration_sec,
    session?.started_at,
    session?.ended_at,
    session?.paused_seconds,
    session?.paused_at,
    uiTimer?.startedAtMs,
    uiTimer?.pausedTotalMs,
    uiTimer?.pausedAtMs,
    tick,
  ]);

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

  const saveContactEdits = useCallback(async () => {
    const cid = contact?.id ?? currentItem?.contact_id;
    if (!cid) return;
    const name = String(contactEditDraft.display_name || '').trim();
    if (!name) {
      showToast('Display name is required', 'error');
      return;
    }
    setSavingContactEdit(true);
    try {
      await contactsAPI.update(cid, {
        display_name: name,
        email: String(contactEditDraft.email || '').trim() || null,
        company: String(contactEditDraft.company || '').trim() || null,
        job_title: String(contactEditDraft.job_title || '').trim() || null,
        city: String(contactEditDraft.city || '').trim() || null,
      });
      const res = await contactsAPI.getById(cid);
      setContact(res?.data?.data ?? null);
      setContactPanelEditing(false);
      showToast('Contact saved', 'success');
      await load();
    } catch (e) {
      showToast(e?.response?.data?.error || e?.message || 'Save failed', 'error');
    } finally {
      setSavingContactEdit(false);
    }
  }, [
    contact?.id,
    currentItem?.contact_id,
    contactEditDraft.display_name,
    contactEditDraft.email,
    contactEditDraft.company,
    contactEditDraft.job_title,
    contactEditDraft.city,
    showToast,
    load,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAddPhoneOpen(false);
    setAddPhoneValue('');
    setAddPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
  }, [currentItem?.contact_id]);

  useEffect(() => {
    if (!addPhoneOpen || missingPhoneLabels.length === 0) return;
    setAddPhoneLabel((prev) => (missingPhoneLabels.includes(prev) ? prev : missingPhoneLabels[0]));
  }, [addPhoneOpen, missingPhoneLabels]);

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
    scheduleHubAPI
      .meta()
      .then((res) => {
        if (!cancelled) setTeamMembers(res?.data?.data?.teamMembers ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    emailAccountsAPI
      .getAll(false)
      .then((res) => {
        if (!cancelled) setEmailAccounts(Array.isArray(res?.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) setEmailAccounts([]);
      });
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

  const dialScriptRenderedHtml = useMemo(
    () =>
      renderScriptHtml(session?.script?.script_body, leadContact, user, tenant, templateSample),
    [session?.script?.script_body, leadContact, user, tenant, templateSample]
  );

  const dialScriptPlainText = useMemo(
    () => htmlToPlainText(dialScriptRenderedHtml),
    [dialScriptRenderedHtml]
  );

  const openDialScriptPopout = useCallback(() => {
    const html = String(dialScriptRenderedHtml || '').trim();
    const plain = String(dialScriptPlainText || '').trim();
    if (!html && !plain) return;

    const bodyContent = html
      ? html
      : `<p>${escapeHtml(plain).replace(/\r\n|\r|\n/g, '<br />')}</p>`;

    const title = escapeHtml(session?.script?.script_name || 'Call script');
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f1f5f9; color: #0f172a; }
    .wrap { max-width: 720px; margin: 24px auto; padding: 16px; }
    .paper { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 28px; line-height: 1.65; font-size: 15px; box-shadow: 0 1px 3px rgba(15,23,42,0.08); }
    .paper p, .paper li, .paper span, .paper div { color: #0f172a; }
    .paper a { color: #2563eb; }
    ul, ol { padding-left: 1.35rem; }
  </style>
</head>
<body>
  <div class="wrap"><div class="paper">${bodyContent}</div></div>
</body>
</html>`;

    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, '_blank', 'width=880,height=720');
    if (!popup) {
      URL.revokeObjectURL(url);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }, [dialScriptRenderedHtml, dialScriptPlainText, session?.script?.script_name]);


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
        const aid = coerceAttemptId(payload?.attempt?.id);
        if (aid) pendingAttemptFromNextRef.current = aid;
        setSession(nextSession);
      } else {
        await load();
      }
      setDialWorkspaceUnlocked(true);
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

  async function submitAddPhone() {
    const cid = currentItem?.contact_id;
    if (!cid || !addPhoneLabel) return;
    const national = clampNationalDigits(addPhoneValue);
    if (!national || national.length !== PHONE_NATIONAL_MAX_DIGITS) {
      setError(`Enter a ${PHONE_NATIONAL_MAX_DIGITS}-digit phone number`);
      return;
    }
    const raw = buildE164FromParts(addPhoneCountryCode, national);
    setBusy(true);
    setError('');
    try {
      const res = await contactsAPI.appendPhone(cid, { phone: raw, label: addPhoneLabel });
      const updated = res?.data?.data ?? null;
      if (updated) setContact(updated);
      const newPhone = updated?.phones?.find(
        (p) => String(p.label || '').trim().toLowerCase() === String(addPhoneLabel).toLowerCase()
      );
      if (
        id &&
        currentItem?.id &&
        currentItem.state === 'queued' &&
        newPhone?.id != null &&
        Number(newPhone.id) > 0
      ) {
        const sres = await dialerSessionsAPI.updateItem(id, currentItem.id, {
          contact_phone_id: Number(newPhone.id),
        });
        const s = sres?.data?.data;
        if (s) {
          loadEpochRef.current += 1;
          setSession(s);
        }
      }
      setAddPhoneOpen(false);
      setAddPhoneValue('');
      setAddPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to add number');
    } finally {
      setBusy(false);
    }
  }

  async function applyTargetPhoneOnItem(contactPhoneId) {
    if (!id || !currentItem?.id) return;
    if (currentItem.state !== 'queued') return;
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.updateItem(id, currentItem.id, {
        contact_phone_id: contactPhoneId,
      });
      const s = res?.data?.data;
      if (s) {
        loadEpochRef.current += 1;
        setSession(s);
      } else {
        await load();
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to update target number');
    } finally {
      setBusy(false);
    }
  }

  function isDialerPhoneRowSelected(p) {
    const t = currentItem?.contact_phone_id;
    if (t != null && Number(t) > 0) return Number(p.id) === Number(t);
    if (p.id === 'synthetic-primary') return true;
    if (Number(p.is_primary) === 1) return true;
    const anyPri = phonesList.some((x) => Number(x.is_primary) === 1);
    if (!anyPri && phonesList[0] && phonesList[0].id === p.id) return true;
    return false;
  }

  function isPhoneHighlightedForDialer(p) {
    if (!currentItem) return false;
    if (currentItem.state === 'calling') {
      const aid = currentItem.attempt_contact_phone_id;
      if (aid != null && String(aid) !== '' && Number(aid) > 0) {
        if (p.id === 'synthetic-primary') return false;
        return Number(p.id) === Number(aid);
      }
      const norm = (s) => String(s || '').replace(/\s/g, '');
      return norm(p.phone) === norm(activeDialPhone);
    }
    return isDialerPhoneRowSelected(p);
  }

  async function setDisposition(dispositionId, nextAction, dealOpt = null) {
    const callingRow = items.find((i) => i.state === 'calling');
    const attemptId = coerceAttemptId(callingRow?.last_attempt_id) || lastAttemptId;
    if (!attemptId) {
      setError('No active call attempt for this lead. Use Call next or refresh the page.');
      return;
    }
    const dispId = coerceDispositionId(dispositionId);
    if (!dispId) {
      setError('Invalid disposition.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const rawNotes = String(callNotes || '').trim();
      const notes =
        rawNotes.length > 2000 ? rawNotes.slice(0, 2000) : rawNotes.length > 0 ? rawNotes : null;
      const payload = { disposition_id: dispId, notes };
      if (dealOpt && dealOpt.deal_id != null && dealOpt.stage_id != null) {
        payload.deal_id = dealOpt.deal_id;
        payload.stage_id = dealOpt.stage_id;
      }
      const res = await callsAPI.setDisposition(attemptId, payload);
      const body = res?.data ?? {};
      callNotesHydrateEpochRef.current += 1;
      setCallNotes('');
      const na = String(nextAction || '').toLowerCase();

      if (body.session && Array.isArray(body.session.items)) {
        loadEpochRef.current += 1;
        pendingAttemptFromNextRef.current = coerceAttemptId(body.dialer?.attempt?.id);
        setSession(body.session);
        await reloadCallHistory();
        return;
      }

      await load();
      await reloadCallHistory();
      if (!na.includes('next_number')) {
        if (na.includes('next_contact') || (na.includes('next') && !na.includes('next_number'))) {
          await callNext();
        }
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to set disposition');
    } finally {
      setBusy(false);
    }
  }

  const teamAgentOptions = useMemo(
    () =>
      (teamMembers || [])
        .filter((u) => String(u.role || '').toLowerCase() === 'agent')
        .map((u) => ({ value: String(u.id), label: u.name || u.email || `User ${u.id}` })),
    [teamMembers]
  );

  const teamMemberOptions = useMemo(
    () =>
      (teamMembers || [])
        .map((u) => ({ value: String(u.id), label: u.name || u.email || `User ${u.id}` }))
        .filter((opt) => opt.value),
    [teamMembers]
  );

  const minimumNowLocal = useMemo(() => formatDateTimeLocalInputValue(new Date()), [meetingModalOpen]);

  const activeEmailAccountOptions = useMemo(
    () =>
      (emailAccounts || [])
        .filter((a) => a.status === 'active' || a.status == null)
        .map((a) => ({ value: String(a.id), label: a.account_name || a.email_address })),
    [emailAccounts]
  );

  const advanceDispositionFlow = useCallback(
    async (flow) => {
      const nextFlow = flow || dispositionActionFlow;
      if (!nextFlow) return;
      const remaining = Array.isArray(nextFlow.pendingActions) ? nextFlow.pendingActions : [];
      if (remaining.length === 0) {
        setDispositionActionFlow(null);
        await setDisposition(nextFlow.disposition.id, nextFlow.disposition.next_action, nextFlow.dealOpt || null);
        return;
      }
      const nextActionCode = remaining[0];
      const rest = remaining.slice(1);
      setDispositionActionFlow({ ...nextFlow, pendingActions: rest });
      setActionModalError('');
      setActionModalNeedsReconnect(false);
      if (nextActionCode === 'schedule_callback') {
        const now = new Date();
        const assignedDefault = String(
          nextFlow.defaultAssignedUserId || nextFlow.disposition?.agent_user_id || user?.id || ''
        );
        const dtLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setCallbackForm({ assigned_user_id: assignedDefault, scheduled_at: dtLocal, notes: '' });
        setCallbackModalOpen(true);
        return;
      }
      if (nextActionCode === 'schedule_meeting') {
        const z = DEFAULT_MEETING_TIMEZONE;
        const startAt = civilDateTimeNowPlusMinutesInZone(30, z);
        const endAt = startAt ? addMinutesToCivilDateTimeLocalString(startAt, 30, z) : '';
        setMeetingForm({
          email_account_id: activeEmailAccountOptions[0]?.value || '',
          assigned_user_id: String(nextFlow.defaultAssignedUserId || user?.id || ''),
          meeting_owner_user_id: String(nextFlow.defaultAssignedUserId || user?.id || ''),
          meeting_platform: 'google_meet',
          meeting_duration_min: '30',
          title: `${leadContact?.display_name || 'Contact'} follow-up`,
          attendee_email: leadContact?.email || '',
          start_at: startAt,
          end_at: endAt,
          location: '',
          description: '',
          meeting_timezone: z,
        });
        setMeetingModalOpen(true);
        return;
      }
      await advanceDispositionFlow({ ...nextFlow, pendingActions: rest });
    },
    [activeEmailAccountOptions, dispositionActionFlow, leadContact?.display_name, leadContact?.email, setDisposition, user?.id]
  );

  function startDispositionActionFlow(disposition, dealOpt = null) {
    const actions = Array.isArray(disposition?.action_codes) ? disposition.action_codes : [];
    const pendingActions = actions.filter((code) => code === 'schedule_callback' || code === 'schedule_meeting');
    if (pendingActions.length === 0) {
      setDisposition(disposition.id, disposition.next_action, dealOpt);
      return;
    }
    const flow = {
      disposition,
      dealOpt,
      pendingActions,
      defaultAssignedUserId: user?.id || '',
    };
    setDispositionActionFlow(flow);
    void advanceDispositionFlow(flow);
  }

  function onDispositionButtonClick(d) {
    if (d.requires_deal_selection) {
      setError('');
      setDealPickDispo(d);
      setDealPickDealId('');
      setDealPickStageId('');
      return;
    }
    startDispositionActionFlow(d);
  }

  async function confirmDealDispositionPick() {
    if (!dealPickDispo) return;
    const did = Number(dealPickDealId);
    const sid = Number(dealPickStageId);
    if (!did || !sid || !Number.isFinite(did) || !Number.isFinite(sid)) {
      setError('Select a pipeline and stage for this outcome.');
      return;
    }
    const d = dealPickDispo;
    setDealPickDispo(null);
    startDispositionActionFlow(d, { deal_id: did, stage_id: sid });
  }

  async function saveCallbackFromDispositionFlow() {
    if (!dispositionActionFlow?.disposition || !currentItem?.contact_id) return;
    if (!callbackForm.assigned_user_id || !callbackForm.scheduled_at) {
      setActionModalError('Assigned user and callback time are required.');
      return;
    }
    setActionModalSaving(true);
    setActionModalError('');
    setActionModalNeedsReconnect(false);
    try {
      await scheduleHubAPI.createFollowUp({
        contact_id: Number(currentItem.contact_id),
        assigned_user_id: Number(callbackForm.assigned_user_id),
        scheduled_at: callbackForm.scheduled_at,
        notes: callbackForm.notes?.trim() || null,
        follow_up_type: 'callback',
      });
      setCallbackModalOpen(false);
      await advanceDispositionFlow();
    } catch (e) {
      setActionModalNeedsReconnect(isProviderReauthError(e));
      setActionModalError(e?.response?.data?.error || e?.message || 'Failed to create callback.');
    } finally {
      setActionModalSaving(false);
    }
  }

  async function saveMeetingFromDispositionFlow() {
    if (!dispositionActionFlow?.disposition || !currentItem?.contact_id) return;
    if (
      !meetingForm.email_account_id ||
      !meetingForm.assigned_user_id ||
      !meetingForm.meeting_owner_user_id ||
      !meetingForm.meeting_platform ||
      !meetingForm.meeting_duration_min ||
      !meetingForm.title?.trim() ||
      !meetingForm.start_at ||
      !meetingForm.end_at
    ) {
      setActionModalError(
        'Email account, assigned user, meeting owner, platform, duration, title, start and end time are required.'
      );
      return;
    }
    const tz = meetingForm.meeting_timezone || DEFAULT_MEETING_TIMEZONE;
    const startTs = civilDateTimeLocalStringToUtcMs(meetingForm.start_at, tz);
    const endTs = civilDateTimeLocalStringToUtcMs(meetingForm.end_at, tz);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      setActionModalError('Enter a valid start/end date and time.');
      return;
    }
    if (startTs < Date.now()) {
      setActionModalError('Meeting can only be scheduled for upcoming date/time.');
      return;
    }
    if (endTs <= startTs) {
      setActionModalError('End time must be after start time.');
      return;
    }
    setActionModalSaving(true);
    setActionModalError('');
    setActionModalNeedsReconnect(false);
    try {
      await meetingsAPI.create({
        email_account_id: Number(meetingForm.email_account_id),
        assigned_user_id: Number(meetingForm.assigned_user_id),
        meeting_owner_user_id: Number(meetingForm.meeting_owner_user_id),
        meeting_platform: meetingForm.meeting_platform,
        meeting_duration_min: Number(meetingForm.meeting_duration_min),
        contact_id: Number(currentItem.contact_id),
        title: meetingForm.title.trim(),
        attendee_email: meetingForm.attendee_email?.trim() || null,
        start_at: localDateTimeInputToUtcMysql(meetingForm.start_at, tz),
        end_at: localDateTimeInputToUtcMysql(meetingForm.end_at, tz),
        meeting_timezone: tz,
        location: meetingForm.location?.trim() || null,
        description: meetingForm.description?.trim() || null,
        meeting_status: 'scheduled',
      });
      setMeetingModalOpen(false);
      await advanceDispositionFlow();
    } catch (e) {
      setActionModalNeedsReconnect(isProviderReauthError(e));
      setActionModalError(e?.response?.data?.error || e?.message || 'Failed to create meeting.');
    } finally {
      setActionModalSaving(false);
    }
  }

  function syncMeetingEndFromStart(nextStart, nextDuration, meetingTz) {
    const d = Number(nextDuration);
    const z = meetingTz || DEFAULT_MEETING_TIMEZONE;
    if (!nextStart || !Number.isFinite(d) || d <= 0) return '';
    return addMinutesToCivilDateTimeLocalString(nextStart, d, z);
  }

  async function saveDialCallNotesClick() {
    const aid = lastAttemptId;
    if (!aid) {
      showToast('No active call attempt to save notes for.', 'warning');
      return;
    }
    setSavingDialCallNotes(true);
    try {
      const raw = String(callNotes || '').trim();
      const notes = raw.length > 2000 ? raw.slice(0, 2000) : raw.length > 0 ? raw : null;
      await callsAPI.patchNotes(aid, { notes });
      callNotesHydrateEpochRef.current += 1;
      setCallNotes('');
      showToast('Call notes saved.', 'success');
      await reloadCallHistory();
    } catch (e) {
      showToast(e.response?.data?.error || e.message || 'Could not save call notes', 'error');
    } finally {
      setSavingDialCallNotes(false);
    }
  }

  async function saveDialContactNotesClick() {
    const cid = currentItem?.contact_id;
    if (!cid) {
      showToast('No contact selected.', 'warning');
      return;
    }
    setSavingDialContactNotes(true);
    try {
      await contactsAPI.update(cid, {
        notes: contactNotesDraft?.trim() ? String(contactNotesDraft).trim() : null,
      });
      const res = await contactsAPI.getById(cid);
      setContact(res?.data?.data ?? null);
      showToast('Contact notes saved.', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || e.message || 'Could not save contact notes', 'error');
    } finally {
      setSavingDialContactNotes(false);
    }
  }

  const sessionSubtitle =
    sessionDisplayNo != null ? `Session #${sessionDisplayNo}` : 'Dial session';

  return (
    <DialerFlowLayout
      theme={dialerTheme}
      onThemeChange={setDialerThemeAndPersist}
      subtitle={sessionSubtitle}
      credits={
        session ? <DialerCreditsBar barOnly refreshIntervalMs={45000} /> : null
      }
    >
      <div className={styles.flowBody}>
      {showErrorOutside ? <Alert variant={errorAlertVariant}>{error}</Alert> : null}

      {loading && !session ? (
        <div className={styles.dialerShell} data-dialer-theme={dialerTheme} aria-busy="true" aria-label="Loading dialer workspace">
          <header className={styles.dialerChromeBar}>
            <div className={styles.dialerChromeLeft}>
              <Skeleton inverse width={84} height={12} />
              <Skeleton inverse width={160} height={18} />
              <Skeleton inverse width={64} height={26} style={{ borderRadius: 999 }} />
            </div>
            <div className={styles.dialerChromeRight}>
              <Skeleton inverse width={48} height={10} />
              <Skeleton inverse width="min(200px, 42%)" height={14} />
            </div>
          </header>
          <div className={styles.metricsStrip} aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={`skel-met-${i}`} className={styles.metricCell}>
                <Skeleton inverse width="70%" height={10} />
                <Skeleton inverse width="52%" height={16} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
          <div className={styles.shellProgressRow} aria-hidden>
            <div className={styles.shellProgressMain}>
              <div className={styles.shellProgressText}>
                <Skeleton inverse width={220} height={10} />
                <Skeleton inverse width={72} height={10} />
              </div>
              <div className={styles.shellProgressBar}>
                <Skeleton inverse width="38%" height="100%" style={{ borderRadius: 999 }} />
              </div>
            </div>
            <div className={styles.shellProgressActions}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={`skel-dial-${i}`} inverse width={34} height={34} style={{ borderRadius: 8 }} />
              ))}
            </div>
          </div>
          <div className={styles.dialerSkelGrid} aria-hidden>
            <div className={styles.dialerSkelCol}>
              <Skeleton inverse height={32} width="70%" style={{ borderRadius: 8 }} />
              <Skeleton inverse height={120} style={{ marginTop: 10, borderRadius: 10 }} />
              <Skeleton inverse height={80} style={{ marginTop: 10, borderRadius: 10 }} />
            </div>
            <div className={styles.dialerSkelCol}>
              <Skeleton inverse height={32} width="55%" style={{ borderRadius: 8 }} />
              <Skeleton inverse height={140} style={{ marginTop: 10, borderRadius: 10 }} />
              <Skeleton inverse height={100} style={{ marginTop: 10, borderRadius: 10 }} />
            </div>
            <div className={styles.dialerSkelCol}>
              <Skeleton inverse height={32} width="60%" style={{ borderRadius: 8 }} />
              <Skeleton inverse height={200} style={{ marginTop: 10, borderRadius: 10 }} />
              <Skeleton inverse height={72} style={{ marginTop: 10, borderRadius: 10 }} />
            </div>
          </div>
        </div>
      ) : null}

      {session ? (
        <>
          {sessionEnded ? (
            <div className={styles.summaryCenter}>
            <div className={styles.summaryWrap}>
              <div className={styles.summaryHero}>
                <div className={styles.summaryHeroText}>
                  <div className={styles.summaryEyebrow}>Dialer session</div>
                  <h2 className={styles.summaryHeadline}>
                    {sessionDisplayNo != null ? `Dial session #${sessionDisplayNo}` : 'Dial session'} ·{' '}
                    <span className={styles.summaryStatus}>{session.status}</span>
                  </h2>
                  <p className={styles.summarySub}>Here is how this run finished.</p>
                </div>
                <div className={styles.summaryHeroAside}>
                  <div className={styles.summaryDurationLabel}>
                    <Icon name="clock" />
                    <span>Session time</span>
                  </div>
                  <div className={styles.summaryDurationValue}>{formatTimerHms(durationMs)}</div>
                </div>
              </div>
              <div className={styles.summaryGrid}>
                <SummaryStatCard icon="users" label="Total contacts" value={totalCount} tone="violet" />
                <SummaryStatCard icon="phone" label="Called" value={calledCount} tone="violet" />
                <SummaryStatCard icon="link" label="Connected" value={connectedCount} tone="green" />
                <SummaryStatCard icon="x" label="Failed" value={failedCount} tone="red" />
                <SummaryStatCard icon="hourglass" label="Queued left" value={queuedCount} tone="amber" />
              </div>
              <div className={styles.summaryActions}>
                <button type="button" className={styles.summaryDoneBtn} onClick={leaveDialSession}>
                  {leaveDialSessionDoneLabel}
                </button>
              </div>
            </div>
            </div>
          ) : null}

          {view === 'preflight' && !sessionEnded ? (
            <div className={styles.preflightCenter}>
            <div className={styles.preflightCard}>
              <div className={styles.preflightHero}>
                <div className={styles.preflightHeroText}>
                  <p className={styles.preflightEyebrow}>Dialer session</p>
                  <h2 className={styles.preflightTitle}>Before you start</h2>
                  <p className={styles.preflightLead}>Confirm settings and compliance, then begin dialing.</p>
                </div>
              </div>
              <div className={styles.preflightBody}>
                <div className={styles.preflightSection}>
                  <h3 className={styles.preflightHeading}>Session settings</h3>
                  <div className={styles.preflightRows}>
                    <PreflightRow
                      icon="flag"
                      label="Dialing set"
                      value={session?.dialing_set_id ? 'Selected' : '—'}
                    />
                    <PreflightRow
                      icon="fileText"
                      label="Call script"
                      value={session?.script?.script_name || '—'}
                    />
                    <PreflightRow icon="users" label="Selected contacts" value={totalCount} />
                  </div>
                </div>

                <div className={styles.preflightSection}>
                  <h3 className={styles.preflightHeading}>
                    <span className={styles.preflightHeadingIcon} aria-hidden="true">
                      <DialerIcon name="shield" size={16} />
                    </span>
                    Legal & compliance
                  </h3>
                  <ul className={styles.preflightBullets}>
                    <li>Only call leads you are authorized to contact.</li>
                    <li>Respect local DND/consent rules and your company’s policy.</li>
                    <li>Do not store sensitive info in notes unless policy allows it.</li>
                  </ul>
                </div>

                <div className={styles.preflightActions}>
                  <button
                    type="button"
                    className={styles.preflightStartBtn}
                    onClick={callNext}
                    disabled={busy || session.status === 'paused' || callingCount > 0}
                    title={
                      callingCount > 0
                        ? 'Finish the current call (set a disposition) before starting another dial.'
                        : undefined
                    }
                  >
                    {busy ? 'Working…' : 'Start session'}
                  </button>
                </div>
              </div>
            </div>
            </div>
          ) : null}

          {sessionEnded || !dialWorkspaceUnlocked ? null : (
          <div className={styles.workspaceRoot}>
            <div className={styles.metricsStrip} role="group" aria-label="Session metrics">
              <MetricCell icon="clock" label="Session time" value={formatTimerHms(durationMs)} />
              <MetricCell
                icon="user"
                label="Lead #"
                value={
                  totalCount > 0
                    ? currentContactNumber
                      ? `${currentContactNumber} / ${totalCount}`
                      : `— / ${totalCount}`
                    : '—'
                }
              />
              <MetricCell icon="check" label="Completed" value={completedCount} />
              <MetricCell icon="users" label="In queue" value={queuedCount} />
              <MetricCell icon="phone" label="Dials" value={calledCount} />
              <MetricCell icon="phoneNext" label="Connected" value={connectedCount} />
              <MetricCell icon="x" label="Failed" value={failedCount} />
            </div>

            <div className={styles.shellProgressRow} role="region" aria-label="Queue progress and dial controls">
              <div className={styles.shellProgressMain}>
                <div className={styles.shellProgressText}>
                  <span>
                    {totalCount > 0 ? (
                      <>
                        {completedCount} done
                        {callingCount ? ` · ${callingCount} live` : ''}
                        {queuedCount ? ` · ${queuedCount} waiting` : ''}
                      </>
                    ) : (
                      'No contacts in this session'
                    )}
                  </span>
                  <span className={styles.shellProgressPct}>
                    {totalCount > 0 ? `${progressCount} / ${totalCount} · ${progressPct}%` : '—'}
                  </span>
                </div>
                <div
                  className={styles.shellProgressBar}
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className={styles.shellProgressFill} style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              <div className={styles.shellProgressActions} role="toolbar" aria-label="Dial controls">
                <button
                  type="button"
                  className={`${styles.dialActionBtn} ${styles.dialActionPrimary}`}
                  onClick={callNext}
                  disabled={
                    busy ||
                    session.status === 'paused' ||
                    session.status === 'completed' ||
                    session.status === 'cancelled' ||
                    callingCount > 0 ||
                    queuedCount === 0
                  }
                  title={
                    callingCount > 0
                      ? 'Set a disposition on the current call before dialing the next lead.'
                      : queuedCount === 0
                        ? 'No leads left in the queue.'
                        : 'Call next'
                  }
                  aria-label={busy ? 'Working' : 'Call next'}
                >
                  <Icon name="phone" />
                </button>
                <button
                  type="button"
                  className={styles.dialActionBtn}
                  onClick={session.status === 'paused' ? resumeSession : pauseSession}
                  disabled={
                    busy ||
                    session.status === 'ready' ||
                    session.status === 'completed' ||
                    session.status === 'cancelled'
                  }
                  title={session.status === 'paused' ? 'Resume dialing' : 'Pause dialing'}
                  aria-label={session.status === 'paused' ? 'Resume' : 'Pause'}
                >
                  <Icon name={session.status === 'paused' ? 'play' : 'pause'} />
                </button>
                <button
                  type="button"
                  className={styles.dialActionBtn}
                  disabled
                  title="Mute/unmute requires live call provider support (not available for dummy provider yet)"
                  aria-label="Mute"
                >
                  <Icon name="micOff" />
                </button>
                <button
                  type="button"
                  className={`${styles.dialActionBtn} ${styles.dialActionStop}`}
                  onClick={cancelSession}
                  disabled={busy || session.status === 'completed' || session.status === 'cancelled'}
                  title="End session — no more calls will be placed"
                  aria-label="End session"
                >
                  <Icon name="stop" />
                </button>
              </div>
            </div>

            <div
              className={`${styles.activeCallStrip} ${
                currentItem?.state === 'calling'
                  ? styles.activeCallStripLive
                  : currentItem?.state === 'queued'
                    ? styles.activeCallStripQueue
                    : styles.activeCallStripIdle
              }`}
            >
              <div className={styles.activeCallStripMain}>
                <div className={styles.activeCallStripLeft}>
                  <span className={styles.activeCallLeadBadge}>
                    {currentContactNumber ? `Lead ${currentContactNumber}` : 'Lead'}
                  </span>
                  {currentItem?.state === 'calling' ? (
                    <span className={styles.activeCallLiveDot} aria-hidden="true" />
                  ) : null}
                </div>
                <div className={styles.activeCallStripCenter}>
                  <div className={styles.activeCallName}>
                    {leadContact?.display_name || (totalCount === 0 ? 'No leads in session' : 'Select a lead from the queue')}
                  </div>
                  {leadSubtitle ? <div className={styles.activeCallSub}>{leadSubtitle}</div> : null}
                </div>
                <div className={styles.activeCallStripRight}>
                  <div className={styles.activeCallNumbersPanel}>
                    <div className={styles.activeCallNumbersTitle}>Numbers</div>
                    {phonesList.length === 0 ? (
                      <div className={styles.activeCallNumbersRow}>
                        <div className={styles.activeCallPhoneRowWrap}>
                          <div className={styles.activeCallPhoneRow}>
                            <Icon name="phone" />
                            <span className={styles.activeCallPhone}>
                              {activeDialPhone || leadContact?.primary_phone || '—'}
                            </span>
                          </div>
                        </div>
                        {canAddPhoneNumber ? (
                          <div className={styles.activeCallAddPhoneWrap}>
                            <button
                              type="button"
                              className={styles.activeCallAddPhoneBtn}
                              disabled={busy}
                              title="Add a number (pick a free type: mobile, work, …)"
                              aria-expanded={addPhoneOpen}
                              aria-label="Add phone number"
                              onClick={() => setAddPhoneOpen((o) => !o)}
                            >
                              <Icon name="plus" />
                            </button>
                            {addPhoneOpen ? (
                              <div className={styles.activeCallAddPhonePop}>
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Type"
                                  placeholder="Type"
                                  value={addPhoneLabel}
                                  onChange={(e) => setAddPhoneLabel(e.target.value)}
                                  options={missingPhoneLabels.map((l) => ({
                                    value: l,
                                    label: formatPhoneLabel(l),
                                  }))}
                                  disabled={busy}
                                />
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Country code"
                                  value={normalizeCallingCode(addPhoneCountryCode)}
                                  onChange={(e) => setAddPhoneCountryCode(e.target.value)}
                                  options={getCallingCodeOptionsForSelect(addPhoneCountryCode)}
                                  disabled={busy}
                                />
                                <Input
                                  className={styles.activeCallAddPhoneInput}
                                  label="Number"
                                  value={addPhoneValue}
                                  onChange={(e) => setAddPhoneValue(clampNationalDigits(e.target.value))}
                                  placeholder={`${PHONE_NATIONAL_MAX_DIGITS} digits`}
                                  disabled={busy}
                                  inputMode="numeric"
                                  maxLength={PHONE_NATIONAL_MAX_DIGITS}
                                  autoComplete="tel-national"
                                />
                                <div className={styles.activeCallAddPhoneActions}>
                                  <Button size="sm" variant="primary" disabled={busy} onClick={submitAddPhone}>
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => {
                                      setAddPhoneOpen(false);
                                      setAddPhoneValue('');
                                      setAddPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className={styles.activeCallNumbersRow}>
                        <ul className={styles.activeCallPhoneListHoriz}>
                          {phonesList.map((p, idx) => {
                            const sid = String(p.id ?? `${idx}-${p.phone}`);
                            const hi = isPhoneHighlightedForDialer(p);
                            const chipClass = `${styles.activeCallPhoneChip} ${hi ? styles.activeCallPhoneChipOn : ''}`;
                            const chipBody = (
                              <>
                                <Icon name="phone" />
                                <span className={styles.activeCallPhoneChipMeta}>
                                  <span className={styles.activeCallPhoneChipKind}>
                                    {formatPhoneLabel(p.label)}
                                  </span>
                                  <span className={styles.activeCallPhoneChipNum}>{p.phone || '—'}</span>
                                </span>
                              </>
                            );
                            const pickQueued = currentItem?.state === 'queued';
                            return (
                              <li key={sid} className={styles.activeCallPhoneListHorizItem}>
                                <div className={styles.activeCallPhoneRowItemWrap}>
                                  {pickQueued ? (
                                    <button
                                      type="button"
                                      className={`${chipClass} ${styles.activeCallPhoneChipBtn}`}
                                      disabled={busy}
                                      title="Use this number on Call next"
                                      onClick={() =>
                                        applyTargetPhoneOnItem(
                                          p.id === 'synthetic-primary' ? null : Number(p.id) || null
                                        )
                                      }
                                    >
                                      {chipBody}
                                    </button>
                                  ) : (
                                    <span className={chipClass}>{chipBody}</span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {canAddPhoneNumber ? (
                          <div className={styles.activeCallAddPhoneWrap}>
                            <button
                              type="button"
                              className={styles.activeCallAddPhoneBtn}
                              disabled={busy}
                              title="Add a number (pick a free type: mobile, work, …)"
                              aria-expanded={addPhoneOpen}
                              aria-label="Add phone number"
                              onClick={() => setAddPhoneOpen((o) => !o)}
                            >
                              <Icon name="plus" />
                            </button>
                            {addPhoneOpen ? (
                              <div className={styles.activeCallAddPhonePop}>
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Type"
                                  placeholder="Type"
                                  value={addPhoneLabel}
                                  onChange={(e) => setAddPhoneLabel(e.target.value)}
                                  options={missingPhoneLabels.map((l) => ({
                                    value: l,
                                    label: formatPhoneLabel(l),
                                  }))}
                                  disabled={busy}
                                />
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Country code"
                                  value={normalizeCallingCode(addPhoneCountryCode)}
                                  onChange={(e) => setAddPhoneCountryCode(e.target.value)}
                                  options={getCallingCodeOptionsForSelect(addPhoneCountryCode)}
                                  disabled={busy}
                                />
                                <Input
                                  className={styles.activeCallAddPhoneInput}
                                  label="Number"
                                  value={addPhoneValue}
                                  onChange={(e) => setAddPhoneValue(clampNationalDigits(e.target.value))}
                                  placeholder={`${PHONE_NATIONAL_MAX_DIGITS} digits`}
                                  disabled={busy}
                                  inputMode="numeric"
                                  maxLength={PHONE_NATIONAL_MAX_DIGITS}
                                  autoComplete="tel-national"
                                />
                                <div className={styles.activeCallAddPhoneActions}>
                                  <Button size="sm" variant="primary" disabled={busy} onClick={submitAddPhone}>
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => {
                                      setAddPhoneOpen(false);
                                      setAddPhoneValue('');
                                      setAddPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {view === 'active' ? (
            <div className={styles.grid}>
            <aside className={styles.colQueue}>
              <div className={styles.colPaneScroll}>
              <div
                className={`${styles.card} ${styles.cardQueue} ${
                  queueExpanded ? styles.cardQueueExpanded : styles.cardQueueCollapsed
                }`.trim()}
              >
                <button
                  type="button"
                  className={styles.queueHeaderToggle}
                  onClick={toggleQueueExpanded}
                  aria-expanded={queueExpanded}
                  aria-controls="dial-call-queue-panel"
                  title={queueExpanded ? 'Collapse call queue' : 'Expand call queue'}
                >
                  <span className={styles.queueTitle}>Call queue</span>
                  <span className={styles.queueHeaderActions}>
                    {queueExpanded ? (
                      <Icon name="chevronUp" />
                    ) : (
                      <span className={styles.queueExpandIcon} aria-hidden>
                        <Icon name="plus" />
                      </span>
                    )}
                  </span>
                </button>
                {queueExpanded ? (
                <>
                <div
                  id="dial-call-queue-panel"
                  className={`${styles.queueTableWrapExpanded} ${
                    queueShowAll ? styles.queueTableWrapScroll : ''
                  }`.trim()}
                >
                  <table className={`${styles.queueTable} ${styles.queueTableCompact}`}>
                    <thead>
                      <tr>
                        <th className={styles.thOrder}>#</th>
                        <th className={styles.thLead}>Lead</th>
                        <th className={styles.thState}>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueDisplayItems.map((it) => (
                        <tr key={it.id} className={currentItem?.id === it.id ? styles.queueRowActive : undefined}>
                          <td>{it.order_index + 1}</td>
                          <td>
                            <div className={styles.queueName} title={it.display_name || ''}>
                              {it.display_name || '—'}
                            </div>
                            <div
                              className={styles.queueSub}
                              title={
                                it.state === 'calling'
                                  ? it.attempt_phone || it.selected_phone || it.primary_phone || ''
                                  : it.selected_phone || it.primary_phone || ''
                              }
                            >
                              {it.state === 'calling'
                                ? it.attempt_phone || it.selected_phone || it.primary_phone || '—'
                                : it.selected_phone || it.primary_phone || '—'}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.statePill} ${styles[`state_${it.state}`] || ''}`.trim()}
                              title={it.state}
                            >
                              {it.state || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {queueHasMoreThanPreview && !queueShowAll ? (
                  <div className={styles.queueFooter}>
                    <button
                      type="button"
                      className={styles.queueViewAllBtn}
                      onClick={() => setQueueShowAll(true)}
                    >
                      View all ({items.length})
                    </button>
                  </div>
                ) : null}
                </>
                ) : null}
              </div>

              <div className={`${styles.card} ${styles.cardContact}`}>
                <div className={styles.contactCardHead}>
                  <div className={styles.cardTitleInline}>Current contact</div>
                  {canEditCurrentContactInDialer ? (
                    <div className={styles.contactHeadActions}>
                      {contactPanelEditing ? (
                        <>
                          <button
                            type="button"
                            className={`${styles.contactEditIconBtn} ${styles.contactEditIconBtnSave}`.trim()}
                            onClick={() => void saveContactEdits()}
                            disabled={busy || savingContactEdit}
                            title="Save contact"
                            aria-label="Save contact"
                          >
                            <Icon name="check" />
                          </button>
                          <button
                            type="button"
                            className={`${styles.contactEditIconBtn} ${styles.contactEditIconBtnCancel}`.trim()}
                            onClick={() => setContactPanelEditing(false)}
                            disabled={savingContactEdit || busy}
                            title="Cancel editing"
                            aria-label="Cancel editing"
                          >
                            <Icon name="x" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.contactEditIconBtn}
                          onClick={openContactEdit}
                          disabled={busy || contactDetailPending}
                          title="Edit contact details"
                          aria-label="Edit contact details"
                        >
                          <Icon name="pencil" />
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className={styles.contactHero}>
                  <div className={styles.contactAvatar} aria-hidden="true">
                    {contactInitial}
                  </div>
                  <div className={styles.contactHeroMain}>
                    <div className={styles.contactName}>{leadContact?.display_name || '—'}</div>
                    <div className={styles.contactHeroMeta}>
                      {totalCount > 0 && currentContactNumber ? (
                        <span className={styles.contactPosition}>
                          Lead {currentContactNumber} of {totalCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {contactDetailPending ? (
                  <p className={styles.contactSourceHint}>
                    Name and phone come from the dial queue. Other fields appear when the contact record loads.
                  </p>
                ) : null}
                <dl className={styles.contactMeta}>
                  {contactPanelEditing ? (
                    <div className={styles.contactRow}>
                      <ContactMetaLabel icon="user">Display name</ContactMetaLabel>
                      <dd className={styles.metaValue}>
                        <Input
                          value={contactEditDraft.display_name}
                          onChange={(e) =>
                            setContactEditDraft((d) => ({ ...d, display_name: e.target.value }))
                          }
                          disabled={busy || savingContactEdit}
                          autoComplete="name"
                        />
                      </dd>
                    </div>
                  ) : null}
                  <div className={styles.contactRow}>
                    <ContactMetaLabel icon="phone">Phone numbers</ContactMetaLabel>
                    <dd className={`${styles.metaValue} ${styles.phoneBlock}`}>
                      {phonesList.length === 0 ? (
                        <span>—</span>
                      ) : (
                        <div className={styles.phoneDisplayList}>
                          {phonesList.map((p, idx) => {
                            const sid = String(p.id ?? `${idx}-${p.phone}`);
                            return (
                              <div key={sid} className={styles.phoneDisplayItem}>
                                <span className={styles.phoneDisplayType}>{formatPhoneLabel(p.label)}</span>
                                <span className={styles.phoneDisplayValue}>{p.phone || '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <ContactMetaLabel icon="mail">Email</ContactMetaLabel>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.email ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {contactPanelEditing ? (
                        <Input
                          type="email"
                          value={contactEditDraft.email}
                          onChange={(e) => setContactEditDraft((d) => ({ ...d, email: e.target.value }))}
                          disabled={busy || savingContactEdit}
                          autoComplete="email"
                        />
                      ) : (
                        leadContact?.email || '—'
                      )}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <ContactMetaLabel icon="building">Company</ContactMetaLabel>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.company ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {contactPanelEditing ? (
                        <Input
                          value={contactEditDraft.company}
                          onChange={(e) => setContactEditDraft((d) => ({ ...d, company: e.target.value }))}
                          disabled={busy || savingContactEdit}
                          autoComplete="organization"
                        />
                      ) : (
                        leadContact?.company || '—'
                      )}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <ContactMetaLabel icon="briefcase">Job title</ContactMetaLabel>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.job_title ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {contactPanelEditing ? (
                        <Input
                          value={contactEditDraft.job_title}
                          onChange={(e) => setContactEditDraft((d) => ({ ...d, job_title: e.target.value }))}
                          disabled={busy || savingContactEdit}
                          autoComplete="organization-title"
                        />
                      ) : (
                        leadContact?.job_title || '—'
                      )}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <ContactMetaLabel icon="pin">City</ContactMetaLabel>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.city ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {contactPanelEditing ? (
                        <Input
                          value={contactEditDraft.city}
                          onChange={(e) => setContactEditDraft((d) => ({ ...d, city: e.target.value }))}
                          disabled={busy || savingContactEdit}
                          autoComplete="address-level2"
                        />
                      ) : (
                        leadContact?.city || '—'
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
              </div>
            </aside>
            <main className={styles.colMain}>
              <div className={`${styles.card} ${styles.cardScript}`}>
                <div className={styles.workspaceTabBar} role="tablist" aria-label="Dial workspace">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dialWorkspaceTab === 'script'}
                    className={`${styles.workspaceTab} ${dialWorkspaceTab === 'script' ? styles.workspaceTabActive : ''}`.trim()}
                    onClick={() => setDialWorkspaceTab('script')}
                  >
                    Script
                  </button>
                  {dialerWorkspaceFlags.show_activity_tab ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dialWorkspaceTab === 'activity'}
                      className={`${styles.workspaceTab} ${dialWorkspaceTab === 'activity' ? styles.workspaceTabActive : ''}`.trim()}
                      onClick={() => setDialWorkspaceTab('activity')}
                    >
                      Activity
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dialWorkspaceTab === 'email'}
                    className={`${styles.workspaceTab} ${dialWorkspaceTab === 'email' ? styles.workspaceTabActive : ''}`.trim()}
                    disabled={!dialerWorkspaceFlags.show_email_tab}
                    title={
                      dialerWorkspaceFlags.show_email_tab
                        ? undefined
                        : 'The Email tab is turned off for your workspace. An administrator can enable it under Settings → Dial workspace.'
                    }
                    onClick={() => setDialWorkspaceTab('email')}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dialWorkspaceTab === 'website'}
                    className={`${styles.workspaceTab} ${dialWorkspaceTab === 'website' ? styles.workspaceTabActive : ''}`.trim()}
                    disabled={!dialerWorkspaceFlags.show_website_tab}
                    title={
                      dialerWorkspaceFlags.show_website_tab
                        ? undefined
                        : 'The Website tab is turned off for your workspace. An administrator can enable it under Settings → Dial workspace.'
                    }
                    onClick={() => setDialWorkspaceTab('website')}
                  >
                    Website
                  </button>
                </div>

                <div className={styles.colPaneScroll}>
                {dialWorkspaceTab === 'script' ? (
                  <div className={styles.dialScriptTabLayout}>
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
                    <div className={styles.scriptPanel}>
                      {String(session?.script?.script_body || '').trim() ? (
                        <div className={styles.scriptPanelBody} role="region" aria-label="Call script">
                          <button
                            type="button"
                            className={styles.scriptPopoutBtn}
                            onClick={openDialScriptPopout}
                            disabled={!String(dialScriptPlainText || dialScriptRenderedHtml || '').trim()}
                            title="Open script in new window"
                            aria-label="Open script in new window"
                          >
                            <Icon name="external" />
                          </button>
                          {String(dialScriptRenderedHtml || '').trim() ? (
                            <div
                              className={styles.scriptBody}
                              dangerouslySetInnerHTML={{ __html: dialScriptRenderedHtml }}
                            />
                          ) : (
                            <pre className={styles.scriptBodyPlain}>{dialScriptPlainText}</pre>
                          )}
                        </div>
                      ) : (
                        <div className={styles.scriptEmpty}>No script text is set for this session.</div>
                      )}
                    </div>

                    <div className={styles.dialNotesStack}>
                      <div
                        className={`${styles.dialCollapsible} ${
                          openDialContactNotes ? styles.dialCollapsibleOpen : ''
                        }`.trim()}
                      >
                        <button
                          type="button"
                          className={styles.dialCollapsibleHead}
                          aria-expanded={openDialContactNotes}
                          onClick={() => setOpenDialContactNotes((v) => !v)}
                        >
                          <span className={styles.dialCollapsibleTitle}>
                            <Icon name="pencil" />
                            Contact notes
                          </span>
                          <span className={styles.dialCollapsibleIcon} aria-hidden>
                            {openDialContactNotes ? '−' : '+'}
                          </span>
                        </button>
                        {openDialContactNotes ? (
                          <div className={styles.dialCollapsibleBody}>
                            <p className={styles.dialCollapsibleHint}>
                              Saved on the lead/contact record. Use Save — dispositions do not change this.
                            </p>
                            <textarea
                              className={styles.dialCenterNotesArea}
                              value={contactNotesDraft}
                              onChange={(e) => setContactNotesDraft(e.target.value)}
                              placeholder="Notes about this person (all calls)…"
                              rows={4}
                              disabled={busy || contactDetailPending || !currentItem?.contact_id}
                              maxLength={60000}
                            />
                            <div className={styles.dialNotesSaveRow}>
                              <Button
                                type="button"
                                size="sm"
                                onClick={saveDialContactNotesClick}
                                disabled={
                                  busy || savingDialContactNotes || contactDetailPending || !currentItem?.contact_id
                                }
                                loading={savingDialContactNotes}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div
                        className={`${styles.dialCollapsible} ${
                          openDialCallNotes ? styles.dialCollapsibleOpen : ''
                        }`.trim()}
                      >
                        <button
                          type="button"
                          className={styles.dialCollapsibleHead}
                          aria-expanded={openDialCallNotes}
                          onClick={() => setOpenDialCallNotes((v) => !v)}
                        >
                          <span className={styles.dialCollapsibleTitle}>
                            <Icon name="phone" />
                            Call notes
                          </span>
                          <span className={styles.dialCollapsibleIcon} aria-hidden>
                            {openDialCallNotes ? '−' : '+'}
                          </span>
                        </button>
                        {openDialCallNotes ? (
                          <div className={styles.dialCollapsibleBody}>
                            <p className={styles.dialCollapsibleHint}>
                              Saved on this dial attempt. Use Save, or they are sent again when you pick a disposition.
                            </p>
                            <textarea
                              id="dialer-call-notes-center"
                              className={styles.dialCenterNotesArea}
                              value={callNotes}
                              onChange={(e) => setCallNotes(e.target.value)}
                              placeholder="What happened on this call? (optional)"
                              rows={4}
                              maxLength={2000}
                              disabled={busy || !lastAttemptId}
                            />
                            <div className={styles.dialNotesSaveRow}>
                              <Button
                                type="button"
                                size="sm"
                                onClick={saveDialCallNotesClick}
                                disabled={busy || savingDialCallNotes || !lastAttemptId}
                                loading={savingDialCallNotes}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div
                        className={`${styles.dialCollapsible} ${
                          openDialPrevHistory ? styles.dialCollapsibleOpen : ''
                        }`.trim()}
                      >
                        <button
                          type="button"
                          className={styles.dialCollapsibleHead}
                          aria-expanded={openDialPrevHistory}
                          onClick={() => setOpenDialPrevHistory((v) => !v)}
                        >
                          <span className={styles.dialCollapsibleTitle}>
                            <Icon name="calendar" />
                            Previous call notes
                          </span>
                          <span className={styles.dialCollapsibleIcon} aria-hidden>
                            {openDialPrevHistory ? '−' : '+'}
                          </span>
                        </button>
                        {openDialPrevHistory ? (
                          <div className={styles.dialCollapsibleBody}>
                            {previousCallLogRows.length === 0 ? (
                              <p className={styles.dialPrevHistoryEmpty}>
                                No notes or dispositions logged yet. Save call notes or pick an outcome to see entries
                                here.
                              </p>
                            ) : (
                              <div className={styles.dialPrevHistoryScroll}>
                                <ul className={styles.dialPrevHistoryList}>
                                  {previousCallLogRows.flatMap((row) =>
                                    buildAttemptHistoryEntries(row).map((entry) => (
                                      <li
                                        key={entry.key}
                                        className={`${styles.dialPrevHistoryItem} ${
                                          lastAttemptId && Number(row.id) === Number(lastAttemptId)
                                            ? styles.dialPrevHistoryCurrent
                                            : ''
                                        }`.trim()}
                                      >
                                        {formatDialerHistoryEntryLine(row, entry, formatDateTime)}
                                      </li>
                                    ))
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : dialWorkspaceTab === 'activity' ? (
                  <div className={`${styles.dialTabPanel} ${styles.dialActivityPanel}`.trim()}>
                    <div className={styles.dialActivityTitle}>All dial attempts (this lead)</div>
                    <p className={styles.dialActivitySub}>
                      Newest first. Only attempts with a disposition and/or saved call notes (same as Previous call
                      notes).
                    </p>
                    {callHistoryRows.length === 0 ? (
                      <p className={styles.dialPrevHistoryEmpty}>No call attempts for this lead yet.</p>
                    ) : (
                      <div className={styles.dialPrevHistoryScroll}>
                        <ul className={styles.dialPrevHistoryList}>
                        {callHistoryRows.flatMap((row) =>
                          buildAttemptHistoryEntries(row).map((entry) => (
                            <li
                              key={entry.key}
                              className={`${styles.dialPrevHistoryItem} ${
                                lastAttemptId && Number(row.id) === Number(lastAttemptId)
                                  ? styles.dialPrevHistoryCurrent
                                  : ''
                              }`.trim()}
                            >
                              {formatDialerHistoryEntryLine(row, entry, formatDateTime)}
                            </li>
                          ))
                        )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : dialWorkspaceTab === 'email' ? (
                  <div className={styles.dialTabPlaceholder}>
                    Email tools for the dial workspace are not connected here yet. Use the Email section of the app for
                    now.
                  </div>
                ) : dialWorkspaceTab === 'website' ? (
                  <div className={styles.dialTabPlaceholder}>
                    Website shortcuts for the dial workspace are not available yet.
                  </div>
                ) : (
                  <div className={styles.dialTabPlaceholder}>This tab is not available.</div>
                )}
                </div>
              </div>

            </main>
            <aside className={styles.colSide}>
              <div className={styles.colPaneScroll}>
              <div className={`${styles.card} ${styles.cardDispo}`}>
                <div className={styles.dispoHeader}>
                  <div className={styles.dispoTitle}>Outcomes</div>
                </div>
                <div className={styles.dispoList}>
                  {(session?.dispositions || []).length === 0 ? (
                    <div className={styles.dispoEmpty}>No dispositions configured for this dialing set.</div>
                  ) : (
                    session.dispositions.map((d) => {
                      const nextMeta = dispositionNextActionMeta(d);
                      const tip = !lastAttemptId
                        ? 'Call at least one lead first'
                        : nextMeta.hint
                          ? `${d.name} — ${nextMeta.hint}`
                          : d.name;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className={styles.dispoBtn}
                          disabled={busy}
                          aria-disabled={!lastAttemptId}
                          title={tip}
                          onClick={() => onDispositionButtonClick(d)}
                        >
                          <span className={styles.dispoBtnInner}>
                            {nextMeta.icon ? (
                              <span className={styles.dispoBtnIconWrap} aria-hidden>
                                <Icon name={nextMeta.icon} />
                              </span>
                            ) : null}
                            <span className={styles.dispoBtnCopy}>
                              <span className={styles.dispoBtnLabel}>{d.name}</span>
                              {nextMeta.hint ? (
                                <span className={styles.dispoBtnActionHint}>{nextMeta.hint}</span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              </div>
            </aside>
          </div>
            ) : null}
          </div>
          )}

          <Modal
            isOpen={!!dealPickDispo}
            onClose={() => {
              if (!busy) setDealPickDispo(null);
            }}
            title={dealPickDispo ? `Pipeline for “${dealPickDispo.name}”` : 'Pipeline'}
            size="sm"
            footer={
              <ModalFooter>
                <Button variant="ghost" onClick={() => setDealPickDispo(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={confirmDealDispositionPick} loading={busy}>
                  Apply outcome
                </Button>
              </ModalFooter>
            }
          >
            <p style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Choose which pipeline and stage to attach to this contact for this outcome.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Select
                label="Pipeline"
                value={dealPickDealId}
                onChange={(e) => {
                  setDealPickDealId(e.target.value);
                  setDealPickStageId('');
                }}
                options={pipelineOptions}
                placeholder="Select pipeline…"
              />
              <Select
                label="Stage"
                value={dealPickStageId}
                onChange={(e) => setDealPickStageId(e.target.value)}
                options={dealPickStageOptions}
                placeholder={dealPickDealId ? 'Select stage…' : 'Select a pipeline first'}
                disabled={!dealPickDealId}
              />
            </div>
          </Modal>
          <Modal
            isOpen={callbackModalOpen}
            onClose={() => {
              if (actionModalSaving) return;
              setCallbackModalOpen(false);
              setDispositionActionFlow(null);
            }}
            title="Schedule callback"
            size="sm"
            footer={
              <ModalFooter>
                <Button
                  variant="ghost"
                  disabled={actionModalSaving}
                  onClick={() => {
                    setCallbackModalOpen(false);
                    setDispositionActionFlow(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveCallbackFromDispositionFlow} loading={actionModalSaving}>
                  Save callback
                </Button>
              </ModalFooter>
            }
          >
            {actionModalError ? <Alert variant="error">{actionModalError}</Alert> : null}
            <div style={{ display: 'grid', gap: 12 }}>
              <Select
                label="Assigned to"
                value={callbackForm.assigned_user_id}
                onChange={(e) => setCallbackForm((prev) => ({ ...prev, assigned_user_id: e.target.value }))}
                options={[{ value: '', label: 'Select agent' }, ...teamAgentOptions]}
              />
              <DateTimePickerField
                label="When"
                mode="datetime"
                value={callbackForm.scheduled_at}
                onChange={(v) => setCallbackForm((prev) => ({ ...prev, scheduled_at: v }))}
              />
              <Input
                label="Notes"
                value={callbackForm.notes}
                onChange={(e) => setCallbackForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional callback notes"
              />
            </div>
          </Modal>
          <SlidePanel
            isOpen={meetingModalOpen}
            onClose={() => {
              if (actionModalSaving) return;
              setMeetingModalOpen(false);
              setDispositionActionFlow(null);
            }}
            title="Schedule meeting"
            size="xl"
            closeOnOverlay={!actionModalSaving}
            closeOnEscape={!actionModalSaving}
            footer={
              <ModalFooter>
                <Button
                  variant="ghost"
                  disabled={actionModalSaving}
                  onClick={() => {
                    setMeetingModalOpen(false);
                    setDispositionActionFlow(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveMeetingFromDispositionFlow} loading={actionModalSaving}>
                  Save meeting
                </Button>
              </ModalFooter>
            }
          >
            {actionModalError ? <Alert variant="error">{actionModalError}</Alert> : null}
            {actionModalNeedsReconnect ? (
              <Alert variant="warning">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span>Provider permissions expired. Reconnect this account to continue native meeting sync.</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/email/accounts')}
                  >
                    Reconnect account
                  </Button>
                </div>
              </Alert>
            ) : null}
            <p style={{ margin: '0 0 10px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              Account permissions are used for native meeting links and future provider sync changes. If provider
              access fails, reconnect the same account to refresh scopes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Select
                label="Email account"
                value={meetingForm.email_account_id}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, email_account_id: e.target.value }))}
                options={[{ value: '', label: 'Select account' }, ...activeEmailAccountOptions]}
              />
              <Select
                label="Assigned to"
                value={meetingForm.assigned_user_id}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, assigned_user_id: e.target.value }))}
                options={[{ value: '', label: 'Select agent' }, ...teamAgentOptions]}
              />
              <Select
                label="Meeting owner"
                value={meetingForm.meeting_owner_user_id}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, meeting_owner_user_id: e.target.value }))}
                options={[{ value: '', label: 'Select owner' }, ...teamMemberOptions]}
              />
              <Select
                label="Platform"
                value={meetingForm.meeting_platform}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, meeting_platform: e.target.value }))}
                options={[
                  { value: 'google_meet', label: 'Google Meet' },
                  { value: 'microsoft_teams', label: 'Microsoft Teams' },
                ]}
              />
              <Select
                label="Duration"
                value={meetingForm.meeting_duration_min}
                onChange={(e) =>
                  setMeetingForm((prev) => {
                    const nextDuration = e.target.value;
                    return {
                      ...prev,
                      meeting_duration_min: nextDuration,
                      end_at: syncMeetingEndFromStart(prev.start_at, nextDuration, prev.meeting_timezone) || prev.end_at,
                    };
                  })
                }
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '45', label: '45 minutes' },
                  { value: '60', label: '60 minutes' },
                  { value: '90', label: '90 minutes' },
                ]}
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <Select
                  label="Meeting timezone"
                  value={meetingForm.meeting_timezone || DEFAULT_MEETING_TIMEZONE}
                  onChange={(e) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      meeting_timezone: e.target.value,
                    }))
                  }
                  options={COMMON_TIMEZONE_OPTIONS}
                />
              </div>
              <Input
                label="Title"
                value={meetingForm.title}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <Input
                label="Attendee email"
                type="email"
                value={meetingForm.attendee_email}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, attendee_email: e.target.value }))}
              />
              <DateTimePickerField
                label="Start"
                mode="datetime"
                value={meetingForm.start_at}
                min={minimumNowLocal}
                onChange={(v) =>
                  setMeetingForm((prev) => ({
                    ...prev,
                    start_at: v,
                    end_at: syncMeetingEndFromStart(v, prev.meeting_duration_min, prev.meeting_timezone) || prev.end_at,
                  }))
                }
              />
              <DateTimePickerField
                label="End"
                mode="datetime"
                value={meetingForm.end_at}
                min={meetingForm.start_at || minimumNowLocal}
                onChange={(v) => setMeetingForm((prev) => ({ ...prev, end_at: v }))}
              />
              <Input
                label="Location"
                value={meetingForm.location}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, location: e.target.value }))}
              />
              <Input
                label="Description"
                value={meetingForm.description}
                onChange={(e) => setMeetingForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </SlidePanel>
        </>
      ) : null}

      </div>
    </DialerFlowLayout>
  );
}

