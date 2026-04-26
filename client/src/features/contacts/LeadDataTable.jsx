import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, TrashIcon, ViewIcon, BlacklistIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import { Button } from '../../components/ui/Button';

import styles from './LeadDataTable.module.scss';
import { parseCustomFieldColumnId } from './customFieldColumnIds';
import { parseIndustryFieldColumnId } from './industryFieldColumnIds';
import { IconPhone } from './ListActionsMenuIcons';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';

const ACTION_MENU_MIN_W = 160;

function LeadRowActionsMenu({
  useMenu,
  onView,
  canUpdate,
  canDelete,
  canBlacklist,
  onEdit,
  onDelete,
  onBlacklistRecord,
  scrollContainerRef,
}) {
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
        {onView && (
          <IconButton size="sm" title="View" onClick={onView}>
            <ViewIcon />
          </IconButton>
        )}
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
        {canBlacklist && (
          <IconButton size="sm" title="Add to blacklist" onClick={onBlacklistRecord}>
            <BlacklistIcon />
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
            {onView ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.actionMenuItem}
                  onClick={() => {
                    onView();
                    setOpen(false);
                  }}
                >
                  View
                </button>
              </li>
            ) : null}
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
            {canBlacklist ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.actionMenuItem} ${styles.actionMenuItemWithIcon}`}
                  onClick={() => {
                    onBlacklistRecord?.();
                    setOpen(false);
                  }}
                >
                  <BlacklistIcon />
                  Add to blacklist
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
  showSelection,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllOnPage,
  sortBy,
  sortDir,
  onColumnHeaderClick,
  onOpenCustomizeColumns,
  useCompactRowActions,
  onView,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onBlacklist,
  tableScrollContainerRef,
  showDialerCall = false,
  onDialerCall,
  displayNameLinkTo,
}) {
  const { formatDateTime, formatDate } = useDateTimeDisplay();
  const selectionEnabled = showSelection ?? canBulkAssign;
  const visibleDefs = useMemo(() => {
    const map = new Map(applicableColumns.map((c) => [c.id, c]));
    return visibleColumnIds.map((id) => map.get(id)).filter(Boolean);
  }, [applicableColumns, visibleColumnIds]);

  const hasFilter = (field) => columnFilters.some((f) => f.field === field);

  const renderCell = (col, c) => {
    const indKey = parseIndustryFieldColumnId(col.id);
    if (indKey != null) {
      const prof = c.industry_profile;
      const raw = prof && typeof prof === 'object' && !Array.isArray(prof) ? prof[indKey] : null;
      if (raw === null || raw === undefined || raw === '') return '—';
      if (col.industryFieldType === 'boolean') {
        const s = String(raw).toLowerCase();
        if (s === '1' || s === 'true' || s === 'yes') return 'Yes';
        if (s === '0' || s === 'false' || s === 'no') return 'No';
      }
      if (Array.isArray(raw)) return raw.join(', ');
      if (typeof raw === 'object') return JSON.stringify(raw);
      return String(raw);
    }

    const cfId = parseCustomFieldColumnId(col.id);
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
      case 'display_name': {
        const text = c.display_name || c.first_name || c.email || '—';
        if (text === '—' || !displayNameLinkTo) return text;
        const to = displayNameLinkTo(c);
        if (!to) return text;
        return (
          <Link
            to={to}
            className={`${styles.displayNameLink} ${c.is_blacklisted_contact ? styles.blacklistTextStrong : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {text}
          </Link>
        );
      }
      case 'primary_phone':
        return (
          <span className={c.has_blacklisted_number ? styles.blacklistTextStrong : ''}>
            {c.primary_phone || '—'}
            {c.has_blacklisted_number ? <span className={styles.blockedPill}>Blocked</span> : null}
          </span>
        );
      case 'blacklist_status': {
        const contactBlocked = !!c.is_blacklisted_contact;
        const numberBlocked = !!c.has_blacklisted_number;
        if (contactBlocked && numberBlocked) return <span className={styles.blacklistTextStrong}>Contact + number</span>;
        if (contactBlocked) return <span className={styles.blacklistTextStrong}>Contact blocked</span>;
        if (numberBlocked) return <span className={styles.blacklistTextStrong}>Number blocked</span>;
        return 'Active';
      }
      case 'email':
        return c.email || '—';
      case 'tag_names':
        return c.tag_names || '—';
      case 'status_name':
        return c.status_name || '—';
      case 'campaign_name':
        return c.campaign_name || '—';
      case 'type':
        return c.type;
      case 'manager_name':
        return c.manager_name || '—';
      case 'assigned_user_name':
        return c.assigned_user_name || '—';
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
        return formatDate(c.date_of_birth);
      case 'created_at':
        return formatDateTime(c.created_at);
      case 'call_count_total':
        return c.call_count_total == null ? '0' : String(c.call_count_total);
      case 'last_called_at':
        return formatDateTime(c.last_called_at);
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
          {selectionEnabled ? (
            <TableHeaderCell width="44px" align="center" className={styles.stickyFirst}>
              <input
                type="checkbox"
                aria-label="Select all on page"
                checked={contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))}
                onChange={onToggleSelectAllOnPage}
              />
            </TableHeaderCell>
          ) : null}
          {showDialerCall ? (
            <TableHeaderCell width="72px" align="center" className={styles.callColumnTh}>
              <span className={styles.callColHeader} title="Call" aria-hidden>
                <IconPhone width={16} height={16} />
              </span>
              <span className={styles.callColHeaderSr}>Call</span>
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
                {col.sortKey && !col.columnFilterOnly && sortBy === col.sortKey ? (
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
            {selectionEnabled ? (
              <TableCell align="center" className={styles.stickyFirst}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  aria-label={`Select ${c.display_name || 'row'}`}
                />
              </TableCell>
            ) : null}
            {showDialerCall ? (
              <TableCell align="center">
                <Button
                  size="sm"
                  variant="secondary"
                  className={styles.dialCallBtn}
                  onClick={() => onDialerCall?.(c)}
                  disabled={!onDialerCall}
                  aria-label={`Call ${c.display_name?.trim() || 'lead'}`}
                >
                  <IconPhone className={styles.dialCallIcon} width={18} height={18} aria-hidden />
                </Button>
              </TableCell>
            ) : null}
            {visibleDefs.map((col) => (
              <TableCell key={col.id}>{renderCell(col, c)}</TableCell>
            ))}
            <TableCell align="center" className={`${styles.stickyLast} ${styles.actionsTd}`}>
              <LeadRowActionsMenu
                useMenu={useCompactRowActions}
                onView={onView ? () => onView(c) : undefined}
                canUpdate={canUpdate}
                canDelete={canDelete}
                canBlacklist={!!onBlacklist}
                onEdit={() => onEdit(c)}
                onDelete={() => onDelete(c)}
                onBlacklistRecord={() => onBlacklist?.(c, 'record')}
                scrollContainerRef={tableScrollContainerRef}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
