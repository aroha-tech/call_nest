import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { SlidePanel } from '../components/ui/SlidePanel';
import { Alert } from '../components/ui/Alert';
import { meetingsAPI } from '../services/meetingsAPI';
import { emailAccountsAPI } from '../services/emailAPI';
import { scheduleHubAPI } from '../services/scheduleHubAPI';
import { Textarea } from '../components/ui/Textarea';
import { contactsAPI } from '../services/contactsAPI';
import { usePermissions } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import { MeetingMetricCards } from '../features/meetings/MeetingMetricCards';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import listStyles from '../components/admin/adminDataList.module.scss';
import { ScriptBodyEditor } from '../features/callScripts/ScriptBodyEditor';
import { formatEmailRecipientListDisplay } from '../utils/emailRecipientList';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../components/ui/InfoHelpIcon';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { Checkbox } from '../components/ui/Checkbox';
import { DateTimePickerField } from '../components/ui/DateTimePickerField';
import { formatDateTimeLocalInputValue } from '../components/ui/dateTimePickerUtils';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import styles from './MeetingsPage.module.scss';
import attendeeMailStyles from './MeetingAttendeeEmailSettingsPage.module.scss';
import {
  localDateTimeInputToUtcMysql,
  utcMysqlOrIsoToLocalDateTimeInput,
  utcMysqlRangeForLocalMonth,
} from '../utils/meetingDateTime';
import { DEFAULT_MEETING_TIMEZONE, addMinutesToCivilDateTimeLocalString, civilDateTimeLocalStringToUtcMs } from '../utils/meetingTimezone';
import { COMMON_TIMEZONE_OPTIONS } from '../utils/dateTimeDisplay';

function UiIcon({ children, className = '' }) {
  return (
    <span className={`${styles.uiIcon} ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MEETING_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'missed', label: 'Missed' },
];

const ATTENDANCE_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'attended', label: 'Attended' },
  { value: 'no_show', label: 'No show' },
  { value: 'cancelled', label: 'Cancelled (invitee)' },
];

const MEETING_TEMPLATE_TABS = [
  { kind: 'created', label: 'New meeting' },
  { kind: 'updated', label: 'Updated' },
  { kind: 'cancelled', label: 'Cancelled' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {Date} d */
function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Human label for merge-field keys shown on chips (e.g. start_at → Start At). */
function formatMergeFieldLabel(key) {
  return String(key)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function buildMonthCells(year, month0) {
  const first = new Date(year, month0, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDow = first.getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    const day = new Date(year, month0, -(firstDow - i - 1));
    cells.push({ inMonth: false, date: day });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ inMonth: true, date: new Date(year, month0, d) });
  }
  const rem = cells.length % 7;
  if (rem !== 0) {
    let n = 1;
    for (let k = 0; k < 7 - rem; k++) {
      cells.push({ inMonth: false, date: new Date(year, month0 + 1, n++) });
    }
  }
  return cells;
}

function templateKindForMeetingForm(isEditing, meetingStatus) {
  if (meetingStatus === 'cancelled') return 'cancelled';
  return isEditing ? 'updated' : 'created';
}

function meetingPayloadFromForm(form, accounts, editingMeeting = null) {
  const acc = accounts.find((a) => String(a.id) === String(form.email_account_id));
  const meetingLink =
    (editingMeeting && String(editingMeeting.meeting_link || '').trim()) ||
    (form.meeting_link && String(form.meeting_link).trim()) ||
    '';
  return {
    title: form.title?.trim() ?? '',
    start_at: localDateTimeInputToUtcMysql(form.start_at, form.meeting_timezone) || '',
    end_at: localDateTimeInputToUtcMysql(form.end_at, form.meeting_timezone) || '',
    meeting_timezone: form.meeting_timezone || DEFAULT_MEETING_TIMEZONE,
    location: form.location?.trim() ?? '',
    description: form.description?.trim() ?? '',
    meeting_status: form.meeting_status || 'scheduled',
    meeting_platform: form.meeting_platform || 'google_meet',
    meeting_duration_min: form.meeting_duration_min ? Number(form.meeting_duration_min) : null,
    meeting_owner_user_id: form.meeting_owner_user_id ? Number(form.meeting_owner_user_id) : null,
    assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
    attendee_email: form.attendee_email?.trim() ?? '',
    email_account_id: form.email_account_id ? Number(form.email_account_id) : null,
    meeting_link: meetingLink || undefined,
    ...(acc
      ? { account_label: acc.account_name || acc.email_address, account_email: acc.email_address }
      : {}),
  };
}

function meetingPreviewKindLabel(kind) {
  if (kind === 'created') return 'New meeting';
  if (kind === 'updated') return 'Update';
  return 'Cancelled';
}

function meetingPreviewEmailSubtitle(kind) {
  if (kind === 'created') return 'This is how the invitation will look to the attendee.';
  if (kind === 'updated') return 'This is how the update email will look to the attendee.';
  return 'This is how the cancellation email will look to the attendee.';
}

function previewMetaCcBccDisplay(raw) {
  const t = formatEmailRecipientListDisplay(raw);
  return t || '—';
}

function isProviderReauthError(errorLike) {
  return String(errorLike?.response?.data?.code || '').trim() === 'PROVIDER_REAUTH_REQUIRED';
}

function formatMeetingWhen(v, formatDateTime) {
  if (!v) return '—';
  return formatDateTime(String(v).replace(' ', 'T'));
}

function meetingStatusBadgeVariant(status) {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'rescheduled':
      return 'warning';
    case 'missed':
      return 'warning';
    case 'scheduled':
    default:
      return 'primary';
  }
}

function meetingChipStatusClass(meeting) {
  const status = String(meeting?.meeting_status || '').toLowerCase();
  if (status === 'completed') return 'meetingChip_completed';
  if (status === 'cancelled') return 'meetingChip_cancelled';

  // For open meetings, derive state from scheduled start time.
  const start = new Date(String(meeting?.start_at || '').replace(' ', 'T'));
  if (Number.isNaN(start.getTime())) return 'meetingChip_upcoming';
  const now = new Date();
  if (start < now) return 'meetingChip_missed';
  const msToStart = start.getTime() - now.getTime();
  if (msToStart <= 2 * 60 * 60 * 1000) return 'meetingChip_near';
  return 'meetingChip_upcoming';
}

/** Created-by column: show Self when the logged-in user created the meeting. */
function meetingCreatedByLabel(row, viewerUserId) {
  const cid = row?.created_by != null ? Number(row.created_by) : null;
  const me = viewerUserId != null ? Number(viewerUserId) : null;
  if (Number.isFinite(me) && me > 0 && Number.isFinite(cid) && cid > 0 && cid === me) return 'Self';
  return row?.created_by_name || '—';
}

export function MeetingsPage() {
  const { formatDateTime, formatDate, formatTime, formatMonthYear } = useDateTimeDisplay();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { canAny } = usePermissions();
  const canManage = canAny([PERMISSIONS.MEETINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [emailFilter, setEmailFilter] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [viewMode, setViewMode] = useState('calendar');
  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(20);
  const [listSearch, setListSearch] = useState('');
  const [listRows, setListRows] = useState([]);
  const [listPagination, setListPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [listLoading, setListLoading] = useState(false);
  const [listHasCompletedInitialFetch, setListHasCompletedInitialFetch] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [error, setError] = useState(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [meetingFormErrors, setMeetingFormErrors] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState('contact'); // contact | lead
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerLimit, setPickerLimit] = useState(10);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerPagination, setPickerPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [selectedEntityDetail, setSelectedEntityDetail] = useState(null);
  const [form, setForm] = useState({
    email_account_id: '',
    title: '',
    attendee_email: '',
    location: '',
    description: '',
    start_at: '',
    end_at: '',
    meeting_status: 'scheduled',
    assigned_user_id: '',
    meeting_owner_user_id: '',
    meeting_platform: 'google_meet',
    meeting_duration_min: '30',
    attendance_status: 'unknown',
    send_reminder: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [providerReconnectRequired, setProviderReconnectRequired] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState('created');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [placeholderHelp, setPlaceholderHelp] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [resetTemplateKind, setResetTemplateKind] = useState(null);

  const [meetingPreviewOpen, setMeetingPreviewOpen] = useState(false);
  const [meetingPreviewKind, setMeetingPreviewKind] = useState('created');
  const [meetingPreviewDraft, setMeetingPreviewDraft] = useState({ subject: '', body_html: '', body_text: '' });
  const [meetingPreviewResolved, setMeetingPreviewResolved] = useState({ subject: '', body_html: '', body_text: '' });
  const [meetingPreviewLoading, setMeetingPreviewLoading] = useState(false);
  const [meetingPreviewResolving, setMeetingPreviewResolving] = useState(false);
  const [meetingPreviewSaving, setMeetingPreviewSaving] = useState(false);
  const [meetingPreviewError, setMeetingPreviewError] = useState(null);
  const [previewPlaceholderHelp, setPreviewPlaceholderHelp] = useState([]);
  /** Sub-view when viewing resolved template: 'preview' (HTML) | null */
  const [meetingPreviewSubModal, setMeetingPreviewSubModal] = useState(null);
  /** Which resolved modal we are fetching for (for button loading). */
  const [meetingPreviewResolveFor, setMeetingPreviewResolveFor] = useState(null);
  const [meetingPreviewOwnerUserId, setMeetingPreviewOwnerUserId] = useState(null);
  const [meetingPreviewEnvelope, setMeetingPreviewEnvelope] = useState({
    to: '',
    fromLine: '',
    cc: '',
    bcc: '',
  });

  const meetingTemplateHtmlRef = useRef(null);

  const meetingPreviewVariableGroups = useMemo(() => {
    if (!previewPlaceholderHelp.length) return [];
    return [
      {
        moduleKey: 'meeting',
        label: 'Meeting placeholders',
        list: previewPlaceholderHelp.map((name) => ({
          key: name,
          label: formatMergeFieldLabel(name),
        })),
      },
    ];
  }, [previewPlaceholderHelp]);

  const insertTemplateMergeField = useCallback(
    (fieldKey) => {
      if (!canManage) return;
      const token = `{{${fieldKey}}}`;
      const el = document.activeElement;
      const kind = templateTab;
      if (el?.id === 'meeting-template-subject' && el instanceof HTMLInputElement) {
        setEmailTemplates((prev) =>
          prev.map((t) => {
            if (t.template_kind !== kind) return t;
            const v = t.subject ?? '';
            const s = el.selectionStart ?? v.length;
            const e = el.selectionEnd ?? s;
            const next = v.slice(0, s) + token + v.slice(e);
            const pos = s + token.length;
            requestAnimationFrame(() => {
              el.setSelectionRange(pos, pos);
              el.focus();
            });
            return { ...t, subject: next };
          })
        );
        return;
      }
      if (el?.id === 'meeting-template-plain' && el instanceof HTMLTextAreaElement) {
        setEmailTemplates((prev) =>
          prev.map((t) => {
            if (t.template_kind !== kind) return t;
            const v = t.body_text ?? '';
            const s = el.selectionStart ?? v.length;
            const e = el.selectionEnd ?? s;
            const next = v.slice(0, s) + token + v.slice(e);
            const pos = s + token.length;
            requestAnimationFrame(() => {
              el.setSelectionRange(pos, pos);
              el.focus();
            });
            return { ...t, body_text: next };
          })
        );
        return;
      }
      meetingTemplateHtmlRef.current?.insertAtCursor(token);
      meetingTemplateHtmlRef.current?.focus();
    },
    [canManage, templateTab]
  );

  useEffect(() => {
    let c = false;
    emailAccountsAPI
      .getAll(false)
      .then((res) => {
        if (!c) setAccounts(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!c) setAccounts([]);
      });
    return () => {
      c = true;
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

  const agentOptions = useMemo(() => {
    const agents = (teamMembers || [])
      .filter((u) => String(u.role || '').toLowerCase() === 'agent')
      .map((u) => ({ value: String(u.id), label: u.name || u.email || `User ${u.id}` }));
    return [{ value: '', label: 'Select agent' }, ...agents];
  }, [teamMembers]);

  const ownerOptions = useMemo(() => {
    const members = (teamMembers || []).map((u) => ({
      value: String(u.id),
      label: u.name || u.email || `User ${u.id}`,
    }));
    return [{ value: '', label: 'Select owner' }, ...members];
  }, [teamMembers]);

  /**
   * Scoped team dropdowns omit users outside the viewer's hub scope; meeting rows still include
   * assignee/owner IDs. Inject display labels from the loaded meeting so selects don't show raw IDs.
   */
  const agentOptionsResolved = useMemo(() => {
    const base = agentOptions.slice();
    const uid = form.assigned_user_id ? String(form.assigned_user_id) : '';
    if (!uid || base.some((o) => o.value === uid)) return base;
    const m = editing;
    const label =
      (m && String(m.assigned_user_id) === uid && (m.assigned_user_name || m.meeting_owner_name)) || `User ${uid}`;
    return [...base, { value: uid, label: String(label).trim() || `User ${uid}` }];
  }, [agentOptions, form.assigned_user_id, editing]);

  const ownerOptionsResolved = useMemo(() => {
    const base = ownerOptions.slice();
    const uid = form.meeting_owner_user_id ? String(form.meeting_owner_user_id) : '';
    if (!uid || base.some((o) => o.value === uid)) return base;
    const m = editing;
    const label =
      (m && String(m.meeting_owner_user_id) === uid && (m.meeting_owner_name || m.assigned_user_name)) ||
      (m && String(m.assigned_user_id) === uid && m.assigned_user_name) ||
      `User ${uid}`;
    return [...base, { value: uid, label: String(label).trim() || `User ${uid}` }];
  }, [ownerOptions, form.meeting_owner_user_id, editing]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const res = await contactsAPI.getAll({
          search: pickerSearch || undefined,
          type: pickerType,
          page: pickerPage,
          limit: pickerLimit,
        });
        if (cancelled) return;
        setPickerRows(res?.data?.data ?? []);
        setPickerPagination(res?.data?.pagination ?? { total: 0, page: pickerPage, limit: pickerLimit, totalPages: 1 });
      } catch {
        if (cancelled) return;
        setPickerRows([]);
        setPickerPagination({ total: 0, page: pickerPage, limit: pickerLimit, totalPages: 1 });
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerOpen, pickerType, pickerSearch, pickerPage, pickerLimit]);

  useEffect(() => {
    if (!modalOpen) return;
    if (!selectedEntityId) {
      setSelectedEntityDetail(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await contactsAPI.getById(selectedEntityId);
        const data = res?.data?.data ?? null;
        if (!cancelled) {
          setSelectedEntityDetail(data);
          const email = data?.email ? String(data.email).trim() : '';
          if (email && !String(form.attendee_email || '').trim()) {
            setForm((f) => ({ ...f, attendee_email: email }));
            setMeetingFormErrors((e) => ({ ...e, attendee_email: undefined }));
          }
        }
      } catch {
        if (!cancelled) setSelectedEntityDetail(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, selectedEntityId, form.attendee_email]);

  const selectedMobile = useMemo(() => {
    const d = selectedEntityDetail;
    if (!d) return '';
    if (d.primary_phone) return String(d.primary_phone);
    const phones = Array.isArray(d.phones) ? d.phones : [];
    const primary = phones.find((p) => p && p.is_primary) || phones[0];
    return primary?.phone ? String(primary.phone) : '';
  }, [selectedEntityDetail]);

  const { from, to } = useMemo(() => utcMysqlRangeForLocalMonth(year, month0), [year, month0]);

  useEffect(() => {
    let cancelled = false;
    setMetricsLoading(true);
    meetingsAPI
      .metrics({ email_account_id: emailFilter || undefined })
      .then((res) => {
        if (!cancelled) setMetrics(res?.data?.data ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.response?.data?.error || e?.message || 'Failed to load metrics');
          setMetrics(null);
        }
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [emailFilter]);

  useEffect(() => {
    if (viewMode !== 'calendar') return;
    let cancelled = false;
    setCalendarLoading(true);
    setError(null);
    const params = { from, to };
    if (emailFilter) params.email_account_id = emailFilter;
    meetingsAPI
      .list(params)
      .then((res) => {
        if (!cancelled) setMeetings(res?.data?.data ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.response?.data?.error || e?.message || 'Failed to load calendar');
          setMeetings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, from, to, emailFilter, dataVersion]);

  const bumpMeetingsData = useCallback(() => {
    setDataVersion((v) => v + 1);
    meetingsAPI.metrics({ email_account_id: emailFilter || undefined }).then((res) => setMetrics(res?.data?.data ?? null)).catch(() => {});
  }, [emailFilter]);

  useEffect(() => {
    if (viewMode !== 'list') return;
    let cancelled = false;
    setListLoading(true);
    setError(null);
    meetingsAPI
      .list({
        page: listPage,
        limit: listLimit,
        search: listSearch || undefined,
        email_account_id: emailFilter || undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setListRows(res?.data?.data ?? []);
          setListPagination(res?.data?.pagination ?? { total: 0, page: listPage, limit: listLimit, totalPages: 1 });
          setListHasCompletedInitialFetch(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.response?.data?.error || e?.message || 'Failed to load meetings');
          setListRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, listPage, listLimit, listSearch, emailFilter, dataVersion]);

  useEffect(() => {
    setListPage(1);
  }, [emailFilter]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      const d = new Date(String(m.start_at).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) continue;
      const key = toYmd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
    }
    return map;
  }, [meetings]);

  const cells = useMemo(() => buildMonthCells(year, month0), [year, month0]);

  const todayYmd = toYmd(new Date());

  const accountOptions = useMemo(
    () => [{ value: '', label: 'All email accounts' }, ...accounts.map((a) => ({ value: String(a.id), label: a.account_name || a.email_address }))],
    [accounts]
  );

  const formAccountOptions = useMemo(
    () => accounts.filter((a) => a.status === 'active' || a.status == null).map((a) => ({ value: String(a.id), label: a.account_name || a.email_address })),
    [accounts]
  );

  const hasEmailAccounts = (accounts?.length || 0) > 0;

  /** Default new meeting block on a chosen calendar day (local 9:00–10:00). */
  function dayDefaultsForCreate(dayDate) {
    const start = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 9, 0, 0, 0);
    const end = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 10, 0, 0, 0);
    const toLocal = (d) =>
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return { start_at: toLocal(start), end_at: toLocal(end) };
  }

  function openCreate() {
    if (!formAccountOptions.length) return navigate('/email/accounts');
    const first = formAccountOptions[0]?.value || '';
    setSaveSuccessMessage(null);
    setEditing(null);
    setMeetingFormErrors({});
    setSelectedEntityId('');
    setSelectedEntityDetail(null);
    setForm({
      email_account_id: first,
      title: '',
      attendee_email: '',
      location: '',
      description: '',
      start_at: '',
      end_at: '',
      meeting_status: 'scheduled',
      assigned_user_id: '',
      meeting_owner_user_id: '',
      meeting_platform: 'google_meet',
      meeting_duration_min: '30',
      attendance_status: 'unknown',
      send_reminder: true,
      meeting_timezone: DEFAULT_MEETING_TIMEZONE,
    });
    setModalOpen(true);
  }

  function openCreateForDay(dayDate) {
    if (!canManage) return;
    if (!formAccountOptions.length) return navigate('/email/accounts');
    const first = formAccountOptions[0]?.value || '';
    const { start_at, end_at } = dayDefaultsForCreate(dayDate);
    setSaveSuccessMessage(null);
    setEditing(null);
    setMeetingFormErrors({});
    setSelectedEntityId('');
    setSelectedEntityDetail(null);
    setForm({
      email_account_id: first,
      title: '',
      attendee_email: '',
      location: '',
      description: '',
      start_at,
      end_at,
      meeting_status: 'scheduled',
      assigned_user_id: '',
      meeting_owner_user_id: '',
      meeting_platform: 'google_meet',
      meeting_duration_min: '60',
      attendance_status: 'unknown',
      send_reminder: true,
      meeting_timezone: DEFAULT_MEETING_TIMEZONE,
    });
    setModalOpen(true);
  }

  function openEdit(m) {
    setSaveSuccessMessage(null);
    setEditing(m);
    setMeetingFormErrors({});
    setSelectedEntityId(m.contact_id != null ? String(m.contact_id) : '');
    setSelectedEntityDetail(null);
    setForm({
      email_account_id: String(m.email_account_id),
      title: m.title || '',
      attendee_email: m.attendee_email || '',
      location: m.location || '',
      description: m.description || '',
      start_at: utcMysqlOrIsoToLocalDateTimeInput(m.start_at, m.meeting_timezone || DEFAULT_MEETING_TIMEZONE),
      end_at: utcMysqlOrIsoToLocalDateTimeInput(m.end_at, m.meeting_timezone || DEFAULT_MEETING_TIMEZONE),
      meeting_status: m.meeting_status || 'scheduled',
      assigned_user_id: m.assigned_user_id != null ? String(m.assigned_user_id) : '',
      meeting_owner_user_id: m.meeting_owner_user_id != null ? String(m.meeting_owner_user_id) : '',
      meeting_platform: m.meeting_platform || 'google_meet',
      meeting_duration_min: m.meeting_duration_min != null ? String(m.meeting_duration_min) : '30',
      attendance_status: m.attendance_status || 'unknown',
      send_reminder: m.send_reminder == null ? true : Number(m.send_reminder) !== 0,
      meeting_timezone: m.meeting_timezone || DEFAULT_MEETING_TIMEZONE,
    });
    setModalOpen(true);
  }

  async function openMeetingJoin(e, row) {
    e.stopPropagation();
    const url = String(row?.meeting_link || '').trim();
    if (!url) return;
    try {
      await meetingsAPI.recordJoinOpened(row.id);
    } catch {
      /* open link even if tracking fails */
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    bumpMeetingsData();
  }

  async function handleSave(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!selectedEntityId) nextErrors.entity = 'Select a contact or lead';
    if (!form.assigned_user_id) nextErrors.assigned_user_id = 'Assigned agent is required';
    if (!form.meeting_owner_user_id) nextErrors.meeting_owner_user_id = 'Meeting owner is required';
    if (!form.meeting_platform) nextErrors.meeting_platform = 'Platform is required';
    if (!form.meeting_duration_min) nextErrors.meeting_duration_min = 'Duration is required';
    if (!form.title?.trim()) nextErrors.title = 'Title is required';
    if (!form.email_account_id) nextErrors.email_account_id = 'Email account is required';
    if (!form.start_at) nextErrors.start_at = 'Start time is required';
    if (!form.end_at) nextErrors.end_at = 'End time is required';
    setMeetingFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Please fill all required fields marked with *.');
      return;
    }
    const tz = form.meeting_timezone || DEFAULT_MEETING_TIMEZONE;
    const start_at = localDateTimeInputToUtcMysql(form.start_at, tz);
    const end_at = localDateTimeInputToUtcMysql(form.end_at, tz);
    if (!start_at || !end_at) {
      setError('Please provide valid start and end date/time.');
      return;
    }
    const startTs = civilDateTimeLocalStringToUtcMs(form.start_at, tz);
    const endTs = civilDateTimeLocalStringToUtcMs(form.end_at, tz);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      setError('Invalid start/end datetime');
      return;
    }
    const st = String(form.meeting_status || '').toLowerCase();
    if ((st === 'scheduled' || st === 'rescheduled') && startTs < Date.now()) {
      setError('Start time must be in the future for scheduled or rescheduled meetings.');
      return;
    }
    if (endTs <= startTs) {
      setError('End time must be after start time.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccessMessage(null);
    setProviderReconnectRequired(false);
    try {
      const payload = {
        email_account_id: Number(form.email_account_id),
        title: form.title.trim(),
        attendee_email: form.attendee_email?.trim() || null,
        location: form.location?.trim() || null,
        description: form.description?.trim() || null,
        start_at,
        end_at,
        meeting_status: form.meeting_status,
        meeting_platform: form.meeting_platform,
        meeting_duration_min: Number(form.meeting_duration_min),
        meeting_owner_user_id: Number(form.meeting_owner_user_id),
        contact_id: Number(selectedEntityId),
        assigned_user_id: Number(form.assigned_user_id),
        attendance_status: form.attendance_status || 'unknown',
        send_reminder: Boolean(form.send_reminder),
        meeting_timezone: tz,
      };
      if (editing) {
        const res = await meetingsAPI.update(editing.id, payload);
        const meta = res?.data?.meta;
        const toEmail = String(form.attendee_email || '').trim() || 'the attendee';
        if (meta?.attendee_email_notice === 'updated') {
          if (meta.attendee_email_sent) {
            setSaveSuccessMessage(
              `Meeting saved. We sent a schedule update to ${toEmail} because the start or end time changed.`
            );
          } else {
            setSaveSuccessMessage(
              `Meeting saved. The start or end time changed, but the update email could not be sent to ${toEmail}. Check the address and your connected email account.`
            );
          }
        } else if (meta?.attendee_email_notice === 'cancelled') {
          if (meta.attendee_email_sent) {
            setSaveSuccessMessage(`Meeting saved. We sent a cancellation notice to ${toEmail}.`);
          } else {
            setSaveSuccessMessage(
              `Meeting saved. This meeting is cancelled, but the cancellation email could not be sent to ${toEmail}. Check the address and your connected email account.`
            );
          }
        }
      } else {
        await meetingsAPI.create(payload);
      }
      setModalOpen(false);
      bumpMeetingsData();
    } catch (err) {
      setProviderReconnectRequired(isProviderReauthError(err));
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function openEmailTemplatesModal() {
    setTemplateModalOpen(true);
    setTemplateError(null);
    setTemplateLoading(true);
    try {
      const res = await meetingsAPI.getEmailTemplates();
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Failed to load templates');
      setEmailTemplates([]);
      setPlaceholderHelp([]);
    } finally {
      setTemplateLoading(false);
    }
  }

  function updateEmailTemplateDraft(kind, field, value) {
    setEmailTemplates((prev) =>
      prev.map((t) => (t.template_kind === kind ? { ...t, [field]: value } : t))
    );
  }

  async function saveEmailTemplates() {
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const templates = emailTemplates.map(({ template_kind, subject, body_html, body_text }) => ({
        template_kind,
        subject,
        body_html: body_html ?? '',
        body_text: body_text ?? '',
      }));
      const res = await meetingsAPI.putEmailTemplates({ templates });
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
      setTemplateModalOpen(false);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function confirmResetTemplate() {
    if (!resetTemplateKind) return;
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      await meetingsAPI.resetEmailTemplate({ template_kind: resetTemplateKind });
      const res = await meetingsAPI.getEmailTemplates();
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
      setResetTemplateKind(null);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Reset failed');
    } finally {
      setTemplateSaving(false);
    }
  }

  const activeTemplate = emailTemplates.find((t) => t.template_kind === templateTab);

  async function refreshMeetingPreviewWithDraft(draft) {
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewKind(kind);
    setMeetingPreviewResolving(true);
    setMeetingPreviewError(null);
    try {
      const meeting = meetingPayloadFromForm(form, accounts, editing);
      const res = await meetingsAPI.postAttendeeEmailWorkspace({
        template_kind: kind,
        meeting,
        template_override: {
          subject: draft.subject,
          body_html: draft.body_html,
          body_text: draft.body_text,
        },
      });
      const d = res?.data?.data;
      const env = d?.envelope || {};
      const own = d?.owner_settings || {};
      const accLabel = String(env.account_label || '').trim();
      const accEmail = String(env.account_email || '').trim();
      setMeetingPreviewOwnerUserId(d?.meeting_owner_user_id != null ? Number(d.meeting_owner_user_id) : null);
      setMeetingPreviewEnvelope({
        to: String(env.to_email || '').trim() || '—',
        fromLine: accEmail ? `${accLabel || accEmail} <${accEmail}>` : '—',
        cc: String(own.default_cc_email || '').trim(),
        bcc: String(own.default_bcc_email || '').trim(),
      });
      const prev = d?.preview;
      setMeetingPreviewResolved({
        subject: prev?.subject ?? '',
        body_html: prev?.body_html ?? '',
        body_text: prev?.body_text ?? '',
      });
      return true;
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Preview failed');
      return false;
    } finally {
      setMeetingPreviewResolving(false);
    }
  }

  async function openMeetingPreviewResolvedModal(mode) {
    setMeetingPreviewResolveFor(mode);
    try {
      const ok = await refreshMeetingPreviewWithDraft(meetingPreviewDraft);
      if (ok) setMeetingPreviewSubModal(mode);
    } finally {
      setMeetingPreviewResolveFor(null);
    }
  }

  async function openMeetingEmailPreview() {
    if (!form.email_account_id) {
      setError('Select an email account to preview the attendee email.');
      return;
    }
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewError(null);
    setMeetingPreviewKind(kind);
    setMeetingPreviewSubModal(null);
    setMeetingPreviewResolveFor(null);
    setMeetingPreviewOpen(true);
    setMeetingPreviewLoading(true);
    try {
      const meeting = meetingPayloadFromForm(form, accounts, editing);
      const res = await meetingsAPI.postAttendeeEmailWorkspace({
        template_kind: kind,
        meeting,
      });
      const d = res?.data?.data;
      setPreviewPlaceholderHelp(res?.data?.placeholder_help ?? []);
      const own = d?.owner_settings || {};
      const tpl = d?.template;
      const draft = {
        subject: tpl?.subject ?? '',
        body_html: tpl?.body_html ?? '',
        body_text: tpl?.body_text ?? '',
      };
      setMeetingPreviewDraft(draft);
      const env = d?.envelope || {};
      const accLabel = String(env.account_label || '').trim();
      const accEmail = String(env.account_email || '').trim();
      setMeetingPreviewOwnerUserId(d?.meeting_owner_user_id != null ? Number(d.meeting_owner_user_id) : null);
      setMeetingPreviewEnvelope({
        to: String(env.to_email || '').trim() || '—',
        fromLine: accEmail ? `${accLabel || accEmail} <${accEmail}>` : '—',
        cc: String(own.default_cc_email || '').trim(),
        bcc: String(own.default_bcc_email || '').trim(),
      });
      const prev = d?.preview;
      setMeetingPreviewResolved({
        subject: prev?.subject ?? '',
        body_html: prev?.body_html ?? '',
        body_text: prev?.body_text ?? '',
      });
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Failed to load template');
    } finally {
      setMeetingPreviewLoading(false);
    }
  }

  async function saveMeetingTemplateFromPreview() {
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewSaving(true);
    setMeetingPreviewError(null);
    try {
      const body = {
        templates: [
          {
            template_kind: kind,
            subject: meetingPreviewDraft.subject,
            body_html: meetingPreviewDraft.body_html,
            body_text: meetingPreviewDraft.body_text,
          },
        ],
      };
      const ownerId = meetingPreviewOwnerUserId != null ? Number(meetingPreviewOwnerUserId) : null;
      const myId = user?.id != null ? Number(user.id) : null;
      if (ownerId && myId && ownerId !== myId) {
        body.for_user_id = ownerId;
      }
      await meetingsAPI.putUserAttendeeEmailTemplates(body);
      setMeetingPreviewSubModal(null);
      setMeetingPreviewResolveFor(null);
      setMeetingPreviewOpen(false);
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setMeetingPreviewSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await meetingsAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
      bumpMeetingsData();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const monthTitle = formatMonthYear(new Date(year, month0, 1));

  const listTotalPages = Math.max(1, listPagination.totalPages || 1);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Meetings"
        titleIcon="event"
        description="Meetings from connected email—add attendees and track status."
        actions={
          canManage ? (
            <div className={styles.headerActions}>
              <Button type="button" variant="secondary" onClick={openEmailTemplatesModal}>
                Email templates
              </Button>
              <Button type="button" onClick={openCreate} disabled={!hasEmailAccounts}>
                Add meeting
              </Button>
            </div>
          ) : undefined
        }
      />

      {!hasEmailAccounts ? (
        <Alert variant="info" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Connect an email account under Email → Accounts before scheduling meetings.</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/email/accounts')}>
              Connect email account
            </Button>
          </div>
        </Alert>
      ) : null}

      {error && (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      )}

      {saveSuccessMessage ? (
        <Alert variant="success" display="inline" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <span>{saveSuccessMessage}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSaveSuccessMessage(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      ) : null}

      <MeetingMetricCards data={metrics} loading={metricsLoading} />

      <div className={styles.toolbar}>
        <div className={styles.viewToggle} role="group" aria-label="View mode">
          <Button
            type="button"
            variant={viewMode === 'calendar' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </Button>
          <Button type="button" variant={viewMode === 'list' ? 'primary' : 'secondary'} size="sm" onClick={() => setViewMode('list')}>
            List
          </Button>
        </div>
        {viewMode === 'calendar' ? (
          <div className={styles.monthNav}>
            <Button type="button" variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>
              ←
            </Button>
            <span className={styles.monthTitle}>{monthTitle}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => shiftMonth(1)}>
              →
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const t = new Date();
                setYear(t.getFullYear());
                setMonth0(t.getMonth());
              }}
            >
              Today
            </Button>
          </div>
        ) : null}
        <div className={styles.toolbarAccount}>
          <Select
            label="Email account"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            options={accountOptions}
          />
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className={styles.calendarWrap}>
          <div className={styles.calHeader}>
            {WEEKDAYS.map((w) => (
              <div key={w} className={styles.calHeaderCell}>
                {w}
              </div>
            ))}
          </div>
          <div className={styles.calGrid}>
            {cells.map((cell, idx) => {
              const key = toYmd(cell.date);
              const dayMeetings = byDay.get(key) || [];
              const isToday = key === todayYmd;
              const dayLabel = formatDate(cell.date);
              return (
                <div
                  key={`${idx}-${key}`}
                  className={`${styles.calCell} ${cell.inMonth ? '' : styles.calCellMuted} ${isToday ? styles.calCellToday : ''} ${canManage ? styles.calCellInteractive : ''}`}
                  role={canManage ? 'button' : undefined}
                  tabIndex={canManage ? 0 : undefined}
                  aria-label={canManage ? `Add meeting on ${dayLabel}` : undefined}
                  onClick={canManage ? () => openCreateForDay(cell.date) : undefined}
                  onKeyDown={
                    canManage
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openCreateForDay(cell.date);
                          }
                        }
                      : undefined
                  }
                >
                  <div className={styles.calDayNum}>{cell.date.getDate()}</div>
                  {dayMeetings.slice(0, 4).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`${styles.meetingChip} ${styles[meetingChipStatusClass(m)]} ${isToday ? styles.meetingChip_today : ''}`}
                      title={`${m.title} (${m.meeting_status})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(m);
                      }}
                    >
                      {formatTime(String(m.start_at || '').replace(' ', 'T'))} {m.title}
                    </button>
                  ))}
                  {dayMeetings.length > 4 ? (
                    <div className={styles.listHint} onClick={(e) => e.stopPropagation()}>
                      +{dayMeetings.length - 4} more
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {calendarLoading ? <div className={styles.calendarLoadingOverlay}>Loading…</div> : null}
        </div>
      ) : (
        <div className={listStyles.tableCard}>
          <div className={listStyles.tableCardToolbarTop}>
            <div className={listStyles.tableCardToolbarLeft}>
              <PaginationPageSize
                limit={listPagination.limit ?? listLimit}
                onLimitChange={(n) => {
                  setListLimit(n);
                  setListPage(1);
                }}
              />
            </div>
            <SearchInput
              value={listSearch}
              onSearch={(v) => {
                setListSearch(v);
                setListPage(1);
              }}
              placeholder="Search title, attendee, location… (Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion
            loading={listLoading}
            hasCompletedInitialFetch={listHasCompletedInitialFetch}
            skeletonColumns={8}
          >
            {listRows.length === 0 && !listLoading ? (
              <div className={listStyles.tableCardEmpty}>
                <p className={styles.listHint} style={{ margin: 0 }}>
                  No meetings match your filters. Try another search or email account.
                </p>
              </div>
            ) : (
              <div className={listStyles.tableCardBody}>
                <Table variant="adminList" flexibleLastColumn>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Title</TableHeaderCell>
                      <TableHeaderCell width="140px">Created by</TableHeaderCell>
                      <TableHeaderCell width="120px">Status</TableHeaderCell>
                      <TableHeaderCell width="100px">Join</TableHeaderCell>
                      <TableHeaderCell width="160px">Start</TableHeaderCell>
                      <TableHeaderCell width="160px">End</TableHeaderCell>
                      <TableHeaderCell>Attendee</TableHeaderCell>
                      <TableHeaderCell>Account</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listRows.map((row) => (
                      <TableRow key={row.id} onClick={() => openEdit(row)} className={styles.listRowClickable}>
                        <TableCell noTruncate>{row.title || '—'}</TableCell>
                        <TableCell noTruncate>{meetingCreatedByLabel(row, user?.id)}</TableCell>
                        <TableCell>
                          <Badge variant={meetingStatusBadgeVariant(row.meeting_status)} size="sm">
                            {row.meeting_status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell noTruncate onClick={(e) => e.stopPropagation()}>
                          {String(row.meeting_status || '').toLowerCase() !== 'cancelled' &&
                          String(row.meeting_link || '').trim() ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={(e) => openMeetingJoin(e, row)}
                            >
                              Join
                            </Button>
                          ) : (
                            <span className={styles.listHint}>—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatMeetingWhen(row.start_at, formatDateTime)}</TableCell>
                        <TableCell>{formatMeetingWhen(row.end_at, formatDateTime)}</TableCell>
                        <TableCell>{row.attendee_email || '—'}</TableCell>
                        <TableCell>{row.account_label || row.account_email || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableDataRegion>
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={listPagination.page ?? listPage}
              totalPages={listTotalPages}
              total={listPagination.total ?? 0}
              limit={listPagination.limit ?? listLimit}
              onPageChange={setListPage}
              hidePageSize
            />
          </div>
        </div>
      )}

      <p className={styles.listHint}>
        Metrics reflect all meetings{emailFilter ? ' for the selected account' : ''}.
        {viewMode === 'calendar'
          ? ' The calendar shows the current month in your local time.'
          : ' The list is sorted by start time (newest first) and supports search across title, attendee, location, and notes.'}
      </p>

      <SlidePanel
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          <span className={styles.panelTitleWithIcon}>
            <UiIcon className={styles.panelTitleIconMeeting}>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </UiIcon>
            {editing ? 'Edit meeting' : 'New meeting'}
          </span>
        }
        size="xl"
        closeOnOverlay={!saving}
        closeOnEscape={!saving}
        footer={
          <ModalFooter>
            <div className={styles.modalFooterFullWidth}>
              <div className={styles.modalFooterRow}>
                <div className={styles.modalFooterLeft}>
                  {editing && canManage ? (
                    <Button type="button" variant="danger" onClick={() => setDeleteTarget(editing)} disabled={saving} className={styles.footerBtn}>
                      Delete
                    </Button>
                  ) : null}
                </div>
                <div className={styles.modalFooterRight}>
                  <Button type="button" variant="secondary" onClick={() => navigate('/settings/meetings-mail-settings')} disabled={saving} className={styles.footerBtnWide}>
                    <UiIcon>
                      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                      <path d="m3.5 7 8.5 6 8.5-6" />
                    </UiIcon>
                    Meetings mail settings
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving} className={styles.footerBtn}>
                    {canManage ? 'Cancel' : 'Close'}
                  </Button>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openMeetingEmailPreview}
                      disabled={!form.email_account_id || saving}
                      className={styles.footerBtnWide}
                    >
                      <UiIcon>
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="2.75" />
                      </UiIcon>
                      Preview & edit email
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button type="submit" form="meeting-form" loading={saving} disabled={saving} className={styles.footerBtnPrimary}>
                      <UiIcon>
                        <path d="M20 7 9 18l-5-5" />
                      </UiIcon>
                      Save
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </ModalFooter>
        }
      >
        <form id="meeting-form" onSubmit={handleSave}>
          <p className={styles.panelSubtitle}>
            {editing ? 'Update meeting details and keep attendees in sync.' : 'Schedule and share a meeting with your contacts.'}
          </p>
          {providerReconnectRequired ? (
            <Alert variant="warning" style={{ marginBottom: 12 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className={styles.listHint} style={{ fontWeight: 700, marginBottom: 6 }}>
                Link to CRM
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManage || !!editing}
                  title={editing ? 'Contact or lead cannot be changed after this meeting is created.' : undefined}
                  onClick={() => {
                    setPickerType('contact');
                    setPickerSearch('');
                    setPickerPage(1);
                    setPickerOpen(true);
                    setMeetingFormErrors((e2) => ({ ...e2, entity: undefined }));
                  }}
                >
                  <UiIcon>
                    <circle cx="12" cy="12" r="3.5" />
                    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.2a1.8 1.8 0 0 1 0-3.6h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 0 1 0 3.6h-.2a1 1 0 0 0-.9.6Z" />
                  </UiIcon>
                  Pick contact
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManage || !!editing}
                  title={editing ? 'Contact or lead cannot be changed after this meeting is created.' : undefined}
                  onClick={() => {
                    setPickerType('lead');
                    setPickerSearch('');
                    setPickerPage(1);
                    setPickerOpen(true);
                    setMeetingFormErrors((e2) => ({ ...e2, entity: undefined }));
                  }}
                >
                  <UiIcon>
                    <path d="M12 13v8" />
                    <path d="M17 10v11" />
                    <path d="M7 16v5" />
                    <path d="M20 5H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
                    <circle cx="7.5" cy="8.5" r="1.2" />
                  </UiIcon>
                  Pick lead
                </Button>
              </div>
              {selectedEntityId ? (
                <div className={styles.entityCard} style={{ marginTop: 10 }}>
                  <div className={styles.entityCardTitle}>
                    Selected {String(selectedEntityDetail?.type || 'contact') === 'lead' ? 'lead' : 'contact'} details
                  </div>
                  <div className={styles.entityCardGrid}>
                    <div>
                      <div className={styles.entityFieldLabel}>Name</div>
                      <div className={styles.entityFieldValue}>{selectedEntityDetail?.display_name || '—'}</div>
                    </div>
                    <div>
                      <div className={styles.entityFieldLabel}>Email</div>
                      <div className={styles.entityFieldValue}>{selectedEntityDetail?.email || '—'}</div>
                    </div>
                    <div>
                      <div className={styles.entityFieldLabel}>Mobile</div>
                      <div className={styles.entityFieldValue}>{selectedMobile || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : null}
              {meetingFormErrors.entity ? (
                <div className={styles.listHint} style={{ marginTop: 6, color: 'var(--color-danger, #ef4444)', fontWeight: 700 }}>
                  {meetingFormErrors.entity}
                </div>
              ) : null}
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconBlue}`}>
              <UiIcon>
                <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                <path d="m3.5 7 8.5 6 8.5-6" />
              </UiIcon>
              <Select
                label="Email account *"
                value={form.email_account_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, email_account_id: e.target.value }));
                  setMeetingFormErrors((e2) => ({ ...e2, email_account_id: undefined }));
                }}
                options={formAccountOptions}
                required
                disabled={!canManage || !!editing}
                error={meetingFormErrors.email_account_id}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconIndigo}`}>
              <UiIcon>
                <path d="M20 21v-1.5a4 4 0 0 0-4-4h-8a4 4 0 0 0-4 4V21" />
                <circle cx="12" cy="8" r="3.5" />
              </UiIcon>
              <Select
                label="Assigned to *"
                value={form.assigned_user_id}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    assigned_user_id: e.target.value,
                    meeting_owner_user_id: f.meeting_owner_user_id || e.target.value,
                  }));
                  setMeetingFormErrors((e2) => ({ ...e2, assigned_user_id: undefined }));
                }}
                options={agentOptionsResolved}
                disabled={!canManage}
                error={meetingFormErrors.assigned_user_id}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconSky}`}>
              <UiIcon>
                <circle cx="12" cy="7.8" r="3.3" />
                <path d="M4 20.5c1.8-3.1 4.2-4.7 8-4.7s6.2 1.6 8 4.7" />
              </UiIcon>
              <Select
                label="Meeting owner *"
                value={form.meeting_owner_user_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, meeting_owner_user_id: e.target.value }));
                  setMeetingFormErrors((e2) => ({ ...e2, meeting_owner_user_id: undefined }));
                }}
                options={ownerOptionsResolved}
                disabled={!canManage}
                error={meetingFormErrors.meeting_owner_user_id}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconTeal}`}>
              <UiIcon>
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M7 2.8v4M17 2.8v4M3 10h18" />
              </UiIcon>
              <Select
                label="Platform *"
                value={form.meeting_platform}
                onChange={(e) => {
                  setForm((f) => ({ ...f, meeting_platform: e.target.value }));
                  setMeetingFormErrors((e2) => ({ ...e2, meeting_platform: undefined }));
                }}
                options={[
                  { value: 'google_meet', label: 'Google Meet' },
                  { value: 'microsoft_teams', label: 'Microsoft Teams' },
                ]}
                disabled={!canManage}
                error={meetingFormErrors.meeting_platform}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconBlue}`}>
              <UiIcon>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.8v4.8l3 2" />
              </UiIcon>
              <Select
                label="Duration *"
                value={form.meeting_duration_min}
                onChange={(e) => {
                  const mins = Number(e.target.value || 0);
                  setForm((f) => {
                    const z = f.meeting_timezone || DEFAULT_MEETING_TIMEZONE;
                    const endAt =
                      f.start_at && Number.isFinite(mins) && mins > 0
                        ? addMinutesToCivilDateTimeLocalString(f.start_at, mins, z)
                        : f.end_at;
                    return { ...f, meeting_duration_min: e.target.value, end_at: endAt };
                  });
                  setMeetingFormErrors((e2) => ({ ...e2, meeting_duration_min: undefined }));
                }}
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '45', label: '45 minutes' },
                  { value: '60', label: '60 minutes' },
                  { value: '90', label: '90 minutes' },
                ]}
                disabled={!canManage}
                error={meetingFormErrors.meeting_duration_min}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconIndigo}`}>
              <UiIcon>
                <path d="M4 7.5h16" />
                <path d="M4 12h12" />
                <path d="M4 16.5h9" />
              </UiIcon>
              <Input
                label="Title *"
                value={form.title}
                onChange={(e) => {
                  setForm((f) => ({ ...f, title: e.target.value }));
                  setMeetingFormErrors((e2) => ({ ...e2, title: undefined }));
                }}
                required
                disabled={!canManage}
                error={meetingFormErrors.title}
                inputClassName={styles.iconInput}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconSky}`}>
              <UiIcon>
                <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
                <path d="m3.5 8 8.5 5.5L20.5 8" />
              </UiIcon>
              <Input
                label="Attendee email"
                type="email"
                value={form.attendee_email}
                onChange={(e) => setForm((f) => ({ ...f, attendee_email: e.target.value }))}
                placeholder="client@example.com"
                disabled={!canManage}
                inputClassName={styles.iconInput}
              />
            </div>
            <div className={`${styles.iconField} ${styles.followUpIconTeal}`}>
              <UiIcon>
                <path d="M12 20.5s7-4.7 7-10a7 7 0 1 0-14 0c0 5.3 7 10 7 10Z" />
                <circle cx="12" cy="10.5" r="2.3" />
              </UiIcon>
              <Input
                label="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                disabled={!canManage}
                inputClassName={styles.iconInput}
              />
            </div>
            {editing && (form.meeting_platform === 'google_meet' || form.meeting_platform === 'microsoft_teams') ? (
              <div style={{ gridColumn: '1 / -1' }}>
                {String(editing.meeting_link || '').trim() ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span className={styles.listHint} style={{ wordBreak: 'break-all', flex: '1 1 240px', margin: 0 }}>
                      {editing.meeting_link}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canManage}
                      onClick={async () => {
                        const url = String(editing.meeting_link || '').trim();
                        if (!url) return;
                        try {
                          await meetingsAPI.recordJoinOpened(editing.id);
                        } catch {
                          /* ignore */
                        }
                        window.open(url, '_blank', 'noopener,noreferrer');
                        bumpMeetingsData();
                      }}
                    >
                      Open meeting
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => {
                        void navigator.clipboard?.writeText(String(editing.meeting_link || ''));
                      }}
                    >
                      Copy link
                    </Button>
                  </div>
                ) : (
                  <Alert variant="warning" style={{ marginBottom: 0 }}>
                    No video link yet. Connect a Google or Microsoft email account with calendar permissions, then save the
                    meeting again so a real Meet or Teams room can be created.
                  </Alert>
                )}
              </div>
            ) : null}
            <div className={`${styles.iconField} ${styles.followUpIconBlue}`} style={{ gridColumn: '1 / -1' }}>
              <UiIcon>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </UiIcon>
              <Select
                label="Meeting timezone *"
                value={form.meeting_timezone || DEFAULT_MEETING_TIMEZONE}
                onChange={(e) => {
                  setForm((f) => ({ ...f, meeting_timezone: e.target.value }));
                  setMeetingFormErrors((e2) => ({ ...e2, meeting_timezone: undefined }));
                }}
                options={COMMON_TIMEZONE_OPTIONS}
                required
                disabled={!canManage}
                error={meetingFormErrors.meeting_timezone}
              />
            </div>
            <div>
              <DateTimePickerField
                label="Start *"
                mode="datetime"
                value={form.start_at}
                min={formatDateTimeLocalInputValue(new Date())}
                onChange={(v) => {
                  setForm((f) => {
                    const z = f.meeting_timezone || DEFAULT_MEETING_TIMEZONE;
                    const mins = Number(f.meeting_duration_min || 0);
                    const endAt =
                      v && Number.isFinite(mins) && mins > 0 ? addMinutesToCivilDateTimeLocalString(v, mins, z) : f.end_at;
                    return { ...f, start_at: v, end_at: endAt };
                  });
                  setMeetingFormErrors((e2) => ({ ...e2, start_at: undefined, end_at: undefined }));
                }}
                required
                disabled={!canManage}
                error={meetingFormErrors.start_at}
              />
            </div>
            <div>
              <DateTimePickerField
                label="End *"
                mode="datetime"
                value={form.end_at}
                min={form.start_at || formatDateTimeLocalInputValue(new Date())}
                onChange={(v) => {
                  setForm((f) => ({ ...f, end_at: v }));
                  setMeetingFormErrors((e2) => ({ ...e2, end_at: undefined }));
                }}
                required
                disabled={!canManage}
                error={meetingFormErrors.end_at}
              />
            </div>
            <div className={styles.iconField}>
              <UiIcon>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </UiIcon>
              <Select
                label="Attendance"
                value={form.attendance_status}
                onChange={(e) => setForm((f) => ({ ...f, attendance_status: e.target.value }))}
                options={ATTENDANCE_OPTIONS}
                disabled={!canManage}
              />
            </div>
            <div className={styles.statusWithReminderRow} style={{ gridColumn: '1 / -1' }}>
              <div className={`${styles.iconField} ${styles.statusWithReminderSelect}`}>
                <UiIcon>
                  <path d="M4 12h16" />
                  <path d="M4 6h12" />
                  <path d="M4 18h10" />
                </UiIcon>
                <Select
                  label="Status"
                  value={form.meeting_status}
                  onChange={(e) => setForm((f) => ({ ...f, meeting_status: e.target.value }))}
                  options={MEETING_STATUS_OPTIONS}
                  disabled={!canManage}
                />
              </div>
              <div className={styles.statusWithReminderCheck}>
                <Checkbox
                  label="Send reminder"
                  checked={Boolean(form.send_reminder)}
                  onChange={(e) => setForm((f) => ({ ...f, send_reminder: e.target.checked }))}
                  disabled={!canManage}
                />
              </div>
            </div>
          </div>
          <div className={styles.helperNotice}>
            <UiIcon>
              <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
              <path d="m3.5 7 8.5 6 8.5-6" />
            </UiIcon>
            <p className={styles.helperNoticeText}>
              Open <strong>Preview &amp; edit email</strong> to see the outgoing message, edit the template using placeholders
              like <code>{'{{title}}'}</code>, and save it as your tenant default for this notification type (new / update /
              cancelled).
            </p>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className={`${styles.iconField} ${styles.iconFieldTextarea} ${styles.followUpIconSky}`}>
              <UiIcon>
                <path d="M4 7.5h16" />
                <path d="M4 12h16" />
                <path d="M4 16.5h11" />
              </UiIcon>
              <Textarea
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes"
                disabled={!canManage}
                rows={3}
                textareaClassName={styles.iconTextarea}
              />
            </div>
          </div>
        </form>
      </SlidePanel>

      <Modal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={pickerType === 'lead' ? 'Select lead' : 'Select contact'}
        size="lg"
        footer={
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setPickerOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <Input
              label="Search"
              value={pickerSearch}
              onChange={(e) => {
                setPickerSearch(e.target.value);
                setPickerPage(1);
              }}
              placeholder={pickerType === 'lead' ? 'Search leads…' : 'Search contacts…'}
            />
          </div>
          <PaginationPageSize
            limit={pickerLimit}
            onLimitChange={(n) => {
              setPickerLimit(n);
              setPickerPage(1);
            }}
          />
        </div>

        <TableDataRegion
          loading={pickerLoading}
          hasCompletedInitialFetch
          skeletonColumns={3}
        >
          {pickerRows.length === 0 && !pickerLoading ? (
            <div className={listStyles.tableCardEmpty}>No results.</div>
          ) : (
            <div className={listStyles.tableCardBody} style={{ padding: 0 }}>
              <Table variant="adminList" flexibleLastColumn>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell width="180px">Phone</TableHeaderCell>
                    <TableHeaderCell width="260px">Email</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pickerRows.map((c) => (
                    <TableRow
                      key={c.id}
                      onClick={() => {
                        setSelectedEntityId(String(c.id));
                        setPickerOpen(false);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Click to select"
                    >
                      <TableCell noTruncate>{c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</TableCell>
                      <TableCell noTruncate>{c.primary_phone || '—'}</TableCell>
                      <TableCell noTruncate>{c.email || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TableDataRegion>
        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pickerPagination.page ?? pickerPage}
            totalPages={Math.max(1, pickerPagination.totalPages || 1)}
            total={pickerPagination.total ?? 0}
            limit={pickerPagination.limit ?? pickerLimit}
            onPageChange={setPickerPage}
            hidePageSize
          />
        </div>
      </Modal>

      <SlidePanel
        isOpen={meetingPreviewOpen}
        onClose={() => {
          if (meetingPreviewSaving || meetingPreviewLoading) return;
          setMeetingPreviewSubModal(null);
          setMeetingPreviewResolveFor(null);
          setMeetingPreviewOpen(false);
        }}
        title={`Attendee email — ${meetingPreviewKindLabel(meetingPreviewKind)}`}
        size="xl"
        closeOnOverlay={!meetingPreviewSaving && !meetingPreviewLoading}
        closeOnEscape={!meetingPreviewSaving && !meetingPreviewLoading}
        footer={
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMeetingPreviewSubModal(null);
                setMeetingPreviewResolveFor(null);
                setMeetingPreviewOpen(false);
              }}
              disabled={meetingPreviewSaving}
            >
              Close
            </Button>
            {canManage ? (
              <Button
                type="button"
                onClick={saveMeetingTemplateFromPreview}
                loading={meetingPreviewSaving}
                disabled={meetingPreviewLoading || meetingPreviewResolving}
              >
                Save as default template
              </Button>
            ) : null}
          </ModalFooter>
        }
      >
        {meetingPreviewError && (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {meetingPreviewError}
          </Alert>
        )}
        {meetingPreviewLoading ? (
          <p className={styles.listHint}>Loading…</p>
        ) : (
          <div className={styles.meetingEmailModal}>
            <div className={`${styles.previewPanel} ${styles.previewPanelCompose} ${styles.composeOnlyPanel}`}>
              <h4 className={styles.previewPanelTitle}>Compose</h4>
              <div className={styles.composePreviewSubjectBlock}>
                <Input
                  id="meeting-preview-subject"
                  label="Subject"
                  value={meetingPreviewDraft.subject}
                  onChange={(e) => setMeetingPreviewDraft((d) => ({ ...d, subject: e.target.value }))}
                  disabled={!canManage}
                />
              </div>
              <div className={styles.composeMessageBlock}>
                <div className={`${infoHelpHeadingRowClassName} ${styles.composeMessageLabelRow}`}>
                  <h4 className={styles.composeMessageHeading}>Message (formatted)</h4>
                  <InfoHelpIcon
                    title="Formatted message info"
                    modalTitle="Message (formatted)"
                    message="Use the toolbar for formatting. Insert meeting fields with Variable in the toolbar (same as call scripts)."
                    size="sm"
                  />
                </div>
                <ScriptBodyEditor
                  key={meetingPreviewKind}
                  scrollableLayout
                  enableHtmlSourceToggle
                  variableGroups={meetingPreviewVariableGroups}
                  value={meetingPreviewDraft.body_html}
                  onChange={(html) => setMeetingPreviewDraft((d) => ({ ...d, body_html: html }))}
                  readOnly={!canManage}
                  placeholder="Write the email. Use Variable ▾ in the toolbar to insert {{fields}}."
                />
              </div>
              <div className={styles.composePreviewActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openMeetingPreviewResolvedModal('preview')}
                  loading={meetingPreviewResolving && meetingPreviewResolveFor === 'preview'}
                  disabled={meetingPreviewLoading || !!meetingPreviewResolveFor}
                >
                  Preview (this meeting)
                </Button>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>

      <Modal
        isOpen={meetingPreviewOpen && meetingPreviewSubModal === 'preview'}
        onClose={() => setMeetingPreviewSubModal(null)}
        title="Preview — with this meeting"
        size="lg"
        footer={
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setMeetingPreviewSubModal(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {meetingPreviewResolving ? (
          <p className={styles.listHint}>Updating…</p>
        ) : (
          <div className={styles.previewMeetingEmailModal}>
            <div className={`${attendeeMailStyles.previewPanel} ${styles.previewMeetingPanel}`}>
              <div className={attendeeMailStyles.previewSectionHead}>
                <span className={attendeeMailStyles.previewSectionIcon} aria-hidden>
                  <MaterialSymbol name="visibility" size="md" />
                </span>
                <div className={styles.previewMeetingHeadText}>
                  <div className={`${infoHelpHeadingRowClassName} ${styles.previewMeetingTitleRow}`}>
                    <h2 className={attendeeMailStyles.previewSectionTitle}>Email Preview</h2>
                    <InfoHelpIcon
                      title="Preview info"
                      modalTitle="Email preview"
                      message={
                        'Matches the sent attendee email: same email account, To, and optional CC/BCC from the meeting owner’s Meetings mail settings.\n\nThe message body is exactly what you edit in your template (including any meeting summary and calendar links you add with merge fields).'
                      }
                      size="sm"
                    />
                  </div>
                  <p className={attendeeMailStyles.previewSectionSubtitle}>
                    {meetingPreviewEmailSubtitle(meetingPreviewKind)}
                  </p>
                </div>
              </div>

              <div className={attendeeMailStyles.previewMeta}>
                <div className={attendeeMailStyles.previewMetaRow}>
                  <span className={attendeeMailStyles.previewMetaLabel}>Subject</span>
                  <span className={attendeeMailStyles.previewSubject}>{meetingPreviewResolved.subject || '—'}</span>
                </div>
                <div className={attendeeMailStyles.previewMetaRow}>
                  <span className={attendeeMailStyles.previewMetaLabel}>To</span>
                  <span>{meetingPreviewEnvelope.to}</span>
                </div>
                <div className={attendeeMailStyles.previewMetaRow}>
                  <span className={attendeeMailStyles.previewMetaLabel}>CC</span>
                  <span
                    className={
                      !String(meetingPreviewEnvelope.cc || '').trim() ? attendeeMailStyles.previewMetaFaint : ''
                    }
                  >
                    {previewMetaCcBccDisplay(meetingPreviewEnvelope.cc)}
                  </span>
                </div>
                <div className={attendeeMailStyles.previewMetaRow}>
                  <span className={attendeeMailStyles.previewMetaLabel}>BCC</span>
                  <span
                    className={
                      !String(meetingPreviewEnvelope.bcc || '').trim() ? attendeeMailStyles.previewMetaFaint : ''
                    }
                  >
                    {previewMetaCcBccDisplay(meetingPreviewEnvelope.bcc)}
                  </span>
                </div>
              </div>

              <div className={`${attendeeMailStyles.previewBodyRegion} ${styles.previewMeetingBodyRegion}`}>
                <div className={attendeeMailStyles.previewStream}>
                  <div
                    className={attendeeMailStyles.previewBody}
                    dangerouslySetInnerHTML={{
                      __html: meetingPreviewResolved.body_html?.trim()
                        ? meetingPreviewResolved.body_html
                        : '<p>—</p>',
                    }}
                  />
                </div>
              </div>

              <div className={attendeeMailStyles.previewInfoBanner}>
                <MaterialSymbol name="info" size="sm" className={attendeeMailStyles.previewInfoIcon} aria-hidden />
                <span>Preview uses this meeting’s data. Calendar links appear when your template includes them.</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete meeting"
        message={deleteTarget ? `Remove "${deleteTarget.title}"?` : ''}
        confirmText="Delete"
        loading={saving}
      />

      <SlidePanel
        isOpen={templateModalOpen}
        onClose={() => !templateSaving && setTemplateModalOpen(false)}
        title="Meeting notification emails"
        size="wide"
        closeOnOverlay={!templateSaving}
        closeOnEscape={!templateSaving}
        footer={
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setTemplateModalOpen(false)} disabled={templateSaving}>
              {canManage ? 'Cancel' : 'Close'}
            </Button>
            {canManage ? (
              <Button
                type="button"
                onClick={saveEmailTemplates}
                loading={templateSaving}
                disabled={templateLoading || emailTemplates.length < 1}
              >
                Save templates
              </Button>
            ) : null}
          </ModalFooter>
        }
      >
        {templateError && (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {templateError}
          </Alert>
        )}
        {templateLoading ? (
          <p className={styles.listHint}>Loading templates…</p>
        ) : (
          <div className={styles.meetingEmailModal}>
            <div className={styles.meetingEmailIntro}>
              <InfoHelpIcon
                title="Meeting email templates info"
                modalTitle="Meeting notification emails"
                message={
                  'These emails go to the attendee when a meeting is saved. Pick a tab (new / updated / cancelled), edit, then save.\n\n- Put the cursor where you want a value, then click a merge field.\n- The formatted message uses the toolbar; plain text is optional and folded away.'
                }
              />
            </div>
            {placeholderHelp.length > 0 && (
              <div className={styles.mergeFieldsCard}>
                <div className={styles.mergeFieldsTitleRow}>
                  <p className={styles.mergeFieldsTitle}>Insert meeting details</p>
                  <InfoHelpIcon
                    title="Merge fields info"
                    modalTitle="Insert meeting details"
                    message='Focus Subject, the formatted message, or plain text, then click. Tooltip shows the code (e.g. {{title}}).'
                  />
                </div>
                <div className={styles.mergeFieldsChips} role="group" aria-label="Insert merge field">
                  {placeholderHelp.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={styles.mergeFieldChip}
                      disabled={!canManage || templateLoading}
                      title={`Insert ${`{{${name}}}`} at cursor`}
                      onClick={() => insertTemplateMergeField(name)}
                    >
                      {formatMergeFieldLabel(name)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.templateTabs}>
              {MEETING_TEMPLATE_TABS.map((tab) => (
                <button
                  key={tab.kind}
                  type="button"
                  className={`${styles.templateTab} ${templateTab === tab.kind ? styles.templateTabActive : ''}`}
                  onClick={() => setTemplateTab(tab.kind)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTemplate ? (
              <div className={styles.templateFields}>
                <Input
                  id="meeting-template-subject"
                  label="Subject"
                  value={activeTemplate.subject ?? ''}
                  onChange={(e) => updateEmailTemplateDraft(templateTab, 'subject', e.target.value)}
                  disabled={!canManage}
                />
                <div>
                  <div className={styles.fieldLabelRow}>
                    <div className={styles.fieldLabel}>Message (formatted)</div>
                    <InfoHelpIcon
                      title="Editor toolbar info"
                      modalTitle="Message (formatted)"
                      message="Use the toolbar for bold, lists, and links."
                    />
                  </div>
                  <ScriptBodyEditor
                    ref={meetingTemplateHtmlRef}
                    key={templateTab}
                    scrollableLayout
                    enableHtmlSourceToggle
                    hideVariableMenu
                    variableGroups={null}
                    value={activeTemplate.body_html ?? ''}
                    onChange={(html) => updateEmailTemplateDraft(templateTab, 'body_html', html)}
                    readOnly={!canManage}
                    placeholder="Write the email. Use the merge buttons above for meeting fields."
                  />
                </div>
                <details className={styles.optionalPlainDetails}>
                  <summary className={styles.optionalPlainSummary}>
                    <span className={styles.optionalPlainSummaryInner}>
                      Plain text version (optional)
                      <InfoHelpIcon
                        title="Plain text info"
                        modalTitle="Plain text version"
                        message="Optional fallback for simple mail clients. Merge buttons work when this box is focused."
                      />
                    </span>
                  </summary>
                  <textarea
                    id="meeting-template-plain"
                    className={styles.templateTextarea}
                    value={activeTemplate.body_text ?? ''}
                    onChange={(e) => updateEmailTemplateDraft(templateTab, 'body_text', e.target.value)}
                    disabled={!canManage}
                    spellCheck={false}
                  />
                </details>
                {canManage ? (
                  <div className={styles.templateActions}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setResetTemplateKind(templateTab)}>
                      Restore default for this type
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.listHint}>No template loaded for this tab.</p>
            )}
          </div>
        )}
      </SlidePanel>

      <ConfirmModal
        isOpen={!!resetTemplateKind}
        onClose={() => setResetTemplateKind(null)}
        onConfirm={confirmResetTemplate}
        title="Restore default template"
        message="Replace the subject and body for this notification type with the built-in default?"
        confirmText="Restore"
        loading={templateSaving}
      />
    </div>
  );
}
