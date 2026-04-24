import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { Button } from '../components/ui/Button';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import listStyles from '../components/admin/adminDataList.module.scss';
import { callsAPI } from '../services/callsAPI';
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
import styles from './DialerSessionCallHistoryPanel.module.scss';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';

export function DialerSessionCallHistoryPanel({ dialerSessionId }) {
  const { formatDateTime } = useDateTimeDisplay();
  const navigate = useNavigate();
  const location = useLocation();

  const openCallHistoryCustomerRecord = useCallback((r) => {
    const id = r?.contact_id;
    const n = id != null ? Number(id) : NaN;
    if (!Number.isFinite(n) || n <= 0) return;
    const t = String(r?.contact_type || '').toLowerCase();
    navigate(t === 'lead' ? `/leads/${n}?mode=view` : `/contacts/${n}?mode=view`);
  }, [navigate]);
  const sid = String(dialerSessionId || '').trim();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [callHistoryColumnFilters, setCallHistoryColumnFilters] = useState([]);
  const [callHistoryColumnPanelCol, setCallHistoryColumnPanelCol] = useState(null);
  const [attemptDetailRow, setAttemptDetailRow] = useState(null);

  const callHistoryApplicableColumns = useMemo(() => getApplicableCallHistoryColumns(), []);
  const [callHistoryVisibleColumnIds, setCallHistoryVisibleColumnIds] = useState(() =>
    loadCallHistoryVisibleColumnIds(getApplicableCallHistoryColumns())
  );
  const [callHistoryCustomizeOpen, setCallHistoryCustomizeOpen] = useState(false);
  const tableScrollRef = useRef(null);

  const rows = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages || 1);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const allOnPageIds = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const allOnPageSelected = useMemo(
    () => allOnPageIds.length > 0 && allOnPageIds.every((id) => selectedIds.has(id)),
    [allOnPageIds, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => next.has(id));
      if (allSelected) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allOnPageIds]);

  const applyCallHistoryColumnPanel = useCallback((col, { sort, filter }) => {
    if (!col?.columnFilterOnly) {
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
  }, []);

  const load = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    setError('');
    try {
      const res = await callsAPI.list({
        page,
        limit,
        q: searchQuery?.trim() ? searchQuery.trim() : undefined,
        dialer_session_id: sid,
        meaningful_only: true,
        sort_by: sortBy || undefined,
        sort_dir: sortDir || undefined,
        column_filters:
          callHistoryColumnFilters.length > 0 ? JSON.stringify(callHistoryColumnFilters) : undefined,
      });
      setPayload(res?.data ?? null);
      setHasCompletedInitialFetch(true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load call history');
      setPayload(null);
      setHasCompletedInitialFetch(true);
    } finally {
      setLoading(false);
    }
  }, [sid, page, limit, searchQuery, sortBy, sortDir, callHistoryColumnFilters]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [sid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!sid) return null;

  return (
    <section className={styles.wrap} aria-label="Session call history">
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Call history (this dial session)</div>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/calls/history?dialer_session_id=${encodeURIComponent(sid)}`)}
          >
            Open full Call history
          </Button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={listStyles.tableCard}>
        <div className={`${listStyles.tableCardToolbarTop} ${listStyles.tableCardToolbarTopLead}`}>
          <div className={styles.toolbarRow}>
            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(String(v ?? '').trim());
                setPage(1);
              }}
              placeholder="Search... (press Enter)"
              className={styles.toolbarSearch}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setSearchQuery('');
                setSortBy('');
                setSortDir('desc');
                setCallHistoryColumnFilters([]);
                setSelectedIds(new Set());
                setPage(1);
              }}
            >
              Reset
            </Button>
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
            <div ref={tableScrollRef} className={`${listStyles.tableCardBody} ${listStyles.tableCardBodyLead}`}>
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
                onOpenCustomer={openCallHistoryCustomerRecord}
                onOpenDialSession={(r) => {
                  if (r?.dialer_session_id) {
                    navigate(`/dialer/session/${r.dialer_session_id}`, { state: location.state });
                  }
                }}
                dialSessionNavigateState={location.state}
                formatWhen={formatDateTime}
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
        formatWhen={formatDateTime}
      />

      <LeadColumnSortFilterModal
        isOpen={!!callHistoryColumnPanelCol}
        onClose={() => setCallHistoryColumnPanelCol(null)}
        column={callHistoryColumnPanelCol}
        sortBy={sortBy}
        sortDir={sortDir}
        filterRule={callHistoryColumnFilters.find((r) => r.field === callHistoryColumnPanelCol?.id)}
        filterOnly={!!callHistoryColumnPanelCol?.columnFilterOnly}
        modalSubtitle="Sort and filter this column for the current dial session call list."
        onApply={(payloadNext) => {
          if (callHistoryColumnPanelCol) applyCallHistoryColumnPanel(callHistoryColumnPanelCol, payloadNext);
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
        pinnedColumnId="call_notes"
        standardColumnTagLabel="Default"
        canAddCustomField={false}
      />
    </section>
  );
}

