import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Input } from '../components/ui/Input';
import { DateTimePickerField } from '../components/ui/DateTimePickerField';
import { Textarea } from '../components/ui/Textarea';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { ConfirmModal, Modal, ModalFooter } from '../components/ui/Modal';
import { SlidePanel } from '../components/ui/SlidePanel';
import listStyles from '../components/admin/adminDataList.module.scss';
import { scheduleHubAPI } from '../services/scheduleHubAPI';
import styles from './MeetingsPage.module.scss';
import { FollowUpMetricCards } from '../features/followUps/FollowUpMetricCards';
import { contactsAPI } from '../services/contactsAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { FOLLOW_UP_TYPE_OPTIONS, followUpTypeLabel } from '../utils/followUpTypeLabels';
import { usePermission } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import { dialingSetsAPI, callScriptsAPI } from '../services/dispositionAPI';
import { dialerPreferencesAPI } from '../services/dialerPreferencesAPI';
import { IconPhone } from '../features/contacts/ListActionsMenuIcons';

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
const NEAR_WINDOW_MINUTES = 120;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthRangeYmd(year, month0) {
  return { from: toYmd(new Date(year, month0, 1)), to: toYmd(new Date(year, month0 + 1, 0)) };
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

function followUpStatusBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warning';
}

function computeFollowUpTimeFlag(row) {
  const status = String(row?.status || 'pending').toLowerCase();
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  const when = row?.scheduled_at ? new Date(String(row.scheduled_at).replace(' ', 'T')) : null;
  if (!when || Number.isNaN(when.getTime())) return 'upcoming';
  const now = new Date();
  const diffMin = (when.getTime() - now.getTime()) / 60000;
  if (diffMin < 0) return 'missed';
  if (diffMin <= NEAR_WINDOW_MINUTES) return 'near';
  return 'upcoming';
}

function isTodayLocal(mysqlDatetime) {
  if (!mysqlDatetime) return false;
  const d = new Date(String(mysqlDatetime).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function toDatetimeLocalValue(mysqlDatetime) {
  if (!mysqlDatetime) return '';
  const s = String(mysqlDatetime).replace(' ', 'T');
  // mysql: "YYYY-MM-DD HH:mm:ss" -> input wants "YYYY-MM-DDTHH:mm"
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function defaultDateTimeLocalForDay(ymd) {
  // Default to 09:00 local time for that day
  return `${ymd}T09:00`;
}

/** Phone follow-ups only — same default as API (`callback`). */
function isDialablePhoneFollowUpRow(row) {
  return String(row?.follow_up_type || 'callback').toLowerCase() === 'callback';
}

function canDialFollowUpRow(row) {
  if (!isDialablePhoneFollowUpRow(row)) return false;
  const cid = Number(row?.contact_id);
  return Number.isFinite(cid) && cid > 0;
}

function uniqueContactIdsInOrder(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const cid = Number(r.contact_id);
    if (!Number.isFinite(cid) || cid <= 0 || seen.has(cid)) continue;
    seen.add(cid);
    out.push(cid);
  }
  return out;
}

export function ScheduleFollowUpsPage() {
  const navigate = useNavigate();
  const canDialExecute = usePermission(PERMISSIONS.DIAL_EXECUTE);
  const listDialHeaderRef = useRef(null);
  const { formatDateTime, formatTime, formatMonthYear } = useDateTimeDisplay();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState('calendar');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [status, setStatus] = useState('');
  const [followUpTypeFilter, setFollowUpTypeFilter] = useState('');
  const [dataVersion, setDataVersion] = useState(0);

  const [teamMembers, setTeamMembers] = useState([]);
  const [calendarRows, setCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpModalError, setFollowUpModalError] = useState('');
  const [followUpFormErrors, setFollowUpFormErrors] = useState({});
  const [editingFollowUp, setEditingFollowUp] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [formContactId, setFormContactId] = useState('');
  const [formPhoneId, setFormPhoneId] = useState('');
  const [formAssignedUserId, setFormAssignedUserId] = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formStatus, setFormStatus] = useState('pending');
  const [formNotes, setFormNotes] = useState('');
  const [formOutcomeNotes, setFormOutcomeNotes] = useState('');
  const [formFollowUpType, setFormFollowUpType] = useState('callback');
  const [entitySelectedId, setEntitySelectedId] = useState('');
  const [entityDetail, setEntityDetail] = useState(null);
  const [phoneOptions, setPhoneOptions] = useState([]);
  const [entityType, setEntityType] = useState('contact'); // contact | lead

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState('contact'); // contact | lead
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerLimit, setPickerLimit] = useState(10);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerPagination, setPickerPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [pickerLoading, setPickerLoading] = useState(false);

  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(20);
  const [listSearch, setListSearch] = useState('');
  const [listRows, setListRows] = useState([]);
  const [listPagination, setListPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [listLoading, setListLoading] = useState(false);
  const [listHasCompletedInitialFetch, setListHasCompletedInitialFetch] = useState(false);
  const [selectedDialIds, setSelectedDialIds] = useState(() => new Set());
  const [listBulkDialing, setListBulkDialing] = useState(false);

  const dialableOnPage = useMemo(() => listRows.filter((r) => canDialFollowUpRow(r)), [listRows]);
  const allDialableOnPageSelected =
    dialableOnPage.length > 0 && dialableOnPage.every((r) => selectedDialIds.has(r.id));
  const someDialableOnPageSelected = dialableOnPage.some((r) => selectedDialIds.has(r.id));

  useLayoutEffect(() => {
    const el = listDialHeaderRef.current;
    if (!el) return;
    el.indeterminate = someDialableOnPageSelected && !allDialableOnPageSelected;
  }, [someDialableOnPageSelected, allDialableOnPageSelected]);

  const startDialerFromContactIds = useCallback(
    async (rawIds) => {
      if (!canDialExecute) return;
      const seen = new Set();
      const ids = [];
      for (const id of Array.isArray(rawIds) ? rawIds : []) {
        const cid = Number(id);
        if (!Number.isFinite(cid) || cid <= 0 || seen.has(cid)) continue;
        seen.add(cid);
        ids.push(cid);
      }
      if (!ids.length) return;
      setListBulkDialing(true);
      let dialingSetId = '';
      let callScriptId = '';
      try {
        const [dsRes, csRes, prefRes] = await Promise.all([
          dialingSetsAPI.getAll(true),
          callScriptsAPI.getAll({ includeInactive: false, page: 1, limit: 200 }),
          dialerPreferencesAPI.get(),
        ]);
        const ds = dsRes?.data?.data ?? [];
        const cs = csRes?.data?.data ?? [];
        const pref = prefRes?.data?.data ?? {};
        dialingSetId = String(
          pref?.default_dialing_set_id || ds.find((d) => Number(d?.is_default) === 1)?.id || ds[0]?.id || ''
        );
        callScriptId = String(
          pref?.default_call_script_id || cs.find((s) => Number(s?.is_default) === 1)?.id || cs[0]?.id || ''
        );
      } catch {
        /* DialerSessionSetupPage loads defaults if these are empty */
      } finally {
        setListBulkDialing(false);
      }
      setSelectedDialIds(new Set());
      navigate('/dialer/session/setup', {
        state: {
          contactIds: ids,
          dialingSetId,
          callScriptId,
        },
      });
    },
    [canDialExecute, navigate]
  );

  const startDialerFromListSelection = useCallback(async () => {
    const rows = listRows.filter((r) => selectedDialIds.has(r.id) && canDialFollowUpRow(r));
    const ids = uniqueContactIdsInOrder(rows);
    await startDialerFromContactIds(ids);
  }, [listRows, selectedDialIds, startDialerFromContactIds]);

  const toggleDialRowSelect = useCallback((followUpId) => {
    setSelectedDialIds((prev) => {
      const next = new Set(prev);
      if (next.has(followUpId)) next.delete(followUpId);
      else next.add(followUpId);
      return next;
    });
  }, []);

  const toggleSelectAllDialableOnPage = useCallback(() => {
    setSelectedDialIds((prev) => {
      const next = new Set(prev);
      const allNow = dialableOnPage.length > 0 && dialableOnPage.every((r) => next.has(r.id));
      if (allNow) {
        dialableOnPage.forEach((r) => next.delete(r.id));
      } else {
        dialableOnPage.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [dialableOnPage]);

  useEffect(() => {
    setSelectedDialIds(new Set());
  }, [listPage, listLimit, listSearch, assignedUserId, status, followUpTypeFilter, year, month0, dataVersion]);

  useEffect(() => {
    if (viewMode !== 'list') setSelectedDialIds(new Set());
  }, [viewMode]);

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
    if (!followUpModalOpen) return;
    if (!entitySelectedId) {
      setEntityDetail(null);
      setPhoneOptions([]);
      setFormPhoneId('');
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await contactsAPI.getById(entitySelectedId);
        const data = res?.data?.data ?? null;
        if (cancelled) return;
        setEntityDetail(data);
        const phones = data?.phones || [];
        const opts = [
          { value: '', label: 'No phone' },
          ...phones.map((p) => ({
            value: String(p.id),
            label: `${p.phone}${p.label ? ` (${p.label})` : ''}${p.is_primary ? ' • primary' : ''}`,
          })),
        ];
        setPhoneOptions(opts);
        const preferred = phones.find((p) => p.is_primary) || phones[0];
        setFormPhoneId(preferred ? String(preferred.id) : '');
      } catch {
        if (cancelled) return;
        setEntityDetail(null);
        setPhoneOptions([]);
        setFormPhoneId('');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [followUpModalOpen, entitySelectedId]);

  const selectedFollowUpMobile = useMemo(() => {
    const d = entityDetail;
    if (!d) return '';
    if (d.primary_phone) return String(d.primary_phone);
    const phones = Array.isArray(d.phones) ? d.phones : [];
    const primary = phones.find((p) => p && p.is_primary) || phones[0];
    return primary?.phone ? String(primary.phone) : '';
  }, [entityDetail]);

  useEffect(() => {
    let cancelled = false;
    setMetricsLoading(true);
    scheduleHubAPI
      .followUpsMetrics({ assigned_user_id: assignedUserId || undefined })
      .then((res) => {
        if (!cancelled) setMetrics(res?.data?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedUserId, dataVersion]);

  const teamMemberOptions = useMemo(() => {
    const base = [{ value: '', label: 'All in scope' }];
    const rest = (teamMembers || [])
      .filter((u) => String(u.role || '').toLowerCase() === 'agent')
      .map((u) => ({
        value: String(u.id),
        label: u.name || u.email || `User ${u.id}`,
      }));
    return [...base, ...rest];
  }, [teamMembers]);

  const statusOptions = useMemo(
    () => [
      { value: '', label: 'All statuses' },
      { value: 'pending', label: 'Pending' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

  const followUpTypeFilterOptions = useMemo(
    () => [{ value: '', label: 'All follow-up types' }, ...FOLLOW_UP_TYPE_OPTIONS],
    []
  );

  const followUpTypeFormOptions = useMemo(() => FOLLOW_UP_TYPE_OPTIONS, []);

  const { from, to } = useMemo(() => monthRangeYmd(year, month0), [year, month0]);

  const cells = useMemo(() => buildMonthCells(year, month0), [year, month0]);
  const todayYmd = toYmd(new Date());

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    setError('');
    try {
      const res = await scheduleHubAPI.followUpsCalendar({
        from,
        to,
        assigned_user_id: assignedUserId || undefined,
        status: status || undefined,
      });
      setCalendarRows(res?.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load follow-ups calendar');
      setCalendarRows([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [from, to, assignedUserId, status, followUpTypeFilter, dataVersion]);

  useEffect(() => {
    if (viewMode !== 'calendar') return;
    void loadCalendar();
  }, [viewMode, loadCalendar]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const r of calendarRows) {
      const d = new Date(String(r.scheduled_at).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) continue;
      const key = toYmd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    }
    return map;
  }, [calendarRows]);

  useEffect(() => {
    if (viewMode !== 'list') return;
    let cancelled = false;
    setListLoading(true);
    setError('');
    scheduleHubAPI
      .followUps({
        from: toYmd(new Date(year, month0, 1)),
        to: toYmd(new Date(year, month0 + 1, 0)),
        assigned_user_id: assignedUserId || undefined,
        status: status || undefined,
        follow_up_type: followUpTypeFilter || undefined,
        q: listSearch || undefined,
        page: listPage,
        limit: listLimit,
      })
      .then((res) => {
        if (cancelled) return;
        setListRows(res?.data?.data ?? []);
        setListPagination(res?.data?.pagination ?? { total: 0, page: listPage, limit: listLimit, totalPages: 1 });
        setListHasCompletedInitialFetch(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || e?.message || 'Failed to load follow-ups');
        setListRows([]);
        setListHasCompletedInitialFetch(true);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, year, month0, assignedUserId, status, followUpTypeFilter, listSearch, listPage, listLimit, dataVersion]);

  useEffect(() => {
    setListPage(1);
  }, [assignedUserId, status, followUpTypeFilter, listSearch]);

  function shiftMonth(delta) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const monthTitle = formatMonthYear(new Date(year, month0, 1));
  const listTotalPages = Math.max(1, listPagination.totalPages || 1);

  const openCreateFollowUpModal = useCallback(
    ({ dayYmd } = {}) => {
      const effectiveAssigned = assignedUserId || '';
      setEditingFollowUp(null);
      setFollowUpModalError('');
      setFollowUpFormErrors({});
      setFormContactId('');
      setFormPhoneId('');
      setFormAssignedUserId(effectiveAssigned);
      setFormScheduledAt(dayYmd ? defaultDateTimeLocalForDay(dayYmd) : '');
      setFormStatus('pending');
      setFormNotes('');
      setFormOutcomeNotes('');
      setFormFollowUpType('callback');
      setEntitySelectedId('');
      setEntityDetail(null);
      setPhoneOptions([]);
      setEntityType('contact');
      setPickerOpen(false);
      setPickerType('contact');
      setPickerSearch('');
      setPickerPage(1);
      setFollowUpModalOpen(true);
    },
    [assignedUserId]
  );

  const openEditFollowUpModal = useCallback((row) => {
    if (!row) return;
    setEditingFollowUp(row);
    setFollowUpModalError('');
    setFollowUpFormErrors({});
    setFormContactId(row.contact_id != null ? String(row.contact_id) : '');
    setFormPhoneId(row.contact_phone_id != null ? String(row.contact_phone_id) : '');
    setFormAssignedUserId(row.assigned_user_id != null ? String(row.assigned_user_id) : '');
    setFormScheduledAt(toDatetimeLocalValue(row.scheduled_at));
    setFormStatus(row.status || 'pending');
    setFormNotes(row.notes || '');
    setFormOutcomeNotes(row.outcome_notes || '');
    setFormFollowUpType(row.follow_up_type || 'callback');
    setEntityType(String(row.contact_type || 'contact').toLowerCase() === 'lead' ? 'lead' : 'contact');
    setEntitySelectedId(row.contact_id != null ? String(row.contact_id) : '');
    setEntityDetail(null);
    setPhoneOptions([]);
    setPickerOpen(false);
    setPickerType(String(row.contact_type || 'contact').toLowerCase() === 'lead' ? 'lead' : 'contact');
    setPickerSearch('');
    setPickerPage(1);
    setFollowUpModalOpen(true);
  }, []);

  const canSaveFollowUp = useMemo(() => {
    const hasEntity = Boolean(entitySelectedId || formContactId);
    const hasAssigned = Boolean(formAssignedUserId);
    const hasWhen = Boolean(formScheduledAt);
    return hasEntity && hasAssigned && hasWhen && !followUpSaving;
  }, [entitySelectedId, formContactId, formAssignedUserId, formScheduledAt, followUpSaving]);

  const saveFollowUp = useCallback(async () => {
    const nextErrors = {};
    if (!(entitySelectedId || formContactId)) nextErrors.entity = 'Select a contact or lead';
    if (!formAssignedUserId) nextErrors.assigned_user_id = 'Assigned agent is required';
    if (!formScheduledAt) nextErrors.scheduled_at = 'When is required';
    setFollowUpFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setFollowUpSaving(true);
    setFollowUpModalError('');
    try {
      const payload = {
        contact_id: (entitySelectedId || formContactId) ? Number(entitySelectedId || formContactId) : null,
        contact_phone_id: formPhoneId ? Number(formPhoneId) : null,
        assigned_user_id: formAssignedUserId ? Number(formAssignedUserId) : null,
        scheduled_at: formScheduledAt ? String(formScheduledAt) : null,
        status: formStatus || 'pending',
        notes: formNotes || null,
        outcome_notes: formOutcomeNotes || null,
        follow_up_type: formFollowUpType || 'callback',
      };

      if (editingFollowUp?.id) {
        await scheduleHubAPI.updateFollowUp(editingFollowUp.id, payload);
      } else {
        await scheduleHubAPI.createFollowUp(payload);
      }
      setFollowUpModalOpen(false);
      setEditingFollowUp(null);
      setDataVersion((v) => v + 1);
    } catch (e) {
      setFollowUpModalError(e?.response?.data?.error || e?.message || 'Failed to save follow-up');
    } finally {
      setFollowUpSaving(false);
    }
  }, [
    editingFollowUp?.id,
    entitySelectedId,
    formAssignedUserId,
    formContactId,
    formNotes,
    formOutcomeNotes,
    formFollowUpType,
    formPhoneId,
    formScheduledAt,
    formStatus,
  ]);

  const deleteFollowUp = useCallback(async () => {
    if (!editingFollowUp?.id) return;
    setFollowUpSaving(true);
    setFollowUpModalError('');
    try {
      await scheduleHubAPI.deleteFollowUp(editingFollowUp.id);
      setConfirmDeleteOpen(false);
      setFollowUpModalOpen(false);
      setEditingFollowUp(null);
      setDataVersion((v) => v + 1);
    } catch (e) {
      setFollowUpModalError(e?.response?.data?.error || e?.message || 'Failed to delete follow-up');
    } finally {
      setFollowUpSaving(false);
    }
  }, [editingFollowUp?.id]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Scheduled follow-ups"
        description="Calendar and list for contact and lead follow-ups (phone, email, meeting, or other)."
        actions={
          <Button type="button" variant="primary" onClick={() => openCreateFollowUpModal()}>
            + Schedule follow-up
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      ) : null}

      <FollowUpMetricCards data={metrics} loading={metricsLoading} />

      <div className={styles.toolbar}>
        <div className={styles.toolbarPrimary}>
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <Button type="button" variant={viewMode === 'calendar' ? 'primary' : 'secondary'} size="sm" onClick={() => setViewMode('calendar')}>
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
        </div>
        <div className={styles.toolbarFilters}>
          <div className={styles.toolbarFilterSlot}>
            <Select label="Team member" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} options={teamMemberOptions} />
          </div>
          <div className={styles.toolbarFilterSlot}>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} />
          </div>
          <div className={styles.toolbarFilterSlot}>
            <Select
              label="Follow-up type"
              value={followUpTypeFilter}
              onChange={(e) => setFollowUpTypeFilter(e.target.value)}
              options={followUpTypeFilterOptions}
            />
          </div>
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
              const dayRows = byDay.get(key) || [];
              const isToday = key === todayYmd;
              return (
                <div
                  key={`${idx}-${key}`}
                  className={`${styles.calCell} ${cell.inMonth ? '' : styles.calCellMuted} ${isToday ? styles.calCellToday : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCreateFollowUpModal({ dayYmd: key })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openCreateFollowUpModal({ dayYmd: key });
                  }}
                >
                  <div className={styles.calDayNum}>{cell.date.getDate()}</div>
                  {dayRows.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={[
                        styles.meetingChip,
                        styles[`meetingChip_${computeFollowUpTimeFlag(r)}`],
                        isTodayLocal(r.scheduled_at) ? styles.meetingChip_today : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={`${r.contact_name || '—'} · ${followUpTypeLabel(r.follow_up_type)} · ${r.status || 'pending'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditFollowUpModal(r);
                      }}
                    >
                      {formatTime(String(r.scheduled_at || '').replace(' ', 'T'))} {r.contact_name || '—'}
                    </button>
                  ))}
                  {dayRows.length > 4 ? <div className={styles.listHint}>+{dayRows.length - 4} more</div> : null}
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
              {canDialExecute && selectedDialIds.size > 0 ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={listBulkDialing}
                  className={styles.listBulkDialBtn}
                  onClick={() => void startDialerFromListSelection()}
                >
                  {listBulkDialing ? 'Starting…' : `Call selected (${selectedDialIds.size})`}
                </Button>
              ) : null}
            </div>
            <SearchInput
              value={listSearch}
              onSearch={(v) => {
                setListSearch(v);
                setListPage(1);
              }}
              placeholder="Search contact, phone, notes… (Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion
            loading={listLoading}
            hasCompletedInitialFetch={listHasCompletedInitialFetch}
            skeletonColumns={canDialExecute ? 9 : 7}
          >
            {listRows.length === 0 && !listLoading ? (
              <div className={listStyles.tableCardEmpty}>No follow-ups match your filters.</div>
            ) : (
              <div className={listStyles.tableCardBody}>
                <Table variant="adminList" flexibleLastColumn>
                  <TableHead>
                    <TableRow>
                      {canDialExecute ? (
                        <TableHeaderCell width="44px" align="center">
                          <input
                            ref={listDialHeaderRef}
                            type="checkbox"
                            checked={allDialableOnPageSelected}
                            onChange={toggleSelectAllDialableOnPage}
                            disabled={!dialableOnPage.length}
                            aria-label="Select all phone follow-ups on this page"
                          />
                        </TableHeaderCell>
                      ) : null}
                      {canDialExecute ? (
                        <TableHeaderCell width="56px" align="center">
                          <span className={styles.listDialHdr}>Call</span>
                        </TableHeaderCell>
                      ) : null}
                      <TableHeaderCell width="170px">When</TableHeaderCell>
                      <TableHeaderCell>Contact</TableHeaderCell>
                      <TableHeaderCell width="150px">Phone</TableHeaderCell>
                      <TableHeaderCell>Assigned to</TableHeaderCell>
                      <TableHeaderCell width="120px">Status</TableHeaderCell>
                      <TableHeaderCell width="140px">Type</TableHeaderCell>
                      <TableHeaderCell>Notes</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listRows.map((r) => {
                      const dialable = canDialFollowUpRow(r);
                      return (
                        <TableRow
                          key={r.id}
                          onClick={() => openEditFollowUpModal(r)}
                          style={{ cursor: 'pointer' }}
                          title="Click to edit follow-up"
                        >
                          {canDialExecute ? (
                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                              {dialable ? (
                                <input
                                  type="checkbox"
                                  checked={selectedDialIds.has(r.id)}
                                  onChange={() => toggleDialRowSelect(r.id)}
                                  aria-label={`Select for dialer: ${r.contact_name || r.contact_id || 'follow-up'}`}
                                />
                              ) : (
                                <span className={styles.listDialCellMuted} title="Only phone-type follow-ups can be queued for dialing">
                                  —
                                </span>
                              )}
                            </TableCell>
                          ) : null}
                          {canDialExecute ? (
                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                              {dialable ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className={styles.listRowDialBtn}
                                  disabled={listBulkDialing}
                                  aria-label={`Call ${r.contact_name || 'contact'}`}
                                  onClick={() => void startDialerFromContactIds([r.contact_id])}
                                >
                                  <IconPhone width={18} height={18} aria-hidden />
                                </Button>
                              ) : (
                                <span className={styles.listDialCellMuted}>—</span>
                              )}
                            </TableCell>
                          ) : null}
                          <TableCell>{formatDateTime(String(r.scheduled_at || '').replace(' ', 'T'))}</TableCell>
                          <TableCell noTruncate>{r.contact_name || '—'}</TableCell>
                          <TableCell noTruncate>{r.contact_phone || '—'}</TableCell>
                          <TableCell noTruncate>{r.assigned_name || r.assigned_email || '—'}</TableCell>
                          <TableCell>
                            <Badge size="sm" variant={followUpStatusBadgeVariant(r.status)}>
                              {r.status || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell noTruncate>{followUpTypeLabel(r.follow_up_type)}</TableCell>
                          <TableCell>{r.notes || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
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

      <SlidePanel
        isOpen={followUpModalOpen}
        onClose={() => {
          if (followUpSaving) return;
          setFollowUpModalOpen(false);
          setEditingFollowUp(null);
        }}
        title={
          <span className={styles.panelTitleWithIcon}>
            <UiIcon className={styles.panelTitleIconFollowUp}>
              <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
              <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
              <circle cx="18.5" cy="6.5" r="1.5" />
            </UiIcon>
            {editingFollowUp?.id ? 'Edit follow-up' : 'Schedule follow-up'}
          </span>
        }
        size="xl"
        closeOnOverlay={!followUpSaving}
        closeOnEscape={!followUpSaving}
        footer={
          <ModalFooter>
            <div className={styles.modalFooterRow}>
              <div className={styles.modalFooterLeft}>
                {editingFollowUp?.id ? (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={followUpSaving}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className={styles.footerBtn}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
              <div className={styles.modalFooterRight}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={followUpSaving}
                  className={styles.footerBtn}
                  onClick={() => {
                    setFollowUpModalOpen(false);
                    setEditingFollowUp(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" variant="primary" disabled={!canSaveFollowUp} onClick={saveFollowUp} className={styles.footerBtnPrimary}>
                  <UiIcon>
                    <path d="M20 7 9 18l-5-5" />
                  </UiIcon>
                  {followUpSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </ModalFooter>
        }
      >
        {followUpModalError ? (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {followUpModalError}
          </Alert>
        ) : null}
        <p className={styles.panelSubtitle}>
          {editingFollowUp?.id
            ? 'Update follow-up details, type, timing, or outcome notes.'
            : 'Schedule a follow-up for an agent and a contact or lead.'}
        </p>

        <div className={styles.formGrid}>
          <div className={styles.formRowFull}>
            <div className={styles.formLabel}>Select</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFollowUpFormErrors((e) => ({ ...e, entity: undefined }));
                  setPickerType('contact');
                  setPickerSearch('');
                  setPickerPage(1);
                  setPickerOpen(true);
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
                onClick={() => {
                  setFollowUpFormErrors((e) => ({ ...e, entity: undefined }));
                  setPickerType('lead');
                  setPickerSearch('');
                  setPickerPage(1);
                  setPickerOpen(true);
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
            {entitySelectedId ? (
              <div className={styles.entityCard} style={{ marginTop: 10 }}>
                <div className={styles.entityCardTitle}>
                  Selected {String(entityDetail?.type || entityType) === 'lead' ? 'lead' : 'contact'} details
                </div>
                <div className={styles.entityCardGrid}>
                  <div>
                    <div className={styles.entityFieldLabel}>Name</div>
                    <div className={styles.entityFieldValue}>{entityDetail?.display_name || '—'}</div>
                  </div>
                  <div>
                    <div className={styles.entityFieldLabel}>Email</div>
                    <div className={styles.entityFieldValue}>{entityDetail?.email || '—'}</div>
                  </div>
                  <div>
                    <div className={styles.entityFieldLabel}>Mobile</div>
                    <div className={styles.entityFieldValue}>{selectedFollowUpMobile || '—'}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {followUpFormErrors.entity ? (
              <div className={styles.listHint} style={{ marginTop: 6, color: 'var(--color-danger, #ef4444)', fontWeight: 600 }}>
                {followUpFormErrors.entity}
              </div>
            ) : null}
          </div>
          <div className={styles.formRowFull}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div className={styles.formRow}>
                <div className={`${styles.iconField} ${styles.followUpIconBlue}`}>
                  <UiIcon>
                    <path d="M20 21v-1.5a4 4 0 0 0-4-4h-8a4 4 0 0 0-4 4V21" />
                    <circle cx="12" cy="8" r="3.5" />
                  </UiIcon>
                  <Select
                    label="Assigned to"
                    value={formAssignedUserId}
                    onChange={(e) => {
                      setFormAssignedUserId(e.target.value);
                      setFollowUpFormErrors((err) => ({ ...err, assigned_user_id: undefined }));
                    }}
                    options={[{ value: '', label: 'Select team member' }, ...teamMemberOptions.filter((o) => o.value !== '')]}
                  />
                </div>
                {followUpFormErrors.assigned_user_id ? (
                  <div className={styles.listHint} style={{ marginTop: 6, color: 'var(--color-danger, #ef4444)', fontWeight: 600 }}>
                    {followUpFormErrors.assigned_user_id}
                  </div>
                ) : null}
              </div>
              <div className={styles.formRow}>
                <div className={`${styles.iconField} ${styles.followUpIconIndigo}`}>
                  <UiIcon>
                    <path d="M22 16.5V20a2 2 0 0 1-2.2 2A19 19 0 0 1 11.2 19a18.7 18.7 0 0 1-5.8-5.8A19 19 0 0 1 2.4 4.2 2 2 0 0 1 4.4 2h3.5a2 2 0 0 1 2 1.7 13.8 13.8 0 0 0 .7 2.9 2 2 0 0 1-.5 2.1L8.8 10a15.1 15.1 0 0 0 5.2 5.2l1.3-1.3a2 2 0 0 1 2.1-.5 13.8 13.8 0 0 0 2.9.7 2 2 0 0 1 1.7 2Z" />
                  </UiIcon>
                  <Select
                    label="Phone"
                    value={formPhoneId}
                    onChange={(e) => setFormPhoneId(e.target.value)}
                    options={
                      entitySelectedId
                        ? phoneOptions.length
                          ? phoneOptions
                          : [{ value: '', label: 'No phones found' }]
                        : [{ value: '', label: 'Select contact/lead first' }]
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={styles.formRowFull}>
            <div className={styles.scheduleFollowUpMetaRow}>
              <div className={styles.scheduleFuWhenWrap}>
                <DateTimePickerField
                  label="When"
                  mode="datetime"
                  value={formScheduledAt}
                  onChange={(v) => {
                    setFormScheduledAt(v);
                    setFollowUpFormErrors((err) => ({ ...err, scheduled_at: undefined }));
                  }}
                  error={followUpFormErrors.scheduled_at}
                />
              </div>
              <div className={`${styles.iconField} ${styles.followUpIconIndigo}`}>
                <UiIcon>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </UiIcon>
                <Select
                  label="Follow-up type"
                  value={formFollowUpType}
                  onChange={(e) => setFormFollowUpType(e.target.value)}
                  options={followUpTypeFormOptions}
                />
              </div>
              <div className={`${styles.iconField} ${styles.followUpIconTeal}`}>
                <UiIcon>
                  <path d="M4 12h16" />
                  <path d="M4 6h12" />
                  <path d="M4 18h10" />
                </UiIcon>
                <Select
                  label="Status"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className={styles.formRowFull}>
            <div className={`${styles.iconField} ${styles.iconFieldTextarea} ${styles.followUpIconBlue}`}>
              <UiIcon>
                <path d="M4 7.5h16" />
                <path d="M4 12h16" />
                <path d="M4 16.5h11" />
              </UiIcon>
              <Textarea label="Notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} textareaClassName={styles.iconTextarea} />
            </div>
          </div>
          <div className={styles.formRowFull}>
            <div className={`${styles.iconField} ${styles.iconFieldTextarea} ${styles.followUpIconIndigo}`}>
              <UiIcon>
                <path d="M4 7.5h16" />
                <path d="M4 12h16" />
                <path d="M4 16.5h11" />
              </UiIcon>
              <Textarea
                label="Outcome notes"
                value={formOutcomeNotes}
                onChange={(e) => setFormOutcomeNotes(e.target.value)}
                rows={3}
                textareaClassName={styles.iconTextarea}
              />
            </div>
          </div>
        </div>
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

        <TableDataRegion loading={pickerLoading} hasCompletedInitialFetch skeletonColumns={3}>
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
                        setEntityType(pickerType);
                        setEntitySelectedId(String(c.id));
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

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={deleteFollowUp}
        title="Delete follow-up"
        message="This will remove the scheduled follow-up from your lists and calendar."
        confirmText={followUpSaving ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

