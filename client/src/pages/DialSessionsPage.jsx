import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { SearchInput } from '../components/ui/SearchInput';
import listStyles from '../components/admin/adminDataList.module.scss';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { usePermissions } from '../hooks/usePermission';
import styles from './DialSessionsPage.module.scss';
import { DialSessionsDataTable } from './DialSessionsDataTable';
import { DialSessionsFilterModal } from './DialSessionsFilterModal';
import { LeadColumnCustomizeModal } from '../features/contacts/LeadColumnCustomizeModal';
import { LeadColumnSortFilterModal } from '../features/contacts/LeadColumnSortFilterModal';
import { ExportCsvModal } from '../features/contacts/ExportCsvModal';
import contactPageStyles from '../features/contacts/ContactsPage.module.scss';
import {
  IconChevronDown,
  IconColumns,
  IconExport,
} from '../features/contacts/ListActionsMenuIcons';
import {
  getApplicableDialSessionsColumns,
  getDefaultVisibleDialSessionsColumnIds,
  loadDialSessionsVisibleColumnIds,
  saveDialSessionsVisibleColumnIds,
} from './dialSessionsTableConfig';
import { TIME_RANGE_PRESET, resolveDialSessionCreatedParams } from '../utils/dateRangePresets';

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

function DialSessionsActionsMenuItem({ icon: Icon, children, danger, disabled, className = '', ...rest }) {
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

export function DialSessionsPage() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);
  const canPickCreatedBy = user?.role === 'admin' || user?.role === 'manager';

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [timeRangePreset, setTimeRangePreset] = useState(TIME_RANGE_PRESET.ALL_TIME);
  const [timeRangeCustomCreatedAfter, setTimeRangeCustomCreatedAfter] = useState('');
  const [timeRangeCustomCreatedBefore, setTimeRangeCustomCreatedBefore] = useState('');
  const [filterCreatedByUserId, setFilterCreatedByUserId] = useState('');
  const [filterScriptQ, setFilterScriptQ] = useState('');
  const [filterItemsMin, setFilterItemsMin] = useState('');
  const [filterItemsMax, setFilterItemsMax] = useState('');
  const [filterCalledMin, setFilterCalledMin] = useState('');
  const [filterCalledMax, setFilterCalledMax] = useState('');
  const [filterConnectedMin, setFilterConnectedMin] = useState('');
  const [filterConnectedMax, setFilterConnectedMax] = useState('');
  const [filterFailedMin, setFilterFailedMin] = useState('');
  const [filterFailedMax, setFilterFailedMax] = useState('');
  const [filterQueuedMin, setFilterQueuedMin] = useState('');
  const [filterQueuedMax, setFilterQueuedMax] = useState('');
  const [filterDurationMin, setFilterDurationMin] = useState('');
  const [filterDurationMax, setFilterDurationMax] = useState('');

  const [filterUserOptions, setFilterUserOptions] = useState([{ value: '', label: 'Anyone' }]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportCsvOpen, setExportCsvOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  const tableScrollContainerRef = useRef(null);

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnPanelCol, setColumnPanelCol] = useState(null);

  const applicableColumns = useMemo(() => getApplicableDialSessionsColumns(), []);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() =>
    loadDialSessionsVisibleColumnIds(getApplicableDialSessionsColumns())
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectAllMatchingLoading, setSelectAllMatchingLoading] = useState(false);
  const [selectionIsAllMatching, setSelectionIsAllMatching] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionIsAllMatching(false);
  }, []);

  const dialSessionTimeParams = useMemo(
    () =>
      resolveDialSessionCreatedParams(
        timeRangePreset,
        timeRangeCustomCreatedAfter,
        timeRangeCustomCreatedBefore,
        new Date()
      ),
    [timeRangePreset, timeRangeCustomCreatedAfter, timeRangeCustomCreatedBefore]
  );

  const listFilterParams = useMemo(
    () => ({
      q: searchQuery?.trim() ? searchQuery.trim() : undefined,
      status: statusFilter || undefined,
      provider: providerFilter?.trim() ? providerFilter.trim() : undefined,
      created_after: dialSessionTimeParams.created_after,
      created_before: dialSessionTimeParams.created_before,
      created_by_user_id: filterCreatedByUserId?.trim() || undefined,
      script_q: filterScriptQ?.trim() || undefined,
      items_min: filterItemsMin?.trim() || undefined,
      items_max: filterItemsMax?.trim() || undefined,
      called_min: filterCalledMin?.trim() || undefined,
      called_max: filterCalledMax?.trim() || undefined,
      connected_min: filterConnectedMin?.trim() || undefined,
      connected_max: filterConnectedMax?.trim() || undefined,
      failed_min: filterFailedMin?.trim() || undefined,
      failed_max: filterFailedMax?.trim() || undefined,
      queued_min: filterQueuedMin?.trim() || undefined,
      queued_max: filterQueuedMax?.trim() || undefined,
      duration_min: filterDurationMin?.trim() || undefined,
      duration_max: filterDurationMax?.trim() || undefined,
      column_filters: columnFilters.length > 0 ? JSON.stringify(columnFilters) : undefined,
    }),
    [
      searchQuery,
      statusFilter,
      providerFilter,
      dialSessionTimeParams,
      filterCreatedByUserId,
      filterScriptQ,
      filterItemsMin,
      filterItemsMax,
      filterCalledMin,
      filterCalledMax,
      filterConnectedMin,
      filterConnectedMax,
      filterFailedMin,
      filterFailedMax,
      filterQueuedMin,
      filterQueuedMax,
      filterDurationMin,
      filterDurationMax,
      columnFilters,
    ]
  );

  useEffect(() => {
    if (!filtersOpen || !canPickCreatedBy) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await tenantUsersAPI.getAll({ limit: 100, page: 1, includeDisabled: false });
        const rows = res?.data?.data ?? [];
        const base = [{ value: '', label: 'Anyone' }];
        if (user?.role === 'manager' && user?.id != null) {
          base.push({
            value: String(user.id),
            label: user.name || user.email || 'Me (manager)',
          });
        }
        const seen = new Set(base.map((o) => o.value));
        for (const row of rows) {
          const v = String(row.id);
          if (seen.has(v)) continue;
          seen.add(v);
          base.push({ value: v, label: row.name || row.email || '—' });
        }
        if (!cancelled) setFilterUserOptions(base);
      } catch {
        if (!cancelled) setFilterUserOptions([{ value: '', label: 'Anyone' }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtersOpen, canPickCreatedBy, user?.id, user?.role, user?.name, user?.email]);

  const applyColumnPanel = useCallback(
    (col, { sort, filter }) => {
      if (col?.sortKey) {
        if (sort === 'default') {
          setSortBy('');
          setSortDir('desc');
        } else {
          setSortBy(col.sortKey);
          setSortDir(sort);
        }
      }
      setColumnFilters((prev) => {
        const rest = prev.filter((r) => r.field !== col.id);
        if (!filter || !filter.op || filter.op === 'none') return rest;
        return [...rest, { field: col.id, op: filter.op, value: filter.value || '' }];
      });
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.list({
        page,
        limit,
        ...listFilterParams,
        sort_by: sortBy || undefined,
        sort_dir: sortDir || undefined,
      });
      setPayload(res?.data ?? null);
      setHasCompletedInitialFetch(true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load dial sessions');
      setPayload(null);
      setHasCompletedInitialFetch(true);
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    page,
    limit,
    listFilterParams,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDoc = (e) => {
      const el = actionsRef.current;
      if (!actionsOpen || !el) return;
      if (!el.contains(e.target)) setActionsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);

  const rows = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages || 1);

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

  const handleSelectAllMatchingToggle = useCallback(async () => {
    if (selectionIsAllMatching && selectedIds.size > 0) {
      clearSelection();
      return;
    }
    setSelectAllMatchingLoading(true);
    try {
      const res = await dialerSessionsAPI.listIds(listFilterParams);
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
    listFilterParams,
  ]);

  const dialSessionsExportListParams = listFilterParams;

  const hasActiveFilters = Boolean(
    String(searchQuery || '').trim() ||
      String(statusFilter || '').trim() ||
      String(providerFilter || '').trim() ||
      timeRangePreset !== TIME_RANGE_PRESET.ALL_TIME ||
      String(filterCreatedByUserId || '').trim() ||
      String(filterScriptQ || '').trim() ||
      String(filterItemsMin || '').trim() ||
      String(filterItemsMax || '').trim() ||
      String(filterCalledMin || '').trim() ||
      String(filterCalledMax || '').trim() ||
      String(filterConnectedMin || '').trim() ||
      String(filterConnectedMax || '').trim() ||
      String(filterFailedMin || '').trim() ||
      String(filterFailedMax || '').trim() ||
      String(filterQueuedMin || '').trim() ||
      String(filterQueuedMax || '').trim() ||
      String(filterDurationMin || '').trim() ||
      String(filterDurationMax || '').trim() ||
      columnFilters.length > 0
  );

  const resetAllFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('');
    setProviderFilter('');
    setCreatedAfter('');
    setCreatedBefore('');
    setFilterCreatedByUserId('');
    setFilterScriptQ('');
    setFilterItemsMin('');
    setFilterItemsMax('');
    setFilterCalledMin('');
    setFilterCalledMax('');
    setFilterConnectedMin('');
    setFilterConnectedMax('');
    setFilterFailedMin('');
    setFilterFailedMax('');
    setFilterQueuedMin('');
    setFilterQueuedMax('');
    setFilterDurationMin('');
    setFilterDurationMax('');
    setColumnFilters([]);
    setSortBy('');
    setSortDir('desc');
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  if (!canView) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Dial sessions" description="Power dialer queues" />
        <Alert variant="error">You don’t have access to dial sessions.</Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Dial sessions"
        description="Power-dial queues: session # is per user; open a row to run or review the queue. Related calls appear on Call history."
        actions={
          <div className={styles.headerActions}>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/dialer')}>
              Dialer home
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

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
                onClick={resetAllFilters}
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

            <div className={contactPageStyles.bulkActionsWrap} ref={actionsRef}>
              <Button
                type="button"
                size="sm"
                variant="primary"
                className={contactPageStyles.toolbarControlBtn}
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen((v) => !v)}
              >
                <span className={contactPageStyles.actionsTriggerInner}>
                  Actions
                  <IconChevronDown className={contactPageStyles.actionsTriggerChevron} />
                </span>
              </Button>
              {actionsOpen ? (
                <div className={contactPageStyles.bulkActionsMenu} role="menu">
                  <div className={contactPageStyles.actionsMenuSection}>
                    <DialSessionsActionsMenuItem
                      icon={IconExport}
                      onClick={() => {
                        setActionsOpen(false);
                        setExportCsvOpen(true);
                      }}
                    >
                      Export CSV
                    </DialSessionsActionsMenuItem>
                    <DialSessionsActionsMenuItem
                      icon={IconColumns}
                      onClick={() => {
                        setActionsOpen(false);
                        setCustomizeOpen(true);
                      }}
                    >
                      Customize columns
                    </DialSessionsActionsMenuItem>
                  </div>
                  <div className={contactPageStyles.actionsMenuDivider} role="separator" />
                  <p className={contactPageStyles.listActionsMenuHint}>With rows selected</p>
                  <div className={contactPageStyles.actionsMenuSection}>
                    <DialSessionsActionsMenuItem
                      icon={IconBlank}
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        if (selectedIds.size === 0) return;
                        clearSelection();
                        setActionsOpen(false);
                      }}
                    >
                      Clear selection
                    </DialSessionsActionsMenuItem>
                  </div>
                </div>
              ) : null}
            </div>

            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(String(v ?? '').trim());
                setPage(1);
                clearSelection();
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
            <div className={listStyles.tableCardEmpty}>No dial sessions match your filters.</div>
          ) : (
            <div className={listStyles.tableCardBody} ref={tableScrollContainerRef}>
              <DialSessionsDataTable
                rows={rows}
                applicableColumns={applicableColumns}
                visibleColumnIds={visibleColumnIds}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAllOnPage={toggleSelectAllOnPage}
                allOnPageSelected={allOnPageSelected}
                onOpenCustomizeColumns={() => setCustomizeOpen(true)}
                sortBy={sortBy}
                sortDir={sortDir}
                columnFilters={columnFilters}
                onColumnHeaderClick={(col) => {
                  if (col?.sortKey || col?.columnFilterOnly) setColumnPanelCol(col);
                }}
                formatWhen={(v) => safeDateTime(v)}
                onOpenCallHistory={(r) =>
                  navigate(`/calls/history?dialer_session_id=${encodeURIComponent(String(r?.id ?? ''))}`)
                }
                onOpenSession={(r) => navigate(`/dialer/session/${r?.id}`)}
                tableScrollContainerRef={tableScrollContainerRef}
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
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DialSessionsFilterModal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        showCreatedByFilter={canPickCreatedBy}
        createdByOptions={filterUserOptions}
        values={{
          statusFilter,
          providerFilter,
          timeRangePreset,
          customCreatedAfter: timeRangeCustomCreatedAfter,
          customCreatedBefore: timeRangeCustomCreatedBefore,
          createdByUserId: filterCreatedByUserId,
          scriptQ: filterScriptQ,
          itemsMin: filterItemsMin,
          itemsMax: filterItemsMax,
          calledMin: filterCalledMin,
          calledMax: filterCalledMax,
          connectedMin: filterConnectedMin,
          connectedMax: filterConnectedMax,
          failedMin: filterFailedMin,
          failedMax: filterFailedMax,
          queuedMin: filterQueuedMin,
          queuedMax: filterQueuedMax,
          durationMin: filterDurationMin,
          durationMax: filterDurationMax,
        }}
        onReset={resetAllFilters}
        onApply={(next) => {
          setStatusFilter(next?.statusFilter ?? '');
          setProviderFilter(next?.providerFilter ?? '');
          setTimeRangePreset(next?.timeRangePreset ?? TIME_RANGE_PRESET.ALL_TIME);
          setTimeRangeCustomCreatedAfter(next?.customCreatedAfter ?? '');
          setTimeRangeCustomCreatedBefore(next?.customCreatedBefore ?? '');
          setFilterCreatedByUserId(next?.createdByUserId ?? '');
          setFilterScriptQ(next?.scriptQ ?? '');
          setFilterItemsMin(next?.itemsMin ?? '');
          setFilterItemsMax(next?.itemsMax ?? '');
          setFilterCalledMin(next?.calledMin ?? '');
          setFilterCalledMax(next?.calledMax ?? '');
          setFilterConnectedMin(next?.connectedMin ?? '');
          setFilterConnectedMax(next?.connectedMax ?? '');
          setFilterFailedMin(next?.failedMin ?? '');
          setFilterFailedMax(next?.failedMax ?? '');
          setFilterQueuedMin(next?.queuedMin ?? '');
          setFilterQueuedMax(next?.queuedMax ?? '');
          setFilterDurationMin(next?.durationMin ?? '');
          setFilterDurationMax(next?.durationMax ?? '');
          setPage(1);
          clearSelection();
        }}
      />

      <LeadColumnCustomizeModal
        isOpen={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        applicableColumns={applicableColumns}
        visibleColumnIds={visibleColumnIds}
        onSave={setVisibleColumnIds}
        title="Customize columns"
        getDefaults={getDefaultVisibleDialSessionsColumnIds}
        persistVisibleIds={saveDialSessionsVisibleColumnIds}
        pinnedColumnId="session_no"
        standardColumnTagLabel="Default"
        canAddCustomField={false}
      />

      <LeadColumnSortFilterModal
        isOpen={!!columnPanelCol}
        onClose={() => setColumnPanelCol(null)}
        column={columnPanelCol}
        sortBy={sortBy}
        sortDir={sortDir}
        filterRule={columnFilters.find((r) => r.field === columnPanelCol?.id)}
        filterOnly={!!columnPanelCol?.columnFilterOnly}
        modalSubtitle="Sort and filter this column for the current dial sessions list."
        onApply={(payloadNext) => {
          if (columnPanelCol) applyColumnPanel(columnPanelCol, payloadNext);
        }}
      />

      <ExportCsvModal
        isOpen={exportCsvOpen}
        onClose={() => setExportCsvOpen(false)}
        exportEntity="dialer_sessions"
        type="contact"
        listQueryParams={dialSessionsExportListParams}
        applicableColumns={applicableColumns}
        visibleColumnIds={visibleColumnIds}
        selectedIds={selectedIds}
        totalMatching={pagination.total || 0}
      />
    </div>
  );
}
