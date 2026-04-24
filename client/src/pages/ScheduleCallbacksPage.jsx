import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { ConfirmModal, Modal, ModalFooter } from '../components/ui/Modal';
import listStyles from '../components/admin/adminDataList.module.scss';
import { scheduleHubAPI } from '../services/scheduleHubAPI';
import styles from './MeetingsPage.module.scss';
import { CallbackMetricCards } from '../features/callbacks/CallbackMetricCards';
import { contactsAPI } from '../services/contactsAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';

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

function callbackStatusBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warning';
}

function computeCallbackTimeFlag(row) {
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

export function ScheduleCallbacksPage() {
  const { formatDateTime, formatMonthYear } = useDateTimeDisplay();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState('calendar');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [status, setStatus] = useState('');
  const [dataVersion, setDataVersion] = useState(0);

  const [teamMembers, setTeamMembers] = useState([]);
  const [calendarRows, setCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [callbackModalOpen, setCallbackModalOpen] = useState(false);
  const [callbackSaving, setCallbackSaving] = useState(false);
  const [callbackModalError, setCallbackModalError] = useState('');
  const [callbackFormErrors, setCallbackFormErrors] = useState({});
  const [editingCallback, setEditingCallback] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [formContactId, setFormContactId] = useState('');
  const [formPhoneId, setFormPhoneId] = useState('');
  const [formAssignedUserId, setFormAssignedUserId] = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formStatus, setFormStatus] = useState('pending');
  const [formNotes, setFormNotes] = useState('');
  const [formOutcomeNotes, setFormOutcomeNotes] = useState('');
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
    if (!callbackModalOpen) return;
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
  }, [callbackModalOpen, entitySelectedId]);

  const selectedCallbackMobile = useMemo(() => {
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
      .callbacksMetrics({ assigned_user_id: assignedUserId || undefined })
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

  const { from, to } = useMemo(() => monthRangeYmd(year, month0), [year, month0]);

  const cells = useMemo(() => buildMonthCells(year, month0), [year, month0]);
  const todayYmd = toYmd(new Date());

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    setError('');
    try {
      const res = await scheduleHubAPI.callbacksCalendar({
        from,
        to,
        assigned_user_id: assignedUserId || undefined,
        status: status || undefined,
      });
      setCalendarRows(res?.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load callbacks calendar');
      setCalendarRows([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [from, to, assignedUserId, status, dataVersion]);

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
      .callbacks({
        from: toYmd(new Date(year, month0, 1)),
        to: toYmd(new Date(year, month0 + 1, 0)),
        assigned_user_id: assignedUserId || undefined,
        status: status || undefined,
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
        setError(e?.response?.data?.error || e?.message || 'Failed to load callbacks');
        setListRows([]);
        setListHasCompletedInitialFetch(true);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, year, month0, assignedUserId, status, listSearch, listPage, listLimit, dataVersion]);

  useEffect(() => {
    setListPage(1);
  }, [assignedUserId, status, listSearch]);

  function shiftMonth(delta) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const monthTitle = formatMonthYear(new Date(year, month0, 1));
  const listTotalPages = Math.max(1, listPagination.totalPages || 1);

  const openCreateCallbackModal = useCallback(
    ({ dayYmd } = {}) => {
      const effectiveAssigned = assignedUserId || '';
      setEditingCallback(null);
      setCallbackModalError('');
      setCallbackFormErrors({});
      setFormContactId('');
      setFormPhoneId('');
      setFormAssignedUserId(effectiveAssigned);
      setFormScheduledAt(dayYmd ? defaultDateTimeLocalForDay(dayYmd) : '');
      setFormStatus('pending');
      setFormNotes('');
      setFormOutcomeNotes('');
      setEntitySelectedId('');
      setEntityDetail(null);
      setPhoneOptions([]);
      setEntityType('contact');
      setPickerOpen(false);
      setPickerType('contact');
      setPickerSearch('');
      setPickerPage(1);
      setCallbackModalOpen(true);
    },
    [assignedUserId]
  );

  const openEditCallbackModal = useCallback((row) => {
    if (!row) return;
    setEditingCallback(row);
    setCallbackModalError('');
    setCallbackFormErrors({});
    setFormContactId(row.contact_id != null ? String(row.contact_id) : '');
    setFormPhoneId(row.contact_phone_id != null ? String(row.contact_phone_id) : '');
    setFormAssignedUserId(row.assigned_user_id != null ? String(row.assigned_user_id) : '');
    setFormScheduledAt(toDatetimeLocalValue(row.scheduled_at));
    setFormStatus(row.status || 'pending');
    setFormNotes(row.notes || '');
    setFormOutcomeNotes(row.outcome_notes || '');
    setEntityType(String(row.contact_type || 'contact').toLowerCase() === 'lead' ? 'lead' : 'contact');
    setEntitySelectedId(row.contact_id != null ? String(row.contact_id) : '');
    setEntityDetail(null);
    setPhoneOptions([]);
    setPickerOpen(false);
    setPickerType(String(row.contact_type || 'contact').toLowerCase() === 'lead' ? 'lead' : 'contact');
    setPickerSearch('');
    setPickerPage(1);
    setCallbackModalOpen(true);
  }, []);

  const canSaveCallback = useMemo(() => {
    const hasEntity = Boolean(entitySelectedId || formContactId);
    const hasAssigned = Boolean(formAssignedUserId);
    const hasWhen = Boolean(formScheduledAt);
    return hasEntity && hasAssigned && hasWhen && !callbackSaving;
  }, [entitySelectedId, formContactId, formAssignedUserId, formScheduledAt, callbackSaving]);

  const saveCallback = useCallback(async () => {
    const nextErrors = {};
    if (!(entitySelectedId || formContactId)) nextErrors.entity = 'Select a contact or lead';
    if (!formAssignedUserId) nextErrors.assigned_user_id = 'Assigned agent is required';
    if (!formScheduledAt) nextErrors.scheduled_at = 'When is required';
    setCallbackFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setCallbackSaving(true);
    setCallbackModalError('');
    try {
      const payload = {
        contact_id: (entitySelectedId || formContactId) ? Number(entitySelectedId || formContactId) : null,
        contact_phone_id: formPhoneId ? Number(formPhoneId) : null,
        assigned_user_id: formAssignedUserId ? Number(formAssignedUserId) : null,
        scheduled_at: formScheduledAt ? String(formScheduledAt) : null,
        status: formStatus || 'pending',
        notes: formNotes || null,
        outcome_notes: formOutcomeNotes || null,
      };

      if (editingCallback?.id) {
        await scheduleHubAPI.updateCallback(editingCallback.id, payload);
      } else {
        await scheduleHubAPI.createCallback(payload);
      }
      setCallbackModalOpen(false);
      setEditingCallback(null);
      setDataVersion((v) => v + 1);
    } catch (e) {
      setCallbackModalError(e?.response?.data?.error || e?.message || 'Failed to save callback');
    } finally {
      setCallbackSaving(false);
    }
  }, [
    editingCallback?.id,
    entitySelectedId,
    formAssignedUserId,
    formContactId,
    formNotes,
    formOutcomeNotes,
    formPhoneId,
    formScheduledAt,
    formStatus,
  ]);

  const deleteCallback = useCallback(async () => {
    if (!editingCallback?.id) return;
    setCallbackSaving(true);
    setCallbackModalError('');
    try {
      await scheduleHubAPI.deleteCallback(editingCallback.id);
      setConfirmDeleteOpen(false);
      setCallbackModalOpen(false);
      setEditingCallback(null);
      setDataVersion((v) => v + 1);
    } catch (e) {
      setCallbackModalError(e?.response?.data?.error || e?.message || 'Failed to delete callback');
    } finally {
      setCallbackSaving(false);
    }
  }, [editingCallback?.id]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Scheduled callbacks"
        description="Calendar and list view for your scheduled follow-ups."
        actions={
          <Button type="button" variant="primary" onClick={() => openCreateCallbackModal()}>
            + Schedule callback
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      ) : null}

      <CallbackMetricCards data={metrics} loading={metricsLoading} />

      <div className={styles.toolbar}>
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
        <div className={styles.toolbarAccount}>
          <Select label="Team member" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} options={teamMemberOptions} />
        </div>
        <div className={styles.toolbarAccount}>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} />
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
                  onClick={() => openCreateCallbackModal({ dayYmd: key })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openCreateCallbackModal({ dayYmd: key });
                  }}
                >
                  <div className={styles.calDayNum}>{cell.date.getDate()}</div>
                  {dayRows.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={[
                        styles.meetingChip,
                        styles[`meetingChip_${computeCallbackTimeFlag(r)}`],
                        isTodayLocal(r.scheduled_at) ? styles.meetingChip_today : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={`${r.contact_name || '—'} (${r.status || 'pending'})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditCallbackModal(r);
                      }}
                    >
                      {String(r.scheduled_at || '').slice(11, 16)} {r.contact_name || '—'}
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
          <TableDataRegion loading={listLoading} hasCompletedInitialFetch={listHasCompletedInitialFetch}>
            {listRows.length === 0 && !listLoading ? (
              <div className={listStyles.tableCardEmpty}>No callbacks match your filters.</div>
            ) : (
              <div className={listStyles.tableCardBody}>
                <Table variant="adminList" flexibleLastColumn>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell width="170px">When</TableHeaderCell>
                      <TableHeaderCell>Contact</TableHeaderCell>
                      <TableHeaderCell width="150px">Phone</TableHeaderCell>
                      <TableHeaderCell>Assigned to</TableHeaderCell>
                      <TableHeaderCell width="120px">Status</TableHeaderCell>
                      <TableHeaderCell>Notes</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listRows.map((r) => (
                      <TableRow
                        key={r.id}
                        onClick={() => openEditCallbackModal(r)}
                        style={{ cursor: 'pointer' }}
                        title="Click to edit callback"
                      >
                        <TableCell>{formatDateTime(String(r.scheduled_at || '').replace(' ', 'T'))}</TableCell>
                        <TableCell noTruncate>{r.contact_name || '—'}</TableCell>
                        <TableCell noTruncate>{r.contact_phone || '—'}</TableCell>
                        <TableCell noTruncate>{r.assigned_name || r.assigned_email || '—'}</TableCell>
                        <TableCell>
                          <Badge size="sm" variant={callbackStatusBadgeVariant(r.status)}>
                            {r.status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.notes || '—'}</TableCell>
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

      <Modal
        isOpen={callbackModalOpen}
        onClose={() => {
          if (callbackSaving) return;
          setCallbackModalOpen(false);
          setEditingCallback(null);
        }}
        title={editingCallback?.id ? 'Edit callback' : 'Schedule callback'}
        size="lg"
        footer={
          <ModalFooter>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingCallback?.id ? (
                  <Button type="button" variant="danger" disabled={callbackSaving} onClick={() => setConfirmDeleteOpen(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={callbackSaving}
                  onClick={() => {
                    setCallbackModalOpen(false);
                    setEditingCallback(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" variant="primary" disabled={!canSaveCallback} onClick={saveCallback}>
                  {callbackSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </ModalFooter>
        }
      >
        {callbackModalError ? (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {callbackModalError}
          </Alert>
        ) : null}

        <div className={styles.formGrid}>
          <div className={styles.formRowFull}>
            <div className={styles.formLabel}>Select</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCallbackFormErrors((e) => ({ ...e, entity: undefined }));
                  setPickerType('contact');
                  setPickerSearch('');
                  setPickerPage(1);
                  setPickerOpen(true);
                }}
              >
                Pick contact
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCallbackFormErrors((e) => ({ ...e, entity: undefined }));
                  setPickerType('lead');
                  setPickerSearch('');
                  setPickerPage(1);
                  setPickerOpen(true);
                }}
              >
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
                    <div className={styles.entityFieldValue}>{selectedCallbackMobile || '—'}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {callbackFormErrors.entity ? (
              <div className={styles.listHint} style={{ marginTop: 6, color: 'var(--color-danger, #ef4444)', fontWeight: 600 }}>
                {callbackFormErrors.entity}
              </div>
            ) : null}
          </div>
          <div className={styles.formRowFull}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div className={styles.formRow}>
                <Select
                  label="Assigned to"
                  value={formAssignedUserId}
                  onChange={(e) => {
                    setFormAssignedUserId(e.target.value);
                    setCallbackFormErrors((err) => ({ ...err, assigned_user_id: undefined }));
                  }}
                  options={[{ value: '', label: 'Select team member' }, ...teamMemberOptions.filter((o) => o.value !== '')]}
                />
                {callbackFormErrors.assigned_user_id ? (
                  <div className={styles.listHint} style={{ marginTop: 6, color: 'var(--color-danger, #ef4444)', fontWeight: 600 }}>
                    {callbackFormErrors.assigned_user_id}
                  </div>
                ) : null}
              </div>
              <div className={styles.formRow}>
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
          <div className={styles.formRow}>
            <Input
              label="When"
              type="datetime-local"
              value={formScheduledAt}
              onChange={(e) => {
                setFormScheduledAt(e.target.value);
                setCallbackFormErrors((err) => ({ ...err, scheduled_at: undefined }));
              }}
              error={callbackFormErrors.scheduled_at}
            />
          </div>
          <div className={styles.formRow}>
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
          <div className={styles.formRowFull}>
            <Textarea label="Notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
          </div>
          <div className={styles.formRowFull}>
            <Textarea label="Outcome notes" value={formOutcomeNotes} onChange={(e) => setFormOutcomeNotes(e.target.value)} rows={3} />
          </div>
        </div>
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
        onConfirm={deleteCallback}
        title="Delete callback"
        message="This will remove the scheduled callback from your lists and calendar."
        confirmText={callbackSaving ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

