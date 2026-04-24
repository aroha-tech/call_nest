import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { ViewIcon } from '../components/ui/ActionIcons';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { buildAttemptHistoryEntries } from '../utils/callAttemptNotesDisplay';
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

function formatCallHistoryTimelineLine(row, entry, formatWhen) {
  const whenIso = entry.whenIso || row.ended_at || row.started_at || row.created_at;
  const datePart = formatWhen?.(whenIso) ?? '—';
  const agent = String(row.agent_name || '—').trim() || '—';
  const phone = String(row.phone_e164 || '—').trim() || '—';
  const text = String(entry.text || '—').trim() || '—';
  return `-- ${datePart} by ${agent} -- ${phone} -- ${text}`;
}

function renderCell(col, r, { formatWhen, expandedNoteIds, toggleNoteExpand }) {
  switch (col.id) {
    case 'created_at':
      return formatWhen?.(r.created_at) ?? r.created_at ?? '—';
    case 'contact': {
      const cid = r.contact_id != null ? Number(r.contact_id) : NaN;
      const t = String(r.contact_type || '').toLowerCase();
      const customerHref = Number.isFinite(cid) && cid > 0 ? (t === 'lead' ? `/leads/${cid}?mode=view` : `/contacts/${cid}?mode=view`) : '';
      if (customerHref) {
        return (
          <Link to={customerHref} className={styles.linkAnchor} onClick={(e) => e.stopPropagation()}>
            {r.display_name || '—'}
          </Link>
        );
      }
      return r.display_name || '—';
    }
    case 'phone':
      return r.phone_e164 || '—';
    case 'agent':
      return r.agent_name || '—';
    case 'dial_session': {
      const sid = r.dialer_session_id;
      const no = r.dialer_user_session_no;
      if (!sid && (no == null || no === '')) return '—';
      const label = no != null && no !== '' ? `Session #${no}` : 'Dial session';
      if (!sid) return label;
      return (
        <Link
          to={`/dialer/session/${sid}`}
          state={r.__dialSessionState}
          className={styles.linkAnchor}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Link>
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
    case 'call_notes': {
      const entries = buildAttemptHistoryEntries(r);
      const hasTimeline = entries.length > 0;
      const rid = String(r.id);
      const open = expandedNoteIds?.has(rid);
      return (
        <div className={styles.callNotesCellInner}>
          <button
            type="button"
            className={`${styles.expandNotesBtn} ${open ? styles.expandNotesBtnOpen : ''}`.trim()}
            disabled={!hasTimeline}
            aria-expanded={hasTimeline ? Boolean(open) : undefined}
            aria-label={
              !hasTimeline ? 'No notes for this attempt' : open ? 'Hide notes timeline' : 'Show notes timeline'
            }
            onClick={() => hasTimeline && toggleNoteExpand?.(r.id)}
          >
            <MaterialSymbol name={open ? 'remove' : 'add'} size="sm" className={styles.expandNotesGlyph} />
          </button>
        </div>
      );
    }
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
  /** Navigate to CRM contact/lead view (dialer-style); customer name uses this when contact_id is set. */
  onOpenCustomer,
  onOpenDialSession,
  dialSessionNavigateState,
  formatWhen,
  columnFilters = [],
}) {
  const selectedSet = selectedIds || new Set();
  const [expandedNoteIds, setExpandedNoteIds] = useState(() => new Set());

  const rowIdsKey = useMemo(() => rows.map((r) => r.id).join(','), [rows]);
  useEffect(() => {
    setExpandedNoteIds(new Set());
  }, [rowIdsKey]);

  const toggleNoteExpand = useCallback((attemptId) => {
    const k = String(attemptId);
    setExpandedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

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
      tableClassName={`${leadTableStyles.leadTable} ${styles.callHistoryTableGrid}`.trim()}
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
          const rowHelpers = { formatWhen, expandedNoteIds, toggleNoteExpand };
          const rowData = {
            ...r,
            __viewAttempt: onViewAttempt ? () => onViewAttempt(r) : undefined,
            __openCustomer: onOpenCustomer ? (row) => onOpenCustomer(row) : undefined,
            __openDialSession: onOpenDialSession ? () => onOpenDialSession(r) : undefined,
            __dialSessionState: dialSessionNavigateState,
          };
          const timelineEntries = buildAttemptHistoryEntries(r);
          const notesOpen = expandedNoteIds.has(String(r.id));
          const showTimeline = notesOpen && timelineEntries.length > 0;
          const colSpan = 1 + visibleDefs.length + 1;

          return (
            <React.Fragment key={r.id}>
              <TableRow>
                <TableCell align="center" className={leadTableStyles.stickyFirst}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(String(r.id))}
                    onChange={() => onToggleSelect?.(r.id)}
                    aria-label="Select this call row"
                  />
                </TableCell>

                {visibleDefs.map((col) => (
                  <TableCell key={col.id} noTruncate={col.id === 'call_notes'}>
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
              {showTimeline ? (
                <TableRow className={styles.notesTimelineRow} aria-label="Notes timeline">
                  <TableCell
                    colSpan={colSpan}
                    align="left"
                    noTruncate
                    className={styles.notesTimelineCell}
                  >
                    <div className={styles.notesTimelineInner}>
                      <p className={styles.notesTimelineTitle}>Notes</p>
                      <ul className={styles.notesTimelineList}>
                        {timelineEntries.map((entry) => (
                          <li key={entry.key}>
                            <p className={styles.notesTimelineLine}>
                              {formatCallHistoryTimelineLine(r, entry, formatWhen)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
