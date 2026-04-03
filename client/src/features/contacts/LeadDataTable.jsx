import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, TrashIcon, RowActionGroup } from '../../components/ui/ActionIcons';

import styles from './LeadDataTable.module.scss';
import { parseLeadCustomFieldColumnId } from './leadTableConfig';

const ACTION_MENU_MIN_W = 160;

function LeadRowActionsMenu({ useMenu, canUpdate, canDelete, onEdit, onDelete, scrollContainerRef }) {
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
    setMenuPos({
      top: rect.bottom + 4,
      left,
    });
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
    if (scrollEl) {
      scrollEl.addEventListener('scroll', onScrollOrResize, { passive: true });
    }
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', onScrollOrResize);
      }
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

  if (!useMenu) {
    return (
      <RowActionGroup className={styles.actionsRowGroup}>
        {canUpdate && (
          <IconButton size="sm" title="Edit" onClick={onEdit}>
            <EditIcon />
          </IconButton>
        )}
        {canDelete && (
          <IconButton size="sm" variant="danger" title="Delete" onClick={onDelete}>
            <TrashIcon />
          </IconButton>
        )}
      </RowActionGroup>
    );
  }

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            className={styles.actionMenu}
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            {canUpdate ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.actionMenuItem}
                  onClick={() => {
                    onEdit();
                    setOpen(false);
                  }}
                >
                  Edit
                </button>
              </li>
            ) : null}
            {canDelete ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.actionMenuItemDanger}
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                >
                  Delete
                </button>
              </li>
            ) : null}
          </ul>,
          document.body
        )
      : null;

  return (
    <div className={styles.actionMenuWrap} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={styles.moreBtn}
        aria-label="Row actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.moreDotsRow} aria-hidden>
          <span className={styles.moreDot} />
          <span className={styles.moreDot} />
          <span className={styles.moreDot} />
        </span>
      </button>
      {menu}
    </div>
  );
}

/**
 * Leads list table: optional sticky checkbox column; sticky Actions; column header opens sort/filter.
 */
export function LeadDataTable({
  contacts,
  applicableColumns,
  visibleColumnIds,
  columnFilters,
  canBulkAssign,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllOnPage,
  sortBy,
  sortDir,
  onColumnHeaderClick,
  onOpenCustomizeColumns,
  useCompactRowActions,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  tableScrollContainerRef,
}) {
  const visibleDefs = useMemo(() => {
    const map = new Map(applicableColumns.map((c) => [c.id, c]));
    return visibleColumnIds.map((id) => map.get(id)).filter(Boolean);
  }, [applicableColumns, visibleColumnIds]);

  const hasFilter = (field) => columnFilters.some((f) => f.field === field);

  const formatCreated = (v) => {
    if (!v) return '—';
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  };

  const formatDateOnly = (v) => {
    if (!v) return '—';
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch {
      return '—';
    }
  };

  const renderCell = (col, c) => {
    const cfId = parseLeadCustomFieldColumnId(col.id);
    if (cfId != null) {
      const map = c.custom_field_values || {};
      const raw = map[String(cfId)];
      if (raw === null || raw === undefined || raw === '') return '—';
      if (col.customFieldType === 'boolean') {
        const s = String(raw).toLowerCase();
        if (s === '1' || s === 'true' || s === 'yes') return 'Yes';
        if (s === '0' || s === 'false' || s === 'no') return 'No';
      }
      return String(raw);
    }

    switch (col.id) {
      case 'display_name':
        return c.display_name || c.first_name || c.email || '—';
      case 'primary_phone':
        return c.primary_phone || '—';
      case 'email':
        return c.email || '—';
      case 'tag_names':
        return c.tag_names || '—';
      case 'campaign_name':
        return c.campaign_name || '—';
      case 'type':
        return c.type;
      case 'manager_name':
        return c.manager_name || (c.manager_id != null ? `#${c.manager_id}` : '—');
      case 'assigned_user_name':
        return c.assigned_user_name || (c.assigned_user_id != null ? `#${c.assigned_user_id}` : '—');
      case 'source':
        return c.source || '—';
      case 'city':
        return c.city || '—';
      case 'company':
        return c.company || '—';
      case 'website':
        return c.website || '—';
      case 'job_title':
        return c.job_title || '—';
      case 'industry':
        return c.industry || '—';
      case 'state':
        return c.state || '—';
      case 'country':
        return c.country || '—';
      case 'pin_code':
        return c.pin_code || '—';
      case 'address':
        return c.address || '—';
      case 'address_line_2':
        return c.address_line_2 || '—';
      case 'tax_id':
        return c.tax_id || '—';
      case 'date_of_birth':
        return formatDateOnly(c.date_of_birth);
      case 'created_at':
        return formatCreated(c.created_at);
      default:
        return '—';
    }
  };

  return (
    <Table
      variant="adminList"
      className={`${styles.leadTableOuter} ${useCompactRowActions ? styles.leadTableCompactActions : ''}`.trim()}
      tableClassName={styles.leadTable}
    >
      <TableHead>
        <TableRow>
          {canBulkAssign ? (
            <TableHeaderCell width="44px" align="center" className={styles.stickyFirst}>
              <input
                type="checkbox"
                aria-label="Select all on page"
                checked={contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))}
                onChange={onToggleSelectAllOnPage}
              />
            </TableHeaderCell>
          ) : null}
          {visibleDefs.map((col) => (
            <TableHeaderCell
              key={col.id}
              sortable={false}
              onClick={col.sortKey ? () => onColumnHeaderClick(col) : undefined}
            >
              <span className={styles.headerInner}>
                <span>{col.label}</span>
                {col.sortKey && sortBy === col.sortKey ? (
                  <span className={styles.sortMark} aria-hidden>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                ) : null}
                {col.sortKey && hasFilter(col.id) ? (
                  <span className={styles.filterMark} title="Filter active" aria-label="Filter active" />
                ) : null}
              </span>
            </TableHeaderCell>
          ))}
          <TableHeaderCell
            width={useCompactRowActions ? '40px' : '120px'}
            align="center"
            className={`${styles.stickyLast} ${styles.actionsTh}`}
          >
            <div
              className={`${styles.actionsHead} ${useCompactRowActions ? styles.actionsHeadCompact : ''}`.trim()}
            >
              {useCompactRowActions ? (
                <span className={styles.actionsSrOnly}>Actions</span>
              ) : (
                <span className={styles.actionsHeadLabel}>Actions</span>
              )}
              <button
                type="button"
                className={styles.gearBtn}
                aria-label="Customize columns"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomizeColumns();
                }}
              >
                <span className={styles.gearIcon} aria-hidden>
                  ⚙
                </span>
              </button>
            </div>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {contacts.map((c) => (
          <TableRow key={c.id}>
            {canBulkAssign ? (
              <TableCell align="center" className={styles.stickyFirst}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  aria-label={`Select ${c.display_name || c.id}`}
                />
              </TableCell>
            ) : null}
            {visibleDefs.map((col) => (
              <TableCell key={col.id}>{renderCell(col, c)}</TableCell>
            ))}
            <TableCell align="center" className={`${styles.stickyLast} ${styles.actionsTd}`}>
              <LeadRowActionsMenu
                useMenu={useCompactRowActions}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={() => onEdit(c)}
                onDelete={() => onDelete(c)}
                scrollContainerRef={tableScrollContainerRef}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
