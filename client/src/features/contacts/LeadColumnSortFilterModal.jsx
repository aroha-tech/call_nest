import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import styles from './LeadColumnSortFilterModal.module.scss';

const FILTER_OPS = [
  { value: 'none', label: 'No filter on this column' },
  { value: 'empty', label: 'Is empty' },
  { value: 'not_empty', label: 'Is not empty' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
];

const FILTER_SELECT_OPTIONS = FILTER_OPS.map(({ value, label }) => ({ value, label }));

/** Human-readable sort copy for the active column (server uses same keys). */
function getSortCopy(sortKey) {
  if (!sortKey) {
    return {
      defaultLabel: 'Use list default',
      defaultHint: 'Clears sort for this column. Order: newest records first.',
      ascLabel: 'Ascending',
      ascHint: 'Lower values first',
      descLabel: 'Descending',
      descHint: 'Higher values first',
    };
  }
  if (sortKey === 'created_at') {
    return {
      defaultLabel: 'List default',
      defaultHint: 'Newest by call date (recommended).',
      ascLabel: 'Oldest first',
      ascHint: 'Earliest call date at the top',
      descLabel: 'Newest first',
      descHint: 'Latest call date at the top',
    };
  }
  if (sortKey === 'date_of_birth') {
    return {
      defaultLabel: 'List default',
      defaultHint: 'Newest records first (ignores this column for order).',
      ascLabel: 'Birth date: earliest → latest',
      ascHint: 'Oldest birthdays first',
      descLabel: 'Birth date: latest → earliest',
      descHint: 'Youngest first',
    };
  }
  if (sortKey === 'contact_id') {
    return {
      defaultLabel: 'List default',
      defaultHint: 'Newest attempts first; customer order is secondary.',
      ascLabel: 'Customer order (ascending)',
      ascHint: 'Follows saved lead/contact record order',
      descLabel: 'Customer order (descending)',
      descHint: 'Reverses lead/contact record order',
    };
  }
  if (sortKey === 'notes') {
    return {
      defaultLabel: 'List default',
      defaultHint: 'Newest attempts first; notes column does not control order.',
      ascLabel: 'Ascending (notes)',
      ascHint: 'Lexicographic on raw notes text',
      descLabel: 'Descending (notes)',
      descHint: 'Reverse lexicographic on notes',
    };
  }
  if (sortKey === 'dial_session') {
    return {
      defaultLabel: 'List default',
      defaultHint: 'Newest attempts first; dial session # is secondary.',
      ascLabel: 'Dial session # low → high',
      ascHint: 'Smaller per-user session numbers first (unlinked last)',
      descLabel: 'Dial session # high → low',
      descHint: 'Larger session numbers first',
    };
  }
  return {
    defaultLabel: 'List default',
    defaultHint: 'Newest records first; this column does not control order.',
    ascLabel: 'Ascending',
    ascHint: 'A→Z, 0→9, symbols first where applicable',
    descLabel: 'Descending',
    descHint: 'Z→A, 9→0',
  };
}

function filterPlaceholderForColumn(sortKey) {
  const map = {
    email: 'e.g. @gmail.com or partial address',
    primary_phone: 'Digits or partial number',
    blacklist_status: 'blocked, active, yes, no',
    tag_names: 'Tag name or part of it',
    status_name: 'Status name (e.g. New, Contacted)',
    campaign_name: 'Campaign name',
    manager_name: 'Manager name',
    assigned_user_name: 'Agent name',
    company: 'Company name',
    website: 'Domain or URL fragment',
    city: 'City name',
    state: 'State or region',
    country: 'Country',
    source: 'Source text',
    contact_id: 'Customer name or part of it',
    phone: 'Digits or partial phone number',
    agent: 'Agent display name',
    disposition: 'Disposition name (e.g. Busy, Interested)',
    direction: 'inbound or outbound',
    status: 'queued, ringing, connected, completed, …',
    is_connected: '0 or 1, or text Connected',
    notes: 'Words in call notes',
    id: 'Numeric value (advanced)',
    duration_sec: 'Seconds (e.g. 120)',
    started_at: 'Date/time fragment',
    ended_at: 'Date/time fragment',
    provider: 'Provider id (e.g. dummy)',
    dial_session: 'Session number (e.g. 3)',
  };
  return map[sortKey] || 'Text to match';
}

export function LeadColumnSortFilterModal({
  isOpen,
  onClose,
  column,
  sortBy,
  sortDir,
  filterRule,
  onApply,
  /** When true, only column filter applies (e.g. industry JSON fields — no list sort). */
  filterOnly = false,
  /** Overrides default “…leads list” subtitle (e.g. call history). */
  modalSubtitle,
}) {
  const [sortMode, setSortMode] = useState('default');
  const [filterOp, setFilterOp] = useState('none');
  const [filterValue, setFilterValue] = useState('');
  const [applyError, setApplyError] = useState(null);

  const sortKey = column?.sortKey;
  const sortCopy = useMemo(() => getSortCopy(sortKey), [sortKey]);

  useEffect(() => {
    if (!isOpen || !column || !sortKey) return;
    setApplyError(null);
    if (filterOnly) {
      setSortMode('default');
    } else if (sortBy === sortKey) {
      setSortMode(sortDir === 'asc' ? 'asc' : 'desc');
    } else {
      setSortMode('default');
    }
    const fr = filterRule && filterRule.field === column.id ? filterRule : null;
    if (fr && fr.op) {
      setFilterOp(fr.op);
      setFilterValue(fr.value || '');
    } else {
      setFilterOp('none');
      setFilterValue('');
    }
  }, [isOpen, column, sortBy, sortDir, sortKey, filterRule, filterOnly]);

  const needsValue = useMemo(
    () => ['contains', 'not_contains', 'starts_with', 'ends_with'].includes(filterOp),
    [filterOp]
  );

  const activeFilterSummary = useMemo(() => {
    if (!column || !filterRule || filterRule.field !== column.id || !filterRule.op || filterRule.op === 'none') {
      return null;
    }
    const op = FILTER_OPS.find((o) => o.value === filterRule.op);
    const v = filterRule.value ? ` “${String(filterRule.value).slice(0, 40)}${String(filterRule.value).length > 40 ? '…' : ''}”` : '';
    return `Filter: ${op?.label || filterRule.op}${v}`;
  }, [column, filterRule]);

  const handleApply = () => {
    setApplyError(null);
    if (!column || !sortKey) return;
    let sort = 'default';
    if (!filterOnly) {
      if (sortMode === 'asc') sort = 'asc';
      else if (sortMode === 'desc') sort = 'desc';
    }

    let filter = null;
    if (filterOp && filterOp !== 'none') {
      if (needsValue && !String(filterValue).trim()) {
        setApplyError('Enter a value for this condition, or choose “No filter”.');
        return;
      }
      filter = { op: filterOp, value: needsValue ? String(filterValue).trim() : '' };
    }

    onApply({ sort, filter });
    onClose();
  };

  const handleResetColumn = () => {
    setApplyError(null);
    if (!column || !sortKey) return;
    onApply({ sort: 'default', filter: null });
    onClose();
  };

  if (!column || !sortKey) return null;

  const hasColumnSort = !filterOnly && sortBy === sortKey;
  const showStatusBanner = hasColumnSort || !!activeFilterSummary;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={column.label}
      size="lg"
      closeOnEscape
      footer={
        <ModalFooter className={styles.footerRow}>
          <Button type="button" variant="ghost" size="sm" className={styles.footerReset} onClick={handleResetColumn}>
            Reset column
          </Button>
          <div className={styles.footerActions}>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </ModalFooter>
      }
    >
      <p className={styles.modalSubtitle}>
        {filterOnly
          ? 'Filter this column for the current list.'
          : modalSubtitle || 'Sort and filter this column for the current leads list.'}
      </p>

      {showStatusBanner ? (
        <div className={styles.statusBanner} role="status">
          {hasColumnSort ? (
            <span className={styles.statusLine}>
              {sortDir === 'asc' ? `Sorted: ${sortCopy.ascLabel}` : `Sorted: ${sortCopy.descLabel}`}
            </span>
          ) : null}
          {activeFilterSummary ? <span className={styles.statusLine}>{activeFilterSummary}</span> : null}
        </div>
      ) : null}

      <div className={styles.panels}>
        {!filterOnly ? (
        <section className={styles.panel} aria-labelledby="lead-col-sort-heading">
          <div className={styles.panelHead}>
            <span className={styles.panelIcon} aria-hidden>
              ↕
            </span>
            <div>
              <h3 id="lead-col-sort-heading" className={styles.panelTitle}>
                Sort
              </h3>
              <p className={styles.panelHint}>Applies to the whole list (server-side). One column controls order at a time.</p>
            </div>
          </div>
          <div className={styles.radioCards}>
            <label className={`${styles.radioCard} ${sortMode === 'default' ? styles.radioCardActive : ''}`}>
              <input
                type="radio"
                name="leadColSort"
                checked={sortMode === 'default'}
                onChange={() => setSortMode('default')}
              />
              <span className={styles.radioCardBody}>
                <span className={styles.radioCardTitle}>{sortCopy.defaultLabel}</span>
                <span className={styles.radioCardMeta}>{sortCopy.defaultHint}</span>
              </span>
            </label>
            <label className={`${styles.radioCard} ${sortMode === 'asc' ? styles.radioCardActive : ''}`}>
              <input
                type="radio"
                name="leadColSort"
                checked={sortMode === 'asc'}
                onChange={() => setSortMode('asc')}
              />
              <span className={styles.radioCardBody}>
                <span className={styles.radioCardTitle}>{sortCopy.ascLabel}</span>
                <span className={styles.radioCardMeta}>{sortCopy.ascHint}</span>
              </span>
            </label>
            <label className={`${styles.radioCard} ${sortMode === 'desc' ? styles.radioCardActive : ''}`}>
              <input
                type="radio"
                name="leadColSort"
                checked={sortMode === 'desc'}
                onChange={() => setSortMode('desc')}
              />
              <span className={styles.radioCardBody}>
                <span className={styles.radioCardTitle}>{sortCopy.descLabel}</span>
                <span className={styles.radioCardMeta}>{sortCopy.descHint}</span>
              </span>
            </label>
          </div>
        </section>
        ) : null}

        <section className={styles.panel} aria-labelledby="lead-col-filter-heading">
          <div className={styles.panelHead}>
            <span className={styles.panelIcon} aria-hidden>
              ◇
            </span>
            <div>
              <h3 id="lead-col-filter-heading" className={styles.panelTitle}>
                Filter
              </h3>
              <p className={styles.panelHint}>
                Keeps rows where this column matches the rule. Combines with search and other column filters.
              </p>
            </div>
          </div>

          <div className={styles.filterFields}>
            <Select
              id="leadColFilterOp"
              label="Condition"
              value={filterOp}
              onChange={(e) => {
                setFilterOp(e.target.value);
                setApplyError(null);
              }}
              options={FILTER_SELECT_OPTIONS}
              placeholder="Choose…"
            />
            {needsValue ? (
              <Input
                label="Value"
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setApplyError(null);
                }}
                placeholder={filterPlaceholderForColumn(sortKey)}
                maxLength={200}
                error={applyError}
                hint={`Matches against “${column.label}”. Max 200 characters.`}
              />
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  );
}
