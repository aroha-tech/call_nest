import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
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
import styles from './MeetingsPage.module.scss';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MEETING_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rescheduled', label: 'Rescheduled' },
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

function localDatetimeToMysql(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (!t) return '';
  const n = t.replace('T', ' ');
  if (n.length === 16) return `${n}:00`;
  return n.length === 19 ? n : n;
}

function mysqlToDatetimeLocal(mysql) {
  if (!mysql) return '';
  const s = String(mysql).replace(' ', 'T').slice(0, 16);
  return s;
}

/** Human label for merge-field keys shown on chips (e.g. start_at → Start At). */
function formatMergeFieldLabel(key) {
  return String(key)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function monthRange(year, month0) {
  const from = new Date(year, month0, 1, 0, 0, 0);
  const to = new Date(year, month0 + 1, 0, 23, 59, 59);
  const fmt = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
      d.getSeconds()
    )}`;
  return { from: fmt(from), to: fmt(to) };
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

function meetingPayloadFromForm(form, accounts) {
  const acc = accounts.find((a) => String(a.id) === String(form.email_account_id));
  return {
    title: form.title?.trim() ?? '',
    start_at: localDatetimeToMysql(form.start_at) || '',
    end_at: localDatetimeToMysql(form.end_at) || '',
    location: form.location?.trim() ?? '',
    description: form.description?.trim() ?? '',
    meeting_status: form.meeting_status || 'scheduled',
    attendee_email: form.attendee_email?.trim() ?? '',
    email_account_id: form.email_account_id ? Number(form.email_account_id) : null,
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

function formatMeetingWhen(v) {
  if (!v) return '—';
  try {
    const d = new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function meetingStatusBadgeVariant(status) {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'rescheduled':
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

export function MeetingsPage() {
  const navigate = useNavigate();
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
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
  /** Sub-view when viewing resolved template: 'preview' (HTML) | 'plain' | null */
  const [meetingPreviewSubModal, setMeetingPreviewSubModal] = useState(null);
  /** Which resolved modal we are fetching for (for button loading). */
  const [meetingPreviewResolveFor, setMeetingPreviewResolveFor] = useState(null);

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

  const { from, to } = useMemo(() => monthRange(year, month0), [year, month0]);

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
    });
    setModalOpen(true);
  }

  function openCreateForDay(dayDate) {
    if (!canManage) return;
    if (!formAccountOptions.length) return navigate('/email/accounts');
    const first = formAccountOptions[0]?.value || '';
    const { start_at, end_at } = dayDefaultsForCreate(dayDate);
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
    });
    setModalOpen(true);
  }

  function openEdit(m) {
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
      start_at: mysqlToDatetimeLocal(m.start_at),
      end_at: mysqlToDatetimeLocal(m.end_at),
      meeting_status: m.meeting_status || 'scheduled',
      assigned_user_id: m.assigned_user_id != null ? String(m.assigned_user_id) : '',
    });
    setModalOpen(true);
  }

  const canSaveMeeting = useMemo(() => {
    const hasEntity = Boolean(selectedEntityId);
    const hasAssigned = Boolean(form.assigned_user_id);
    const hasTitle = Boolean(form.title?.trim());
    const hasAcc = Boolean(form.email_account_id);
    const hasTimes = Boolean(form.start_at && form.end_at);
    return hasEntity && hasAssigned && hasTitle && hasAcc && hasTimes && !saving;
  }, [selectedEntityId, form.assigned_user_id, form.title, form.email_account_id, form.start_at, form.end_at, saving]);

  async function handleSave(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!selectedEntityId) nextErrors.entity = 'Select a contact or lead';
    if (!form.assigned_user_id) nextErrors.assigned_user_id = 'Assigned agent is required';
    if (!form.title?.trim()) nextErrors.title = 'Title is required';
    if (!form.email_account_id) nextErrors.email_account_id = 'Email account is required';
    setMeetingFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const start_at = localDatetimeToMysql(form.start_at);
    const end_at = localDatetimeToMysql(form.end_at);
    if (!start_at || !end_at) return;
    setSaving(true);
    setError(null);
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
        contact_id: Number(selectedEntityId),
        assigned_user_id: Number(form.assigned_user_id),
      };
      if (editing) {
        await meetingsAPI.update(editing.id, payload);
      } else {
        await meetingsAPI.create(payload);
      }
      setModalOpen(false);
      bumpMeetingsData();
    } catch (err) {
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
      const meeting = meetingPayloadFromForm(form, accounts);
      const res = await meetingsAPI.previewEmailTemplate({
        template_kind: kind,
        meeting,
        template_override: {
          subject: draft.subject,
          body_html: draft.body_html,
          body_text: draft.body_text,
        },
      });
      const d = res?.data?.data;
      setMeetingPreviewResolved({
        subject: d?.subject ?? '',
        body_html: d?.body_html ?? '',
        body_text: d?.body_text ?? '',
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
      const res = await meetingsAPI.getEmailTemplates();
      const rows = res?.data?.data ?? [];
      setPreviewPlaceholderHelp(res?.data?.placeholder_help ?? []);
      const row = rows.find((t) => t.template_kind === kind);
      const draft = {
        subject: row?.subject ?? '',
        body_html: row?.body_html ?? '',
        body_text: row?.body_text ?? '',
      };
      setMeetingPreviewDraft(draft);
      await refreshMeetingPreviewWithDraft(draft);
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
      await meetingsAPI.putEmailTemplates({
        templates: [
          {
            template_kind: kind,
            subject: meetingPreviewDraft.subject,
            body_html: meetingPreviewDraft.body_html,
            body_text: meetingPreviewDraft.body_text,
          },
        ],
      });
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

  const monthTitle = new Date(year, month0, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const listTotalPages = Math.max(1, listPagination.totalPages || 1);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Meetings"
        description="Meetings from connected email—add attendees and track status."
        actions={
          canManage ? (
            <Button type="button" onClick={openCreate} disabled={!hasEmailAccounts}>
              + Add meeting
            </Button>
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
              const dayLabel = cell.date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
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
                      {String(m.start_at || '').slice(11, 16)} {m.title}
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
          <TableDataRegion loading={listLoading} hasCompletedInitialFetch={listHasCompletedInitialFetch}>
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
                      <TableHeaderCell width="120px">Status</TableHeaderCell>
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
                        <TableCell>
                          <Badge variant={meetingStatusBadgeVariant(row.meeting_status)} size="sm">
                            {row.meeting_status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatMeetingWhen(row.start_at)}</TableCell>
                        <TableCell>{formatMeetingWhen(row.end_at)}</TableCell>
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

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit meeting' : 'New meeting'}
        size="lg"
        footer={
          <ModalFooter>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                {editing && canManage ? (
                  <Button type="button" variant="danger" onClick={() => setDeleteTarget(editing)} disabled={saving}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openMeetingEmailPreview}
                  disabled={saving || !form.email_account_id}
                >
                  Preview &amp; edit email
                </Button>
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                  {canManage ? 'Cancel' : 'Close'}
                </Button>
                {canManage ? (
                  <Button type="submit" form="meeting-form" loading={saving} disabled={!canSaveMeeting}>
                    Save
                  </Button>
                ) : null}
              </div>
            </div>
          </ModalFooter>
        }
      >
        <form id="meeting-form" onSubmit={handleSave}>
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
                  disabled={!canManage}
                  onClick={() => {
                    setPickerType('contact');
                    setPickerSearch('');
                    setPickerPage(1);
                    setPickerOpen(true);
                    setMeetingFormErrors((e2) => ({ ...e2, entity: undefined }));
                  }}
                >
                  Pick contact
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManage}
                  onClick={() => {
                    setPickerType('lead');
                    setPickerSearch('');
                    setPickerPage(1);
                    setPickerOpen(true);
                    setMeetingFormErrors((e2) => ({ ...e2, entity: undefined }));
                  }}
                >
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
            <Select
              label="Email account"
              value={form.email_account_id}
              onChange={(e) => setForm((f) => ({ ...f, email_account_id: e.target.value }))}
              options={formAccountOptions}
              required
              disabled={!canManage}
            />
            <Select
              label="Assigned to"
              value={form.assigned_user_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, assigned_user_id: e.target.value }));
                setMeetingFormErrors((e2) => ({ ...e2, assigned_user_id: undefined }));
              }}
              options={agentOptions}
              disabled={!canManage}
            />
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              disabled={!canManage}
              error={meetingFormErrors.title}
            />
            <Input
              label="Attendee email"
              type="email"
              value={form.attendee_email}
              onChange={(e) => setForm((f) => ({ ...f, attendee_email: e.target.value }))}
              placeholder="client@example.com"
              disabled={!canManage}
            />
            <Input
              label="Location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              disabled={!canManage}
            />
            <Input
              label="Start"
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
              required
              disabled={!canManage}
            />
            <Input
              label="End"
              type="datetime-local"
              value={form.end_at}
              onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
              required
              disabled={!canManage}
            />
            <Select
              label="Status"
              value={form.meeting_status}
              onChange={(e) => setForm((f) => ({ ...f, meeting_status: e.target.value }))}
              options={MEETING_STATUS_OPTIONS}
              disabled={!canManage}
            />
          </div>
          <p className={styles.listHint} style={{ marginTop: 4 }}>
            Open <strong>Preview &amp; edit email</strong> to see the outgoing message, edit the template using placeholders
            like <code>{'{{title}}'}</code>, and save it as your tenant default for this notification type (new / update /
            cancelled).
          </p>
          <div style={{ marginTop: 12 }}>
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes"
              disabled={!canManage}
              rows={3}
            />
          </div>
        </form>
      </Modal>

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

        <TableDataRegion loading={pickerLoading} hasCompletedInitialFetch>
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

      <Modal
        isOpen={meetingPreviewOpen}
        onClose={() => {
          if (meetingPreviewSaving || meetingPreviewLoading) return;
          setMeetingPreviewSubModal(null);
          setMeetingPreviewResolveFor(null);
          setMeetingPreviewOpen(false);
        }}
        title={`Attendee email — ${meetingPreviewKindLabel(meetingPreviewKind)}`}
        size="lg"
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
              <Input
                id="meeting-preview-subject"
                label="Subject"
                value={meetingPreviewDraft.subject}
                onChange={(e) => setMeetingPreviewDraft((d) => ({ ...d, subject: e.target.value }))}
                disabled={!canManage}
              />
              <div>
                <div className={styles.fieldLabel}>Message (formatted)</div>
                <p className={styles.fieldHint}>
                  Use the toolbar for formatting. Insert meeting fields with <strong>Variable</strong> in the toolbar (same as
                  call scripts).
                </p>
                <ScriptBodyEditor
                  key={meetingPreviewKind}
                  scrollableLayout
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openMeetingPreviewResolvedModal('plain')}
                  loading={meetingPreviewResolving && meetingPreviewResolveFor === 'plain'}
                  disabled={meetingPreviewLoading || !!meetingPreviewResolveFor}
                >
                  Plain text (this meeting)
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

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
        <p className={styles.previewModalHint}>Filled with the meeting currently on the form (read-only).</p>
        {meetingPreviewResolving ? (
          <p className={styles.listHint}>Updating…</p>
        ) : (
          <>
            <Input label="Subject" value={meetingPreviewResolved.subject} readOnly />
            <div>
              <div className={styles.fieldLabel}>Formatted message</div>
              <div
                className={styles.previewResolvedHtml}
                dangerouslySetInnerHTML={{ __html: meetingPreviewResolved.body_html || '<p>—</p>' }}
              />
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={meetingPreviewOpen && meetingPreviewSubModal === 'plain'}
        onClose={() => setMeetingPreviewSubModal(null)}
        title="Plain text — with this meeting"
        size="md"
        footer={
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setMeetingPreviewSubModal(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        <p className={styles.previewModalHint}>Plain version after merge fields are filled (read-only).</p>
        {meetingPreviewResolving ? (
          <p className={styles.listHint}>Updating…</p>
        ) : (
          <>
            <Input label="Subject" value={meetingPreviewResolved.subject} readOnly />
            <div>
              <div className={styles.fieldLabel}>Plain text body</div>
              <pre className={styles.previewResolvedPre}>{meetingPreviewResolved.body_text || '—'}</pre>
            </div>
          </>
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

      <Modal
        isOpen={templateModalOpen}
        onClose={() => !templateSaving && setTemplateModalOpen(false)}
        title="Meeting notification emails"
        size="lg"
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
              <p className={styles.meetingEmailIntroLead}>
                These emails go to the attendee when a meeting is saved. Pick a tab (new / updated / cancelled), edit, then
                save.
              </p>
              <ul className={styles.meetingEmailBullets}>
                <li>Put the cursor where you want a value, then click a merge field.</li>
                <li>The formatted message uses the toolbar; plain text is optional and folded away.</li>
              </ul>
            </div>
            {placeholderHelp.length > 0 && (
              <div className={styles.mergeFieldsCard}>
                <p className={styles.mergeFieldsTitle}>Insert meeting details</p>
                <p className={styles.mergeFieldsHint}>
                  Focus Subject, the formatted message, or plain text, then click. Tooltip shows the code (e.g.{' '}
                  <code className={styles.mergeFieldsCode}>{'{{title}}'}</code>).
                </p>
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
                  <div className={styles.fieldLabel}>Message (formatted)</div>
                  <p className={styles.fieldHint}>Use the toolbar for bold, lists, and links.</p>
                  <ScriptBodyEditor
                    ref={meetingTemplateHtmlRef}
                    key={templateTab}
                    scrollableLayout
                    hideVariableMenu
                    variableGroups={null}
                    value={activeTemplate.body_html ?? ''}
                    onChange={(html) => updateEmailTemplateDraft(templateTab, 'body_html', html)}
                    readOnly={!canManage}
                    placeholder="Write the email. Use the merge buttons above for meeting fields."
                  />
                </div>
                <details className={styles.optionalPlainDetails}>
                  <summary className={styles.optionalPlainSummary}>Plain text version (optional)</summary>
                  <p className={styles.optionalPlainHint}>Optional fallback for simple mail clients. Merge buttons work when this box is focused.</p>
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
      </Modal>

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
