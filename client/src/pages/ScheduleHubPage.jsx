import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import listStyles from '../components/admin/adminDataList.module.scss';
import { scheduleHubAPI } from '../services/scheduleHubAPI';
import styles from './ScheduleHubPage.module.scss';
import dashStyles from './TenantDashboardPage.module.scss';
import { FilterOptionsModal } from '../features/contacts/FilterOptionsModal';
import { BrowseSavedFiltersModal } from '../features/contacts/BrowseSavedFiltersModal';
import { savedListFiltersAPI } from '../services/savedListFiltersAPI';
import { ScheduleHubFilterModal } from './ScheduleHubFilterModal';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMonthsClamped(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

function IconReset() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden>
      <path
        d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function callbackStatusBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warning';
}

function meetingStatusBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'rescheduled') return 'warning';
  return 'primary';
}

function normalizeTabParam(v) {
  const t = String(v || '').toLowerCase();
  if (t === 'callbacks') return 'callbacks';
  return 'meetings';
}

function normalizeViewParam(v) {
  const t = String(v || '').toLowerCase();
  return t === 'list' ? 'list' : 'block';
}

function safeDate(v) {
  if (!v) return null;
  try {
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function computeTimeFlag(d, { isOpen }) {
  if (!d) return { primary: { label: '—', variant: 'muted' }, today: false };
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isOpen && d.getTime() < now.getTime()) return { primary: { label: 'Missed', variant: 'danger' }, today: isToday };
  const nearMs = 120 * 60 * 1000;
  if (isOpen && d.getTime() < now.getTime() + nearMs)
    return { primary: { label: 'Near', variant: 'warning' }, today: isToday };
  return { primary: { label: 'Upcoming', variant: 'primary' }, today: isToday };
}

export function ScheduleHubPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectUser);
  const viewMode = normalizeViewParam(searchParams.get('view'));
  const activeTab = normalizeTabParam(searchParams.get('tab'));

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => toYmd(today));
  const [to, setTo] = useState(() => toYmd(addMonthsClamped(today, 1)));
  const [assignedUserId, setAssignedUserId] = useState('');
  const [timeFlag, setTimeFlag] = useState('');
  const [meetingStatus, setMeetingStatus] = useState('');
  const [callbackStatus, setCallbackStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [savedFilters, setSavedFilters] = useState([]);
  const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);
  const [browseSavedOpen, setBrowseSavedOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingSavedFilterId, setEditingSavedFilterId] = useState(null);
  const [editingSavedFilterName, setEditingSavedFilterName] = useState('');
  const [editingSavedFilterSnapshot, setEditingSavedFilterSnapshot] = useState(null);

  const [teamMembers, setTeamMembers] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [meetingsRows, setMeetingsRows] = useState([]);
  const [callbacksRows, setCallbacksRows] = useState([]);

  const [meetingsPage, setMeetingsPage] = useState(1);
  const [meetingsLimit, setMeetingsLimit] = useState(20);
  const [meetingsPagination, setMeetingsPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [callbacksPage, setCallbacksPage] = useState(1);
  const [callbacksLimit, setCallbacksLimit] = useState(20);
  const [callbacksPagination, setCallbacksPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loadingCallbacks, setLoadingCallbacks] = useState(false);

  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const [error, setError] = useState('');

  const canPickAgents = user?.role === 'admin' || user?.role === 'manager';

  const hasActiveFilters = useMemo(() => {
    const defaultFrom = toYmd(today);
    const defaultTo = toYmd(addMonthsClamped(today, 1));
    return Boolean(
      (from && from !== defaultFrom) ||
        (to && to !== defaultTo) ||
        String(assignedUserId || '').trim() ||
        String(timeFlag || '').trim() ||
        String(meetingStatus || '').trim() ||
        String(callbackStatus || '').trim() ||
        String(searchQuery || '').trim()
    );
  }, [assignedUserId, callbackStatus, from, meetingStatus, searchQuery, timeFlag, to, today]);

  const resetAllFilters = () => {
    setFrom(toYmd(today));
    setTo(toYmd(addMonthsClamped(today, 1)));
    setAssignedUserId('');
    setTimeFlag('');
    setMeetingStatus('');
    setCallbackStatus('');
    setSearchQuery('');
    setMeetingsPage(1);
    setCallbacksPage(1);
    setEditingSavedFilterId(null);
    setEditingSavedFilterName('');
    setEditingSavedFilterSnapshot(null);
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    scheduleHubAPI
      .meta()
      .then((res) => {
        if (cancelled) return;
        setTeamMembers(res?.data?.data?.teamMembers ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    savedListFiltersAPI
      .list({ entity_type: 'schedule_hub' })
      .then((res) => {
        if (!cancelled) setSavedFilters(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const teamMemberOptions = useMemo(() => {
    const base = [{ value: '', label: 'All in scope' }];
    const rest = (teamMembers || []).map((u) => ({
      value: String(u.id),
      label: u.name || u.email || `User ${u.id}`,
    }));
    return [...base, ...rest];
  }, [teamMembers]);

  function setView(next) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'list') p.set('view', 'list');
        else p.delete('view');
        return p;
      },
      { replace: true }
    );
  }

  function setTab(next) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next === 'callbacks' ? 'callbacks' : 'meetings');
        return p;
      },
      { replace: true }
    );
  }

  function parseSavedListFilterSnapshot(row) {
    if (!row?.filter_json) return null;
    let snap = row.filter_json;
    if (typeof snap === 'string') {
      try {
        snap = JSON.parse(snap);
      } catch {
        return null;
      }
    }
    if (!snap || snap.version !== 1) return null;
    return snap;
  }

  const applyScheduleHubSnapshot = (snap) => {
    if (!snap || snap.version !== 1) return;
    setAssignedUserId(snap.assignedUserId ?? '');
    setTimeFlag(snap.timeFlag ?? '');
    setMeetingStatus(snap.meetingStatus ?? '');
    setCallbackStatus(snap.callbackStatus ?? '');
    setSearchQuery(snap.searchQuery ?? '');
    if (snap.tab === 'callbacks') setTab('callbacks');
    else setTab('meetings');
    setMeetingsPage(1);
    setCallbacksPage(1);
  };

  const buildScheduleHubSnapshot = (payload) => ({
    version: 1,
    tab: payload?.tab ?? activeTab,
    assignedUserId: payload?.assignedUserId ?? assignedUserId,
    timeFlag: payload?.timeFlag ?? timeFlag,
    meetingStatus: payload?.meetingStatus ?? meetingStatus,
    callbackStatus: payload?.callbackStatus ?? callbackStatus,
    searchQuery: payload?.searchQuery ?? searchQuery,
  });

  const timeFlagOptions = useMemo(
    () => [
      { value: '', label: 'All time flags' },
      { value: 'today', label: 'Today' },
      { value: 'near', label: 'Near' },
      { value: 'upcoming', label: 'Upcoming' },
      { value: 'missed', label: 'Missed' },
    ],
    []
  );

  const meetingStatusOptions = useMemo(
    () => [
      { value: '', label: 'All meeting statuses' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'rescheduled', label: 'Rescheduled' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

  const callbackStatusOptions = useMemo(
    () => [
      { value: '', label: 'All callback statuses' },
      { value: 'pending', label: 'Pending' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

  const requestParamsBase = useMemo(
    () => ({
      from,
      to,
      assigned_user_id: assignedUserId || undefined,
      time_flag: timeFlag || undefined,
      q: searchQuery?.trim() ? searchQuery.trim() : undefined,
    }),
    [from, to, assignedUserId, timeFlag, searchQuery]
  );

  async function loadAll({ resetPages = false } = {}) {
    if (resetPages) {
      setMeetingsPage(1);
      setCallbacksPage(1);
    }
    setError('');
    setLoadingSummary(true);
    setLoadingMeetings(true);
    setLoadingCallbacks(true);
    try {
      const [summaryRes, meetingsRes, callbacksRes] = await Promise.all([
        scheduleHubAPI.summary(requestParamsBase),
        scheduleHubAPI.meetings({
          ...requestParamsBase,
          status: meetingStatus || undefined,
          page: resetPages ? 1 : meetingsPage,
          limit: meetingsLimit,
        }),
        scheduleHubAPI.callbacks({
          ...requestParamsBase,
          status: callbackStatus || undefined,
          page: resetPages ? 1 : callbacksPage,
          limit: callbacksLimit,
        }),
      ]);
      setSummaryRows(summaryRes?.data?.data ?? []);
      setMeetingsRows(meetingsRes?.data?.data ?? []);
      setMeetingsPagination(
        meetingsRes?.data?.pagination ?? { total: 0, page: resetPages ? 1 : meetingsPage, limit: meetingsLimit, totalPages: 1 }
      );
      setCallbacksRows(callbacksRes?.data?.data ?? []);
      setCallbacksPagination(
        callbacksRes?.data?.pagination ?? { total: 0, page: resetPages ? 1 : callbacksPage, limit: callbacksLimit, totalPages: 1 }
      );
      setHasCompletedInitialFetch(true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load schedule hub');
      setSummaryRows([]);
      setMeetingsRows([]);
      setCallbacksRows([]);
      setHasCompletedInitialFetch(true);
    } finally {
      setLoadingSummary(false);
      setLoadingMeetings(false);
      setLoadingCallbacks(false);
    }
  }

  useEffect(() => {
    void loadAll({ resetPages: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, assignedUserId, timeFlag, meetingStatus, callbackStatus, searchQuery]);

  useEffect(() => {
    if (!hasCompletedInitialFetch) return;
    void loadAll({ resetPages: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingsPage, meetingsLimit, callbacksPage, callbacksLimit]);

  const meetingsTotalPages = Math.max(1, meetingsPagination.totalPages || 1);
  const callbacksTotalPages = Math.max(1, callbacksPagination.totalPages || 1);

  const meetingsTable = (
    <div className={listStyles.tableCard}>
      <div className={listStyles.tableCardToolbarTop}>
        <div className={listStyles.tableCardToolbarLeft} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {viewMode === 'list' ? (
            <div className={dashStyles.activityTabs} role="tablist" aria-label="Schedule hub tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'meetings'}
                className={`${dashStyles.activityTab} ${activeTab === 'meetings' ? dashStyles.activityTabActive : ''}`.trim()}
                onClick={() => setTab('meetings')}
              >
                Meetings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'callbacks'}
                className={`${dashStyles.activityTab} ${activeTab === 'callbacks' ? dashStyles.activityTabActive : ''}`.trim()}
                onClick={() => setTab('callbacks')}
              >
                Callbacks
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === 'list' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
            {hasActiveFilters ? (
              <Button type="button" size="sm" variant="secondary" onClick={resetAllFilters}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconReset />
                  Reset
                </span>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="primary" onClick={() => setFilterOptionsOpen(true)}>
              Filters
            </Button>
            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(v);
                setMeetingsPage(1);
                setCallbacksPage(1);
              }}
              placeholder="Search… (press Enter)"
              className={listStyles.searchInToolbar}
            />
            <span className={styles.muted} style={{ fontSize: 12, minWidth: 74, textAlign: 'right' }}>
              {loadingMeetings ? 'Loading…' : ''}
            </span>
          </div>
        ) : (
          <div className={styles.muted} style={{ fontSize: 12 }}>
            {loadingMeetings ? 'Loading…' : null}
          </div>
        )}
      </div>
      <TableDataRegion loading={loadingMeetings} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        {meetingsRows.length === 0 ? (
          <div className={listStyles.tableCardEmpty}>No meetings in range.</div>
        ) : (
          <div className={listStyles.tableCardBody}>
            <Table variant="adminList" flexibleLastColumn>
              <TableHead>
                <TableRow>
                  <TableHeaderCell width="120px">Flag</TableHeaderCell>
                  <TableHeaderCell width="170px">When</TableHeaderCell>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Contact</TableHeaderCell>
                  <TableHeaderCell>Assignee</TableHeaderCell>
                  <TableHeaderCell width="120px">Status</TableHeaderCell>
                  <TableHeaderCell width="130px">Attendance</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {meetingsRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {(() => {
                        const d = safeDate(r.start_at);
                        const isOpen = r.meeting_status === 'scheduled' || r.meeting_status === 'rescheduled';
                        const { primary, today: isToday } = computeTimeFlag(d, { isOpen });
                        return (
                          <>
                            <Badge size="sm" variant={primary.variant}>
                              {primary.label}
                            </Badge>
                            {isToday ? (
                              <span style={{ marginLeft: 6 }}>
                                <Badge size="sm" variant="muted">
                                  Today
                                </Badge>
                              </span>
                            ) : null}
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{formatDateTime(String(r.start_at || '').replace(' ', 'T'))}</TableCell>
                    <TableCell noTruncate>{r.title || '—'}</TableCell>
                    <TableCell noTruncate>{r.contact_name || '—'}</TableCell>
                    <TableCell noTruncate>{r.assigned_name || r.assigned_email || '—'}</TableCell>
                    <TableCell>
                      <Badge size="sm" variant={meetingStatusBadgeVariant(r.meeting_status)}>
                        {r.meeting_status || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge size="sm" variant={r.attendance_status === 'no_show' ? 'danger' : 'muted'}>
                        {r.attendance_status || '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TableDataRegion>
      <div className={listStyles.tableCardFooterPagination}>
        <Pagination
          page={meetingsPagination.page || meetingsPage}
          totalPages={meetingsTotalPages}
          total={meetingsPagination.total || 0}
          limit={meetingsPagination.limit || meetingsLimit}
          onPageChange={setMeetingsPage}
          onLimitChange={(n) => {
            setMeetingsLimit(n);
            setMeetingsPage(1);
          }}
        />
      </div>
    </div>
  );

  const callbacksTable = (
    <div className={listStyles.tableCard}>
      <div className={listStyles.tableCardToolbarTop}>
        <div className={listStyles.tableCardToolbarLeft} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {viewMode === 'list' ? (
            <div className={dashStyles.activityTabs} role="tablist" aria-label="Schedule hub tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'meetings'}
                className={`${dashStyles.activityTab} ${activeTab === 'meetings' ? dashStyles.activityTabActive : ''}`.trim()}
                onClick={() => setTab('meetings')}
              >
                Meetings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'callbacks'}
                className={`${dashStyles.activityTab} ${activeTab === 'callbacks' ? dashStyles.activityTabActive : ''}`.trim()}
                onClick={() => setTab('callbacks')}
              >
                Callbacks
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === 'list' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
            {hasActiveFilters ? (
              <Button type="button" size="sm" variant="secondary" onClick={resetAllFilters}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconReset />
                  Reset
                </span>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="primary" onClick={() => setFilterOptionsOpen(true)}>
              Filters
            </Button>
            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(v);
                setMeetingsPage(1);
                setCallbacksPage(1);
              }}
              placeholder="Search… (press Enter)"
              className={listStyles.searchInToolbar}
            />
            <span className={styles.muted} style={{ fontSize: 12, minWidth: 74, textAlign: 'right' }}>
              {loadingCallbacks ? 'Loading…' : ''}
            </span>
          </div>
        ) : (
          <div className={styles.muted} style={{ fontSize: 12 }}>
            {loadingCallbacks ? 'Loading…' : null}
          </div>
        )}
      </div>
      <TableDataRegion loading={loadingCallbacks} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        {callbacksRows.length === 0 ? (
          <div className={listStyles.tableCardEmpty}>No scheduled callbacks in range.</div>
        ) : (
          <div className={listStyles.tableCardBody}>
            <Table variant="adminList" flexibleLastColumn>
              <TableHead>
                <TableRow>
                  <TableHeaderCell width="120px">Flag</TableHeaderCell>
                  <TableHeaderCell width="170px">When</TableHeaderCell>
                  <TableHeaderCell>Contact</TableHeaderCell>
                  <TableHeaderCell width="150px">Phone</TableHeaderCell>
                  <TableHeaderCell>Assigned to</TableHeaderCell>
                  <TableHeaderCell width="120px">Status</TableHeaderCell>
                  <TableHeaderCell>Notes</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {callbacksRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {(() => {
                        const d = safeDate(r.scheduled_at);
                        const isOpen = r.status === 'pending';
                        const { primary, today: isToday } = computeTimeFlag(d, { isOpen });
                        return (
                          <>
                            <Badge size="sm" variant={primary.variant}>
                              {primary.label}
                            </Badge>
                            {isToday ? (
                              <span style={{ marginLeft: 6 }}>
                                <Badge size="sm" variant="muted">
                                  Today
                                </Badge>
                              </span>
                            ) : null}
                          </>
                        );
                      })()}
                    </TableCell>
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
          page={callbacksPagination.page || callbacksPage}
          totalPages={callbacksTotalPages}
          total={callbacksPagination.total || 0}
          limit={callbacksPagination.limit || callbacksLimit}
          onPageChange={setCallbacksPage}
          onLimitChange={(n) => {
            setCallbacksLimit(n);
            setCallbacksPage(1);
          }}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Schedule hub"
        description="Meetings and scheduled callbacks in one place."
        actions={
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <Button type="button" size="sm" variant={viewMode === 'block' ? 'primary' : 'secondary'} onClick={() => setView('block')}>
              Block
            </Button>
            <Button type="button" size="sm" variant={viewMode === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>
              List
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={styles.toolbarRow}>
        <div className={styles.toolbarFilters} aria-busy={loadingMeta ? 'true' : 'false'}>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className={styles.toolbarActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadAll({ resetPages: false })}
            disabled={loadingSummary || loadingMeetings || loadingCallbacks}
          >
            Refresh
          </Button>
          <Button type="button" size="sm" disabled title="Coming soon">
            Schedule callback
          </Button>
        </div>
      </div>

      {viewMode === 'block' ? (
        <div className={styles.cardsGrid}>
          <div>
            <div className={styles.sectionTitle}>Summary by person</div>
            <div className={listStyles.tableCard}>
              <TableDataRegion loading={loadingSummary} hasCompletedInitialFetch={hasCompletedInitialFetch}>
                {summaryRows.length === 0 ? (
                  <div className={listStyles.tableCardEmpty}>No summary rows in range.</div>
                ) : (
                  <div className={listStyles.tableCardBody}>
                    <Table variant="adminList" flexibleLastColumn>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Person</TableHeaderCell>
                          <TableHeaderCell width="140px">Meetings (open)</TableHeaderCell>
                          <TableHeaderCell width="140px">Meetings (done)</TableHeaderCell>
                          <TableHeaderCell width="110px">No show</TableHeaderCell>
                          <TableHeaderCell width="150px">Callbacks pending</TableHeaderCell>
                          <TableHeaderCell width="140px">Callbacks done</TableHeaderCell>
                          <TableHeaderCell width="120px">Dial attempts</TableHeaderCell>
                          <TableHeaderCell width="120px">Connected</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {summaryRows.map((r) => (
                          <TableRow key={r.user_id}>
                            <TableCell noTruncate>{r.person}</TableCell>
                            <TableCell>{r.meetings_open}</TableCell>
                            <TableCell>{r.meetings_done}</TableCell>
                            <TableCell>{r.meetings_no_show}</TableCell>
                            <TableCell>{r.callbacks_pending}</TableCell>
                            <TableCell>{r.callbacks_done}</TableCell>
                            <TableCell>{r.dial_attempts}</TableCell>
                            <TableCell>{r.connected}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TableDataRegion>
            </div>
          </div>

          <div className={styles.sectionTitle}>Meetings</div>
          {meetingsTable}

          <div className={styles.sectionTitle}>Scheduled callbacks</div>
          {callbacksTable}
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {activeTab === 'meetings' ? meetingsTable : callbacksTable}
        </div>
      )}

      <FilterOptionsModal
        isOpen={filterOptionsOpen}
        onClose={() => setFilterOptionsOpen(false)}
        onCreateNew={() => {
          setEditingSavedFilterId(null);
          setEditingSavedFilterName('');
          setEditingSavedFilterSnapshot(null);
          setFiltersOpen(true);
        }}
        onBrowseExisting={() => setBrowseSavedOpen(true)}
      />

      <BrowseSavedFiltersModal
        isOpen={browseSavedOpen}
        onClose={() => setBrowseSavedOpen(false)}
        filters={savedFilters}
        onApply={(f) => {
          const snap = parseSavedListFilterSnapshot(f);
          if (!snap) return;
          applyScheduleHubSnapshot(snap);
          setEditingSavedFilterId(null);
          setEditingSavedFilterName('');
          setEditingSavedFilterSnapshot(null);
        }}
        onDelete={async (f) => {
          await savedListFiltersAPI.remove(f.id);
          const res = await savedListFiltersAPI.list({ entity_type: 'schedule_hub' });
          setSavedFilters(res?.data?.data ?? []);
        }}
        onEdit={(f) => {
          const snap = parseSavedListFilterSnapshot(f);
          if (!snap || !f?.id) return;
          setEditingSavedFilterId(f.id);
          setEditingSavedFilterName(String(f.name || '').trim());
          setEditingSavedFilterSnapshot(snap);
          applyScheduleHubSnapshot(snap);
          setBrowseSavedOpen(false);
          setFiltersOpen(true);
        }}
      />

      <ScheduleHubFilterModal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        values={{
          tab: activeTab,
          assignedUserId,
          timeFlag,
          meetingStatus,
          callbackStatus,
          searchQuery,
        }}
        initialTab={editingSavedFilterSnapshot?.tab ?? activeTab}
        teamMemberOptions={teamMemberOptions}
        timeFlagOptions={timeFlagOptions}
        meetingStatusOptions={meetingStatusOptions}
        callbackStatusOptions={callbackStatusOptions}
        savedFilterId={editingSavedFilterId}
        initialSavedFilterName={editingSavedFilterName}
        existingSavedFilters={savedFilters.map((x) => ({ id: x.id, name: x.name }))}
        onApply={(next) => {
          applyScheduleHubSnapshot({ version: 1, ...next });
          setEditingSavedFilterId(null);
          setEditingSavedFilterName('');
          setEditingSavedFilterSnapshot(null);
        }}
        onSaveNamedFilter={async (name, next) => {
          const snap = buildScheduleHubSnapshot(next || {});
          await savedListFiltersAPI.create({ entity_type: 'schedule_hub', name, filter_json: snap });
          const res = await savedListFiltersAPI.list({ entity_type: 'schedule_hub' });
          setSavedFilters(res?.data?.data ?? []);
        }}
        onUpdateNamedFilter={async (id, name, next) => {
          const snap = buildScheduleHubSnapshot(next || {});
          await savedListFiltersAPI.update(id, { name, filter_json: snap });
          const res = await savedListFiltersAPI.list({ entity_type: 'schedule_hub' });
          setSavedFilters(res?.data?.data ?? []);
        }}
      />
    </div>
  );
}

