import React, { useMemo } from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import styles from './CallHistoryDataTable.module.scss';

function sortToggle(nextKey, sortBy, sortDir) {
  if (sortBy !== nextKey) return { sortBy: nextKey, sortDir: 'desc' };
  if (sortDir === 'desc') return { sortBy: nextKey, sortDir: 'asc' };
  return { sortBy: '', sortDir: 'desc' };
}

export function CallHistoryDataTable({
  rows = [],
  selectedIds,
  onToggleSelect,
  onToggleSelectAllOnPage,
  allOnPageSelected,
  sortBy,
  sortDir,
  onSortChange,
  onOpenContact,
  formatWhen,
  notesPreview,
}) {
  const selectedSet = selectedIds || new Set();

  const headerSort = (key) => {
    const next = sortToggle(key, sortBy, sortDir);
    onSortChange?.(next);
  };

  const sortedFlag = (key) => (sortBy === key ? (sortDir === 'asc' ? 'asc' : 'desc') : undefined);

  const hasRows = rows.length > 0;
  const idsOnPage = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const allChecked = hasRows ? allOnPageSelected : false;

  return (
    <Table
      variant="adminList"
      className={styles.tableOuter}
      tableClassName={styles.table}
      flexibleLastColumn
    >
      <TableHead>
        <TableRow>
          <TableHeaderCell width="44px" noTruncate>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onToggleSelectAllOnPage?.(idsOnPage)}
              aria-label="Select all on page"
            />
          </TableHeaderCell>

          <TableHeaderCell sortable sorted={sortedFlag('created_at')} onSort={() => headerSort('created_at')}>
            When
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('id')} onSort={() => headerSort('id')}>
            Attempt
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('contact_id')} onSort={() => headerSort('contact_id')}>
            Contact
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('phone')} onSort={() => headerSort('phone')}>
            Phone
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('agent')} onSort={() => headerSort('agent')}>
            Agent
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('direction')} onSort={() => headerSort('direction')}>
            Direction
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('status')} onSort={() => headerSort('status')}>
            Status
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('is_connected')} onSort={() => headerSort('is_connected')}>
            Connectivity
          </TableHeaderCell>
          <TableHeaderCell sortable sorted={sortedFlag('disposition')} onSort={() => headerSort('disposition')}>
            Disposition
          </TableHeaderCell>
          <TableHeaderCell>Notes</TableHeaderCell>
        </TableRow>
      </TableHead>

      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell width="44px" noTruncate>
              <input
                type="checkbox"
                checked={selectedSet.has(String(r.id))}
                onChange={() => onToggleSelect?.(r.id)}
                aria-label={`Select attempt ${r.id}`}
              />
            </TableCell>
            <TableCell>{formatWhen?.(r.created_at) ?? r.created_at}</TableCell>
            <TableCell>#{r.id}</TableCell>
            <TableCell>
              <button type="button" className={styles.linkBtn} onClick={() => onOpenContact?.(r)}>
                {r.display_name || `Contact #${r.contact_id}`}
              </button>
            </TableCell>
            <TableCell>{r.phone_e164 || '—'}</TableCell>
            <TableCell>{r.agent_name || (r.agent_user_id ? `#${r.agent_user_id}` : '—')}</TableCell>
            <TableCell>
              <Badge variant="muted" size="sm">
                {r.direction || '—'}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="default" size="sm">
                {r.status || '—'}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={Number(r.is_connected) === 1 ? 'success' : 'warning'} size="sm">
                {Number(r.is_connected) === 1 ? 'Connected' : 'Not connected'}
              </Badge>
            </TableCell>
            <TableCell>{r.disposition_name || '—'}</TableCell>
            <TableCell className={styles.notesCell}>{notesPreview?.(r) ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

