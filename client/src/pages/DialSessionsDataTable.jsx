import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import leadTableStyles from '../features/contacts/LeadDataTable.module.scss';
import styles from './DialSessionsDataTable.module.scss';

const ACTION_MENU_MIN_W = 180;

function DialSessionRowActionsMenu({ row, onOpenSession, onOpenCallHistory, scrollContainerRef }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = useCallback(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - ACTION_MENU_MIN_W),
      window.innerWidth - ACTION_MENU_MIN_W - 8
    );
    setMenuPos({ top: rect.bottom + 4, left });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    const scrollEl = scrollContainerRef?.current ?? null;
    if (scrollEl) scrollEl.addEventListener('scroll', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      if (scrollEl) scrollEl.removeEventListener('scroll', onScrollOrResize);
    };
  }, [open, updateMenuPosition, scrollContainerRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            className={leadTableStyles.actionMenu}
            style={{ top: menuPos.top, left: menuPos.left, minWidth: ACTION_MENU_MIN_W }}
            role="menu"
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={leadTableStyles.actionMenuItem}
                onClick={() => {
                  onOpenCallHistory?.(row);
                  setOpen(false);
                }}
              >
                Call history
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={leadTableStyles.actionMenuItem}
                onClick={() => {
                  onOpenSession?.(row);
                  setOpen(false);
                }}
              >
                Open
              </button>
            </li>
          </ul>,
          document.body
        )
      : null;

  return (
    <div className={leadTableStyles.actionMenuWrap} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={leadTableStyles.moreBtn}
        aria-label="Row actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={leadTableStyles.moreDotsRow} aria-hidden>
          <span className={leadTableStyles.moreDot} />
          <span className={leadTableStyles.moreDot} />
          <span className={leadTableStyles.moreDot} />
        </span>
      </button>
      {menu}
    </div>
  );
}

function formatSessionTimeHms(sec) {
  const n = Number(sec ?? 0);
  if (!Number.isFinite(n) || n < 0) return '00:00:00';
  const s = Math.floor(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function renderCell(col, r, { formatWhen, onOpenSession, onOpenCallHistory }) {
  switch (col.id) {
    case 'session_no':
      return <strong>#{r.user_session_no ?? '—'}</strong>;
    case 'status':
      return (
        <Badge variant="muted" size="sm">
          {r.status || '—'}
        </Badge>
      );
    case 'provider':
      return r.provider || '—';
    case 'leads':
      return r.items_count ?? '—';
    case 'called':
      return r.called_count ?? '—';
    case 'connected':
      return r.connected_count ?? '—';
    case 'failed':
      return r.failed_count ?? '—';
    case 'queued_left':
      return r.queued_count ?? '—';
    case 'script':
      return r.script_name || '—';
    case 'session_time':
      return formatSessionTimeHms(r.duration_sec);
    case 'created':
      return formatWhen?.(r.created_at) ?? '—';
    case 'started':
      return formatWhen?.(r.started_at) ?? '—';
    case 'ended':
      return formatWhen?.(r.ended_at) ?? '—';
    case 'created_by':
      return r.creator_name || '—';
    default:
      return '—';
  }
}

export function DialSessionsDataTable({
  rows = [],
  applicableColumns = [],
  visibleColumnIds = [],
  onOpenCustomizeColumns,
  sortBy,
  sortDir,
  columnFilters = [],
  onColumnHeaderClick,
  formatWhen,
  onOpenSession,
  onOpenCallHistory,
  tableScrollContainerRef,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllOnPage,
  allOnPageSelected,
}) {
  const selectedSet = selectedIds || new Set();

  const visibleDefs = useMemo(() => {
    const map = new Map(applicableColumns.map((c) => [c.id, c]));
    return visibleColumnIds.map((id) => map.get(id)).filter(Boolean);
  }, [applicableColumns, visibleColumnIds]);

  const hasFilter = (field) => columnFilters.some((f) => f.field === field);

  const hasRows = rows.length > 0;
  const idsOnPage = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const allChecked = hasRows ? allOnPageSelected : false;

  return (
    <Table
      variant="adminList"
      className={leadTableStyles.leadTableOuter}
      tableClassName={leadTableStyles.leadTable}
    >
      <TableHead>
        <TableRow>
          <TableHeaderCell width="44px" align="center" className={leadTableStyles.stickyFirst}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onToggleSelectAllOnPage?.(idsOnPage)}
              aria-label="Select all on page"
            />
          </TableHeaderCell>

          {visibleDefs.map((col) => (
            <TableHeaderCell
              key={col.id}
              sortable={false}
              onClick={col.sortKey || col.columnFilterOnly ? () => onColumnHeaderClick?.(col) : undefined}
            >
              <span className={leadTableStyles.headerInner}>
                <span>{col.label}</span>
                {col.sortKey && !col.columnFilterOnly && sortBy === col.sortKey ? (
                  <span className={leadTableStyles.sortMark} aria-hidden>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                ) : null}
                {col.sortKey && hasFilter(col.id) ? (
                  <span className={leadTableStyles.filterMark} title="Filter active" aria-label="Filter active" />
                ) : null}
              </span>
            </TableHeaderCell>
          ))}

          <TableHeaderCell
            width="120px"
            align="center"
            className={`${leadTableStyles.stickyLast} ${leadTableStyles.actionsTh}`}
          >
            <div className={leadTableStyles.actionsHead}>
              <span className={leadTableStyles.actionsHeadLabel}>Actions</span>
              <button
                type="button"
                className={leadTableStyles.gearBtn}
                aria-label="Customize columns"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomizeColumns?.();
                }}
              >
                <span className={leadTableStyles.gearIcon} aria-hidden>
                  ⚙
                </span>
              </button>
            </div>
          </TableHeaderCell>
        </TableRow>
      </TableHead>

      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell align="center" className={leadTableStyles.stickyFirst}>
              <input
                type="checkbox"
                checked={selectedSet.has(String(r.id))}
                onChange={() => onToggleSelect?.(r.id)}
                aria-label={`Select session ${r.id}`}
              />
            </TableCell>

            {visibleDefs.map((col) => (
              <TableCell key={col.id}>{renderCell(col, r, { formatWhen })}</TableCell>
            ))}

            <TableCell align="center" className={`${leadTableStyles.stickyLast} ${leadTableStyles.actionsTd}`}>
              <DialSessionRowActionsMenu
                row={r}
                onOpenSession={onOpenSession}
                onOpenCallHistory={onOpenCallHistory}
                scrollContainerRef={tableScrollContainerRef}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

