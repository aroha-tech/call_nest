import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { callsAPI } from '../services/callsAPI';
import { dispositionsAPI } from '../services/dispositionAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { savedListFiltersAPI } from '../services/savedListFiltersAPI';
import { BrowseSavedFiltersModal } from '../features/contacts/BrowseSavedFiltersModal';
import { FilterOptionsModal } from '../features/contacts/FilterOptionsModal';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './ActivitiesPage.module.scss';
import { sanitizeAttemptNotesForDisplay } from '../utils/callAttemptNotesDisplay';
import { SearchInput } from '../components/ui/SearchInput';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { Badge } from '../components/ui/Badge';
import { CallHistoryCards } from './CallHistoryCards';
import { CallHistoryFilterModal } from './CallHistoryFilterModal';
import { CallHistoryDataTable } from './CallHistoryDataTable';
import { CallHistoryAttemptDetailModal } from './CallHistoryAttemptDetailModal';
import { LeadColumnCustomizeModal } from '../features/contacts/LeadColumnCustomizeModal';
import { LeadColumnSortFilterModal } from '../features/contacts/LeadColumnSortFilterModal';
import {
  getApplicableCallHistoryColumns,
  getDefaultVisibleCallHistoryColumnIds,
  loadCallHistoryVisibleColumnIds,
  saveCallHistoryVisibleColumnIds,
} from './callHistoryTableConfig';
import contactPageStyles from '../features/contacts/ContactsPage.module.scss';
import {
  IconChevronDown,
  IconColumns,
  IconExport,
  IconFilter,
} from '../features/contacts/ListActionsMenuIcons';
import { ExportCsvModal } from '../features/contacts/ExportCsvModal';

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

function IconBlank() {
  return <span style={{ display: 'block', width: 18, height: 18 }} aria-hidden />;
}

function CallHistoryActionsMenuItem({ icon: Icon, children, danger, disabled, className = '', ...rest }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`${contactPageStyles.actionsMenuItem} ${danger ? contactPageStyles.actionsMenuItemDanger : ''} ${disabled ? contactPageStyles.actionsMenuItemDisabled : ''} ${className}`.trim()}
      {...rest}
    >
      <span className={contactPageStyles.actionsMenuIcon} aria-hidden>
        <Icon />
      </span>
      <span className={contactPageStyles.actionsMenuText}>{children}</span>
    </button>
  );
}

function IconReset() {
  return (
    <svg className={styles.toolbarResetIcon} viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden>
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

export function ActivitiesPage() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);
  const [searchParams, setSearchParams] = useSearchParams();

  const contactFilter = (searchParams.get('contact_id') || '').trim();
  const dialerSessionFilter = (searchParams.get('dialer_session_id') || '').trim();
  const qParam = (searchParams.get('q') || '').trim();

  const setContactFilter = useCallback(
    (raw) => {
      setPage(1);
      const t = String(raw ?? '').trim();
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (t) p.set('contact_id', t);
          else p.delete('contact_id');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setDialerSessionFilter = useCallback(
    (raw) => {
      setPage(1);
      const t = String(raw ?? '').trim();
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (t) p.set('dialer_session_id', t);
          else p.delete('dialer_session_id');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const [provider, setProvider] = useState('dummy');
  const [contactIdDraft, setContactIdDraft] = useState('');
  const [starting, setStarting] = useState(false);

  const [dispositions, setDispositions] = useState([]);
  const [dispositionFilterMulti, setDispositionFilterMulti] = useState('');
  const [directionFilterMulti, setDirectionFilterMulti] = useState('');
  const [statusFilterMulti, setStatusFilterMulti] = useState('');
  const [connectedFilterMulti, setConnectedFilterMulti] = useState('');
  const [agentFilterMulti, setAgentFilterMulti] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [startedAfter, setStartedAfter] = useState('');
  const [startedBefore, setStartedBefore] = useState('');
  const [tenantAgents, setTenantAgents] = useState([]);
  const [savedFilters, setSavedFilters] = useState([]);
  const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);
  const [browseSavedOpen, setBrowseSavedOpen] = useState(false);
  const [editingSavedFilterId, setEditingSavedFilterId] = useState(null);
  const [editingSavedFilterName, setEditingSavedFilterName] = useState('');
  const [editingSavedFilterSnapshot, setEditingSavedFilterSnapshot] = useState(null);

  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attemptDetailRow, setAttemptDetailRow] = useState(null);

  const callHistoryApplicableColumns = useMemo(() => getApplicableCallHistoryColumns(), []);
  const [callHistoryVisibleColumnIds, setCallHistoryVisibleColumnIds] = useState(() =>
    loadCallHistoryVisibleColumnIds(getApplicableCallHistoryColumns())
  );
  const [callHistoryCustomizeOpen, setCallHistoryCustomizeOpen] = useState(false);
  const callHistoryTableScrollRef = useRef(null);
  const [callHistoryColumnPanelCol, setCallHistoryColumnPanelCol] = useState(null);
  const [callHistoryColumnFilters, setCallHistoryColumnFilters] = useState([]);

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  const [searchQuery, setSearchQuery] = useState(qParam);
  useEffect(() => setSearchQuery(qParam), [qParam]);

  const dispositionOptions = useMemo(
    () => (dispositions || []).map((d) => ({ value: String(d.id), label: d.name || d.code || d.id })),
    [dispositions]
  );

  const agentOptions = useMemo(
    () =>
      (tenantAgents || [])
        .map((u) => ({ value: String(u.id), label: u.name || u.email || `#${u.id}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tenantAgents]
  );

  const directionOptions = useMemo(
    () => [
      { value: 'outbound', label: 'Outgoing' },
      { value: 'inbound', label: 'Incoming' },
    ],
    []
  );

  const statusOptions = useMemo(
    () => [
      { value: 'queued', label: 'Queued' },
      { value: 'ringing', label: 'Ringing' },
      { value: 'connected', label: 'Connected' },
      { value: 'completed', label: 'Completed' },
      { value: 'failed', label: 'Failed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

  const connectedOptions = useMemo(
    () => [
      { value: '1', label: 'Connected' },
      { value: '0', label: 'Not connected' },
    ],
    []
  );

  async function load() {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await callsAPI.list({
        page,
        limit,
        q: searchQuery?.trim() ? searchQuery.trim() : undefined,
        contact_id: contactFilter || undefined,
        dialer_session_id: dialerSessionFilter || undefined,
        disposition_id: dispositionFilterMulti || undefined,
        direction: directionFilterMulti || undefined,
        status: statusFilterMulti || undefined,
        is_connected: connectedFilterMulti || undefined,
        agent_user_id: agentFilterMulti || undefined,
        started_after: startedAfter || undefined,
        started_before: startedBefore || undefined,
        today_only: todayOnly,
        meaningful_only: true,
        sort_by: sortBy || undefined,
        sort_dir: sortDir || undefined,
        column_filters:
          callHistoryColumnFilters.length > 0 ? JSON.stringify(callHistoryColumnFilters) : undefined,
      });
      setPayload(res?.data ?? null);
      setHasCompletedInitialFetch(true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load activities');
      setPayload(null);
      setHasCompletedInitialFetch(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    limit,
    canView,
    searchQuery,
    contactFilter,
    dialerSessionFilter,
    dispositionFilterMulti,
    directionFilterMulti,
    statusFilterMulti,
    connectedFilterMulti,
    todayOnly,
    agentFilterMulti,
    startedAfter,
    startedBefore,
    sortBy,
    sortDir,
    callHistoryColumnFilters,
  ]);

  const loadMetrics = useCallback(async () => {
    if (!canView) return;
    setMetricsLoading(true);
    try {
      const res = await callsAPI.metrics({
        q: searchQuery?.trim() ? searchQuery.trim() : undefined,
        contact_id: contactFilter || undefined,
        dialer_session_id: dialerSessionFilter || undefined,
        disposition_id: dispositionFilterMulti || undefined,
        direction: directionFilterMulti || undefined,
        status: statusFilterMulti || undefined,
        is_connected: connectedFilterMulti || undefined,
        agent_user_id: agentFilterMulti || undefined,
        started_after: startedAfter || undefined,
        started_before: startedBefore || undefined,
        today_only: todayOnly,
        meaningful_only: true,
        column_filters:
          callHistoryColumnFilters.length > 0 ? JSON.stringify(callHistoryColumnFilters) : undefined,
      });
      setMetrics(res?.data?.data ?? null);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, [
    canView,
    contactFilter,
    dialerSessionFilter,
    searchQuery,
    dispositionFilterMulti,
    directionFilterMulti,
    statusFilterMulti,
    connectedFilterMulti,
    agentFilterMulti,
    startedAfter,
    startedBefore,
    todayOnly,
    callHistoryColumnFilters,
  ]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (!canView) return;
    dispositionsAPI
      .getAll({ includeInactive: true, page: 1, limit: 500 })
      .then((res) => setDispositions(res?.data?.data?.data ?? []))
      .catch(() => setDispositions([]));
  }, [canView]);

  useEffect(() => {
    if (!canView || !user) return;
    if (user.role !== 'admin' && user.role !== 'manager') return;
    let cancelled = false;
    tenantUsersAPI
      .getAll({ page: 1, limit: 500, includeDisabled: false })
      .then((res) => {
        const list = res?.data?.data ?? [];
        if (!cancelled) setTenantAgents(list.filter((u) => u.role === 'agent'));
      })
      .catch(() => {
        if (!cancelled) setTenantAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, user]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    savedListFiltersAPI
      .list({ entity_type: 'call_history' })
      .then((res) => {
        if (!cancelled) setSavedFilters(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const applyCallHistorySnapshot = (snap) => {
    if (!snap || snap.version !== 1) return;
    setDispositionFilterMulti(snap.dispositionFilterMulti ?? '');
    setDirectionFilterMulti(snap.directionFilterMulti ?? '');
    setStatusFilterMulti(snap.statusFilterMulti ?? '');
    setConnectedFilterMulti(snap.connectedFilterMulti ?? '');
    setAgentFilterMulti(snap.agentFilterMulti ?? '');
    setSearchQuery(snap.searchQuery ?? '');
    setTodayOnly(Boolean(snap.todayOnly));
    setStartedAfter(snap.startedAfter ?? '');
    setStartedBefore(snap.startedBefore ?? '');
    setContactFilter(snap.contactIdFilter ?? snap.contact_id ?? '');
    setPage(1);
  };

  const parseSavedListFilterSnapshot = (row) => {
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
  };

  const buildCallHistorySnapshot = ({
    contactFilter: cf,
    dispositionFilterMulti: dMulti,
    directionFilterMulti: dirMulti,
    statusFilterMulti: sMulti,
    connectedFilterMulti: cMulti,
    agentFilterMulti: aMulti,
    todayOnly: tOnly,
    startedAfter: sAfter,
    startedBefore: sBefore,
  }) => ({
    version: 1,
    dispositionFilterMulti: dMulti ?? '',
    directionFilterMulti: dirMulti ?? '',
    statusFilterMulti: sMulti ?? '',
    connectedFilterMulti: cMulti ?? '',
    agentFilterMulti: aMulti ?? '',
    searchQuery: searchQuery ?? '',
    todayOnly: Boolean(tOnly),
    startedAfter: sAfter ?? '',
    startedBefore: sBefore ?? '',
    contactIdFilter: cf ?? contactFilter ?? '',
  });

  const rows = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages || 1);

  const callHistoryExportListParams = useMemo(
    () => ({
      q: searchQuery?.trim() ? searchQuery.trim() : undefined,
      contact_id: contactFilter || undefined,
      dialer_session_id: dialerSessionFilter || undefined,
      disposition_id: dispositionFilterMulti || undefined,
      direction: directionFilterMulti || undefined,
      status: statusFilterMulti || undefined,
      is_connected: connectedFilterMulti || undefined,
      agent_user_id: agentFilterMulti || undefined,
        started_after: startedAfter || undefined,
        started_before: startedBefore || undefined,
        today_only: todayOnly,
        meaningful_only: '1',
        column_filters:
          callHistoryColumnFilters.length > 0 ? JSON.stringify(callHistoryColumnFilters) : undefined,
      }),
    [
      searchQuery,
      contactFilter,
      dialerSessionFilter,
      dispositionFilterMulti,
      directionFilterMulti,
      statusFilterMulti,
      connectedFilterMulti,
      agentFilterMulti,
      startedAfter,
      startedBefore,
      todayOnly,
      callHistoryColumnFilters,
    ]
  );

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectAllMatchingLoading, setSelectAllMatchingLoading] = useState(false);
  const [selectionIsAllMatching, setSelectionIsAllMatching] = useState(false);
  const allOnPageIds = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const allOnPageSelected = useMemo(
    () => allOnPageIds.length > 0 && allOnPageIds.every((id) => selectedIds.has(id)),
    [allOnPageIds, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    const key = String(id);
    setSelectionIsAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectionIsAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => next.has(id));
      if (allSelected) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allOnPageIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionIsAllMatching(false);
  }, []);

  const applyCallHistoryColumnPanel = useCallback(
    (col, { sort, filter }) => {
      if (!col.columnFilterOnly) {
        if (sort === 'default') {
          setSortBy('');
          setSortDir('desc');
        } else {
          setSortBy(col.sortKey);
          setSortDir(sort);
        }
      }
      setCallHistoryColumnFilters((prev) => {
        const rest = prev.filter((r) => r.field !== col.id);
        if (!filter || !filter.op || filter.op === 'none') return rest;
        return [...rest, { field: col.id, op: filter.op, value: filter.value || '' }];
      });
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  const handleSelectAllMatchingToggle = useCallback(async () => {
    if (selectionIsAllMatching && selectedIds.size > 0) {
      clearSelection();
      return;
    }
    setSelectAllMatchingLoading(true);
    try {
      const res = await callsAPI.listIds({
        q: searchQuery?.trim() ? searchQuery.trim() : undefined,
        contact_id: contactFilter || undefined,
        dialer_session_id: dialerSessionFilter || undefined,
        disposition_id: dispositionFilterMulti || undefined,
        direction: directionFilterMulti || undefined,
        status: statusFilterMulti || undefined,
        is_connected: connectedFilterMulti || undefined,
        agent_user_id: agentFilterMulti || undefined,
        started_after: startedAfter || undefined,
        started_before: startedBefore || undefined,
        today_only: todayOnly,
        meaningful_only: true,
        column_filters:
          callHistoryColumnFilters.length > 0 ? JSON.stringify(callHistoryColumnFilters) : undefined,
      });
      const { ids = [], total = 0, truncated, cap } = res?.data ?? {};
      if (truncated) {
        window.alert(
          `Your filters match ${total} records. Only the first ${cap} IDs were loaded for selection — narrow filters to include everyone in bulk actions.`
        );
      }
      setSelectedIds(new Set(ids.map((x) => String(x))));
      setSelectionIsAllMatching(ids.length > 0);
    } catch (e) {
      window.alert(e?.response?.data?.error || e?.message || 'Could not select all matching records.');
    } finally {
      setSelectAllMatchingLoading(false);
    }
  }, [
    selectionIsAllMatching,
    selectedIds.size,
    clearSelection,
    searchQuery,
    contactFilter,
    dialerSessionFilter,
    dispositionFilterMulti,
    directionFilterMulti,
    statusFilterMulti,
    connectedFilterMulti,
    agentFilterMulti,
    startedAfter,
    startedBefore,
    todayOnly,
    callHistoryColumnFilters,
  ]);

  const [callHistoryActionsOpen, setCallHistoryActionsOpen] = useState(false);
  const [exportCsvOpen, setExportCsvOpen] = useState(false);
  const callHistoryActionsRef = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      const el = callHistoryActionsRef.current;
      if (!callHistoryActionsOpen || !el) return;
      if (!el.contains(e.target)) setCallHistoryActionsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setCallHistoryActionsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [callHistoryActionsOpen]);

  const startSingle = async () => {
    setStarting(true);
    setError('');
    try {
      const cid = Number(contactIdDraft);
      if (!cid) {
        setError('Enter a valid contact/lead id to start a dummy call.');
        return;
      }
      await callsAPI.start({ contact_id: cid, provider });
      setContactIdDraft('');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to start call');
    } finally {
      setStarting(false);
    }
  };

  if (!canView) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Call history" description="Calls & follow-ups" />
        <Alert variant="error">You don’t have access to the call module.</Alert>
      </div>
    );
  }

  const canStartCall = canAny(['dial.execute']);
  const hasActiveFilters = Boolean(
    String(searchQuery || '').trim() ||
      String(contactFilter || '').trim() ||
      String(dialerSessionFilter || '').trim() ||
      dispositionFilterMulti ||
      directionFilterMulti ||
      statusFilterMulti ||
      connectedFilterMulti ||
      agentFilterMulti ||
      todayOnly ||
      startedAfter ||
      startedBefore ||
      callHistoryColumnFilters.length > 0
  );

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Call history"
        description="Call attempts only — use a row to narrow the list to that party’s calls. Full CRM activity (assignments, all dials, WhatsApp, deals) is on the lead/contact screen under Activity."
        actions={
          canStartCall ? (
            <div className={styles.headerActions}>
              <Select
                label="Provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                options={[{ value: 'dummy', label: 'Dummy (dev)' }]}
              />
              <Input
                label="Contact/Lead ID"
                value={contactIdDraft}
                onChange={(e) => setContactIdDraft(e.target.value)}
                placeholder="e.g. 123"
                inputMode="numeric"
              />
              <Button onClick={startSingle} disabled={starting || loading}>
                {starting ? 'Calling…' : 'Start call'}
              </Button>
            </div>
          ) : undefined
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {contactFilter ? (
        <div className={styles.contactScopeBanner} role="status">
          <span>
            Showing <strong>call history</strong> for party id <strong>{contactFilter}</strong> (attempts on this page
            only — not the CRM Activity screen).
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setContactFilter('')}>
            Show all calls
          </Button>
        </div>
      ) : null}
      {dialerSessionFilter ? (
        <div className={styles.contactScopeBanner} role="status">
          <span>
            Showing <strong>call history</strong> for dial session id <strong>{dialerSessionFilter}</strong>.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDialerSessionFilter('')}
          >
            Show all calls
          </Button>
        </div>
      ) : null}
      <CallHistoryCards data={metrics} loading={metricsLoading} />

      <div className={listStyles.tableCard}>
        <div className={`${listStyles.tableCardToolbarTop} ${listStyles.tableCardToolbarTopLead}`}>
          <div className={listStyles.tableCardToolbarLeft}>
            <div className={listStyles.bulkToolbarSlot}>
              {selectedIds.size > 0 ? (
                <span className={listStyles.bulkSelectionCount}>{selectedIds.size} selected</span>
              ) : (
                <span className={listStyles.bulkToolbarHint}>
                  Select rows for bulk actions. Use Filters or the search bar to narrow the list.
                </span>
              )}
            </div>
          </div>
          <div className={styles.toolbarSearchAndBulk}>
            {hasActiveFilters ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setContactFilter('');
                  setDialerSessionFilter('');
                  setSearchQuery('');
                  setDispositionFilterMulti('');
                  setDirectionFilterMulti('');
                  setStatusFilterMulti('');
                  setConnectedFilterMulti('');
                  setAgentFilterMulti('');
                  setStartedAfter('');
                  setStartedBefore('');
                  setTodayOnly(false);
                  clearSelection();
                  setEditingSavedFilterId(null);
                  setEditingSavedFilterName('');
                  setEditingSavedFilterSnapshot(null);
                  setPage(1);
                  setCallHistoryColumnFilters([]);
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      p.delete('q');
                      p.delete('contact_id');
                      p.delete('dialer_session_id');
                      return p;
                    },
                    { replace: true }
                  );
                }}
                className={styles.toolbarControlBtn}
              >
                <IconReset />
                Reset
              </Button>
            ) : null}

            {rows.length > 0 && (pagination.total || 0) > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={styles.toolbarControlBtn}
                disabled={selectAllMatchingLoading}
                onClick={() => void handleSelectAllMatchingToggle()}
              >
                {selectAllMatchingLoading
                  ? 'Loading…'
                  : selectionIsAllMatching && selectedIds.size > 0
                    ? 'Deselect all'
                    : 'Select all'}
              </Button>
            ) : null}

            <Button type="button" size="sm" variant="primary" onClick={() => setFiltersOpen(true)}>
              Filters
            </Button>

            <div className={contactPageStyles.bulkActionsWrap} ref={callHistoryActionsRef}>
              <Button
                type="button"
                size="sm"
                variant="primary"
                className={contactPageStyles.toolbarControlBtn}
                aria-haspopup="menu"
                aria-expanded={callHistoryActionsOpen}
                onClick={() => setCallHistoryActionsOpen((v) => !v)}
              >
                <span className={contactPageStyles.actionsTriggerInner}>
                  Actions
                  <IconChevronDown className={contactPageStyles.actionsTriggerChevron} />
                </span>
              </Button>
              {callHistoryActionsOpen ? (
                <div className={contactPageStyles.bulkActionsMenu} role="menu">
                  <div className={contactPageStyles.actionsMenuSection}>
                    <CallHistoryActionsMenuItem
                      icon={IconFilter}
                      onClick={() => {
                        setCallHistoryActionsOpen(false);
                        setFilterOptionsOpen(true);
                      }}
                    >
                      Saved filters…
                    </CallHistoryActionsMenuItem>
                    <CallHistoryActionsMenuItem
                      icon={IconExport}
                      onClick={() => {
                        setCallHistoryActionsOpen(false);
                        setExportCsvOpen(true);
                      }}
                    >
                      Export CSV
                    </CallHistoryActionsMenuItem>
                    <CallHistoryActionsMenuItem
                      icon={IconColumns}
                      onClick={() => {
                        setCallHistoryActionsOpen(false);
                        setCallHistoryCustomizeOpen(true);
                      }}
                    >
                      Customize columns
                    </CallHistoryActionsMenuItem>
                  </div>
                  <div className={contactPageStyles.actionsMenuDivider} role="separator" />
                  <p className={contactPageStyles.listActionsMenuHint}>With rows selected</p>
                  <div className={contactPageStyles.actionsMenuSection}>
                    <CallHistoryActionsMenuItem
                      icon={IconBlank}
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        if (selectedIds.size === 0) return;
                        clearSelection();
                        setCallHistoryActionsOpen(false);
                      }}
                    >
                      Clear selection
                    </CallHistoryActionsMenuItem>
                  </div>
                </div>
              ) : null}
            </div>

            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                const t = String(v ?? '').trim();
                setSearchQuery(t);
                setPage(1);
                clearSelection();
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    if (t) p.set('q', t);
                    else p.delete('q');
                    return p;
                  },
                  { replace: true }
                );
              }}
              placeholder="Search... (press Enter)"
              className={styles.toolbarSearchField}
            />
          </div>
        </div>

        <TableDataRegion
          loading={loading}
          hasCompletedInitialFetch={hasCompletedInitialFetch}
          className={listStyles.tableDataRegionLead}
        >
          {rows.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>No call history rows match your filters.</div>
          ) : (
            <div
              ref={callHistoryTableScrollRef}
              className={`${listStyles.tableCardBody} ${listStyles.tableCardBodyLead}`}
            >
              <CallHistoryDataTable
                rows={rows}
                applicableColumns={callHistoryApplicableColumns}
                visibleColumnIds={callHistoryVisibleColumnIds}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAllOnPage={() => toggleSelectAllOnPage()}
                allOnPageSelected={allOnPageSelected}
                sortBy={sortBy}
                sortDir={sortDir}
                columnFilters={callHistoryColumnFilters}
                onColumnHeaderClick={(col) => {
                  if (col?.sortKey || col?.columnFilterOnly) setCallHistoryColumnPanelCol(col);
                }}
                onOpenCustomizeColumns={() => setCallHistoryCustomizeOpen(true)}
                onViewAttempt={(r) => setAttemptDetailRow(r)}
                onOpenDialSession={(r) => {
                  if (r?.dialer_session_id) navigate(`/dialer/session/${r.dialer_session_id}`);
                }}
                formatWhen={(v) => safeDateTime(v)}
                notesPreview={(r) => sanitizeAttemptNotesForDisplay(r.notes || '').slice(0, 120) || '—'}
              />
            </div>
          )}
        </TableDataRegion>

        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pagination.page || page}
            totalPages={totalPages}
            total={pagination.total || 0}
            limit={pagination.limit || limit}
            onPageChange={(p) => setPage(p)}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
          />
        </div>
      </div>

      <CallHistoryAttemptDetailModal
        isOpen={Boolean(attemptDetailRow)}
        onClose={() => setAttemptDetailRow(null)}
        row={attemptDetailRow}
        formatWhen={safeDateTime}
        onFilterByParty={(id) => {
          clearSelection();
          setContactFilter(id);
        }}
      />

      <CallHistoryFilterModal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        values={{
          contactFilter,
          dispositionFilterMulti,
          directionFilterMulti,
          statusFilterMulti,
          connectedFilterMulti,
          agentFilterMulti,
          todayOnly,
          startedAfter,
          startedBefore,
        }}
        dispositionOptions={dispositionOptions}
        agentOptions={agentOptions}
        directionOptions={directionOptions}
        statusOptions={statusOptions}
        connectedOptions={connectedOptions}
        canPickAgents={user?.role === 'admin' || user?.role === 'manager'}
        onReset={() => {
          setContactFilter('');
          setDispositionFilterMulti('');
          setDirectionFilterMulti('');
          setStatusFilterMulti('');
          setConnectedFilterMulti('');
          setAgentFilterMulti('');
          setTodayOnly(false);
          setStartedAfter('');
          setStartedBefore('');
          setPage(1);
          clearSelection();
        }}
        onApply={(next) => {
          setContactFilter(next?.contactFilter ?? '');
          setDispositionFilterMulti(next?.dispositionFilterMulti ?? '');
          setDirectionFilterMulti(next?.directionFilterMulti ?? '');
          setStatusFilterMulti(next?.statusFilterMulti ?? '');
          setConnectedFilterMulti(next?.connectedFilterMulti ?? '');
          setAgentFilterMulti(next?.agentFilterMulti ?? '');
          setTodayOnly(Boolean(next?.todayOnly));
          setStartedAfter(next?.startedAfter ?? '');
          setStartedBefore(next?.startedBefore ?? '');
          setPage(1);
          clearSelection();
          setEditingSavedFilterId(null);
          setEditingSavedFilterName('');
          setEditingSavedFilterSnapshot(null);
        }}
        savedFilterId={editingSavedFilterId}
        initialSavedFilterName={editingSavedFilterName}
        existingSavedFilters={savedFilters.map((f) => ({ id: f.id, name: f.name }))}
        onSaveNamedFilter={async (name, next) => {
          try {
            const snap = buildCallHistorySnapshot(next || {});
            await savedListFiltersAPI.create({ entity_type: 'call_history', name, filter_json: snap });
            const res = await savedListFiltersAPI.list({ entity_type: 'call_history' });
            setSavedFilters(res?.data?.data ?? []);
          } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Could not save filter');
          }
        }}
        onUpdateNamedFilter={async (id, name, next) => {
          try {
            const snap = buildCallHistorySnapshot(next || {});
            await savedListFiltersAPI.update(id, { name, filter_json: snap });
            const res = await savedListFiltersAPI.list({ entity_type: 'call_history' });
            setSavedFilters(res?.data?.data ?? []);
          } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Could not update filter');
          }
        }}
      />

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
          applyCallHistorySnapshot(snap);
          clearSelection();
          setEditingSavedFilterId(null);
          setEditingSavedFilterName('');
          setEditingSavedFilterSnapshot(null);
        }}
        onDelete={async (f) => {
          await savedListFiltersAPI.remove(f.id);
          const res = await savedListFiltersAPI.list({ entity_type: 'call_history' });
          setSavedFilters(res?.data?.data ?? []);
        }}
        onEdit={(f) => {
          const snap = parseSavedListFilterSnapshot(f);
          if (!snap || !f?.id) return;
          setEditingSavedFilterId(f.id);
          setEditingSavedFilterName(String(f.name || '').trim());
          setEditingSavedFilterSnapshot(snap);
          applyCallHistorySnapshot(snap);
          setBrowseSavedOpen(false);
          setFiltersOpen(true);
        }}
      />

      <LeadColumnSortFilterModal
        isOpen={!!callHistoryColumnPanelCol}
        onClose={() => setCallHistoryColumnPanelCol(null)}
        column={callHistoryColumnPanelCol}
        sortBy={sortBy}
        sortDir={sortDir}
        filterRule={callHistoryColumnFilters.find((r) => r.field === callHistoryColumnPanelCol?.id)}
        filterOnly={!!callHistoryColumnPanelCol?.columnFilterOnly}
        modalSubtitle="Sort and filter this column for the current call history list."
        onApply={(payload) => {
          if (callHistoryColumnPanelCol) applyCallHistoryColumnPanel(callHistoryColumnPanelCol, payload);
        }}
      />

      <LeadColumnCustomizeModal
        isOpen={callHistoryCustomizeOpen}
        onClose={() => setCallHistoryCustomizeOpen(false)}
        applicableColumns={callHistoryApplicableColumns}
        visibleColumnIds={callHistoryVisibleColumnIds}
        onSave={setCallHistoryVisibleColumnIds}
        title="Customize columns"
        getDefaults={getDefaultVisibleCallHistoryColumnIds}
        persistVisibleIds={saveCallHistoryVisibleColumnIds}
        pinnedColumnId="created_at"
        standardColumnTagLabel="Default"
        canAddCustomField={false}
      />

      <ExportCsvModal
        isOpen={exportCsvOpen}
        onClose={() => setExportCsvOpen(false)}
        exportEntity="calls"
        type="contact"
        listQueryParams={callHistoryExportListParams}
        applicableColumns={callHistoryApplicableColumns}
        visibleColumnIds={callHistoryVisibleColumnIds}
        selectedIds={selectedIds}
        totalMatching={pagination.total || 0}
      />
    </div>
  );
}

