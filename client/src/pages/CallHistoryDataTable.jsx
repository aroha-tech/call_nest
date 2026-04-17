import React, { useMemo } from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { ViewIcon } from '../components/ui/ActionIcons';
import leadTableStyles from '../features/contacts/LeadDataTable.module.scss';
import styles from './CallHistoryDataTable.module.scss';

function formatDurationSec(sec) {
  const n = Number(sec ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const s = Math.floor(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function renderCell(col, r, { formatWhen, notesPreview }) {
  switch (col.id) {
    case 'created_at':
      return formatWhen?.(r.created_at) ?? r.created_at ?? '—';
    case 'contact':
      return (
        <button type="button" className={styles.linkBtn} onClick={() => r.__viewAttempt?.()}>
          {r.display_name || '—'}
        </button>
      );
    case 'phone':
      return r.phone_e164 || '—';
    case 'agent':
      return r.agent_name || '—';
    case 'dial_session': {
      const sid = r.dialer_session_id;
      const no = r.dialer_user_session_no;
      if (!sid && (no == null || no === '')) return '—';
      const label = no != null && no !== '' ? `Session #${no}` : 'Dial session';
      return (
        <button
          type="button"
          className={styles.linkBtn}
          disabled={!sid}
          onClick={() => sid && r.__openDialSession?.()}
        >
          {label}
        </button>
      );
    }
    case 'direction':
      return (
        <Badge variant="muted" size="sm">
          {r.direction || '—'}
        </Badge>
      );
    case 'status':
      return (
        <Badge variant="default" size="sm">
          {r.status || '—'}
        </Badge>
      );
    case 'is_connected':
      return (
        <Badge variant={Number(r.is_connected) === 1 ? 'success' : 'warning'} size="sm">
          {Number(r.is_connected) === 1 ? 'Connected' : 'Not connected'}
        </Badge>
      );
    case 'disposition':
      return r.disposition_name || '—';
    case 'notes':
      return <span className={styles.notesCell}>{notesPreview?.(r) ?? '—'}</span>;
    case 'duration_sec':
      return formatDurationSec(r.duration_sec);
    case 'started_at':
      return formatWhen?.(r.started_at) ?? '—';
    case 'ended_at':
      return formatWhen?.(r.ended_at) ?? '—';
    case 'provider':
      return r.provider || '—';
    default:
      return '—';
  }
}

export function CallHistoryDataTable({
  rows = [],
  applicableColumns = [],
  visibleColumnIds = [],
  selectedIds,
  onToggleSelect,
  onToggleSelectAllOnPage,
  allOnPageSelected,
  sortBy,
  sortDir,
  onColumnHeaderClick,
  onOpenCustomizeColumns,
  onViewAttempt,
  onOpenDialSession,
  formatWhen,
  notesPreview,
  columnFilters = [],
}) {
  const selectedSet = selectedIds || new Set();

  const hasFilter = (field) => columnFilters.some((f) => f.field === field);

  const visibleDefs = useMemo(() => {
    const map = new Map(applicableColumns.map((c) => [c.id, c]));
    return visibleColumnIds.map((id) => map.get(id)).filter(Boolean);
  }, [applicableColumns, visibleColumnIds]);

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
              onClick={
                col.sortKey || col.columnFilterOnly ? () => onColumnHeaderClick?.(col) : undefined
              }
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

          <TableHeaderCell width="120px" align="center" className={`${leadTableStyles.stickyLast} ${leadTableStyles.actionsTh}`}>
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
        {rows.map((r) => {
          const rowHelpers = { formatWhen, notesPreview };
          const rowData = {
            ...r,
            __viewAttempt: onViewAttempt ? () => onViewAttempt(r) : undefined,
            __openDialSession: onOpenDialSession ? () => onOpenDialSession(r) : undefined,
          };
          return (
            <TableRow key={r.id}>
              <TableCell align="center" className={leadTableStyles.stickyFirst}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(String(r.id))}
                  onChange={() => onToggleSelect?.(r.id)}
                  aria-label="Select this call row"
                />
              </TableCell>

              {visibleDefs.map((col) => (
                <TableCell key={col.id} noTruncate={col.id === 'notes'}>
                  {renderCell(col, rowData, rowHelpers)}
                </TableCell>
              ))}

              <TableCell align="center" className={`${leadTableStyles.stickyLast} ${leadTableStyles.actionsTd}`}>
                {onViewAttempt ? (
                  <IconButton
                    size="sm"
                    title="View call details"
                    onClick={() => onViewAttempt(r)}
                  >
                    <ViewIcon />
                  </IconButton>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
