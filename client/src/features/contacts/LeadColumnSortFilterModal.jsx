import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { InfoHelpIcon } from '../../components/ui/InfoHelpIcon';
import {
  FILTER_VALUE_TYPE,
  OPERATOR_LABELS,
  coerceOperatorForValueType,
  formatOperatorLabel,
  getColumnFilterValueType,
  getOperatorOptionsForValueType,
  ruleNeedsFilterValue,
  ruleNeedsSecondFilterValue,
} from '../../utils/columnFilterOperators';
import styles from './LeadColumnSortFilterModal.module.scss';

function IconSortArrows() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 5v14M8 5l-3 3M8 5l3 3M16 19V5m0 14-3-3m3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFilterFunnel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16l-6.5 7.1v4.7l-3 1.7v-6.4L4 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTitleTag({ kind }) {
  if (kind === 'campaign') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 10.5V6.8A1.8 1.8 0 0 1 4.8 5h10.4A1.8 1.8 0 0 1 17 6.8V9l4 2.5v1L17 15v2.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2v-3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'status') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 12.2 10.8 14.5 15.8 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'manager') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="8.5" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 18.5c.7-2.2 2.7-3.5 5-3.5s4.3 1.3 5 3.5M16 8h4M18 6v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'agent') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 19c1-2.8 3.5-4.5 7-4.5s6 1.7 7 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'tag') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 4H6.8A1.8 1.8 0 0 0 5 5.8V11l7 7 7-7-7-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="9" cy="8.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function getTitleKind(column) {
  const raw = `${column?.id || ''} ${column?.label || ''} ${column?.sortKey || ''}`.toLowerCase();
  if (raw.includes('campaign')) return 'campaign';
  if (raw.includes('status')) return 'status';
  if (raw.includes('manager')) return 'manager';
  if (raw.includes('agent') || raw.includes('assigned_user')) return 'agent';
  if (raw.includes('tag')) return 'tag';
  return 'column';
}

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

function filterPlaceholderForColumn(sortKey, valueType) {
  if (valueType === FILTER_VALUE_TYPE.DATE) return 'Select date';
  if (valueType === FILTER_VALUE_TYPE.NUMBER) return 'Enter number';
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

function columnFilterMeta(column) {
  return {
    customFieldType: column?.customFieldType,
    industryFieldType: column?.industryFieldType,
  };
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
  const [filterValue2, setFilterValue2] = useState('');
  const [applyError, setApplyError] = useState(null);

  const sortKey = column?.sortKey;
  const sortCopy = useMemo(() => getSortCopy(sortKey), [sortKey]);

  const columnValueType = useMemo(
    () => getColumnFilterValueType(sortKey, columnFilterMeta(column)),
    [sortKey, column]
  );

  const filterSelectOptions = useMemo(
    () => [
      { value: 'none', label: OPERATOR_LABELS.none },
      ...getOperatorOptionsForValueType(columnValueType),
    ],
    [columnValueType]
  );

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
      setFilterOp(coerceOperatorForValueType(fr.op, columnValueType));
      setFilterValue(fr.value || '');
      setFilterValue2(fr.value2 || '');
    } else {
      setFilterOp('none');
      setFilterValue('');
      setFilterValue2('');
    }
  }, [isOpen, column, sortBy, sortDir, sortKey, filterRule, filterOnly, columnValueType]);

  const needsValue = useMemo(
    () => filterOp !== 'none' && ruleNeedsFilterValue(filterOp),
    [filterOp]
  );

  const needsSecond = useMemo(() => ruleNeedsSecondFilterValue(filterOp), [filterOp]);

  const activeFilterSummary = useMemo(() => {
    if (!column || !filterRule || filterRule.field !== column.id || !filterRule.op || filterRule.op === 'none') {
      return null;
    }
    const v = filterRule.value
      ? ` “${String(filterRule.value).slice(0, 40)}${String(filterRule.value).length > 40 ? '…' : ''}”`
      : '';
    const v2 = filterRule.value2
      ? ` – “${String(filterRule.value2).slice(0, 40)}${String(filterRule.value2).length > 40 ? '…' : ''}”`
      : '';
    return `Filter: ${formatOperatorLabel(filterRule.op)}${v}${v2}`;
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
      const v1 = String(filterValue).trim();
      const v2 = String(filterValue2).trim();
      if (needsValue && !v1) {
        setApplyError('Enter a value for this condition, or choose “No filter”.');
        return;
      }
      if (needsSecond && !v2) {
        setApplyError('Enter the end value for “Between”, or choose a different condition.');
        return;
      }
      filter = {
        op: filterOp,
        ...(needsValue ? { value: v1 } : {}),
        ...(needsSecond ? { value2: v2 } : {}),
      };
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

  const handleFilterOpChange = (nextOp) => {
    setFilterOp(nextOp);
    setApplyError(null);
    if (!ruleNeedsFilterValue(nextOp)) {
      setFilterValue('');
      setFilterValue2('');
    } else if (!ruleNeedsSecondFilterValue(nextOp)) {
      setFilterValue2('');
    }
  };

  if (!column || !sortKey) return null;

  const hasColumnSort = !filterOnly && sortBy === sortKey;
  const showStatusBanner = hasColumnSort || !!activeFilterSummary;
  const titleKind = getTitleKind(column);
  const modalTitle = (
    <span className={styles.modalTitleWrap}>
      <span className={`${styles.modalTitleIcon} ${styles[`modalTitleIcon${titleKind.charAt(0).toUpperCase()}${titleKind.slice(1)}`] || ''}`} aria-hidden>
        <IconTitleTag kind={titleKind} />
      </span>
      <span>{column.label}</span>
    </span>
  );

  const valuePlaceholder = filterPlaceholderForColumn(sortKey, columnValueType);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
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
            <span className={`${styles.panelIcon} ${styles.panelIconSort}`} aria-hidden>
              <IconSortArrows />
            </span>
            <div>
              <div className={styles.panelTitleRow}>
                <h3 id="lead-col-sort-heading" className={styles.panelTitle}>
                  Sort
                </h3>
                <InfoHelpIcon
                  title="Sort info"
                  modalTitle="Sort"
                  message="Applies to the whole list (server-side). One column controls order at a time."
                />
              </div>
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
            <span className={`${styles.panelIcon} ${styles.panelIconFilter}`} aria-hidden>
              <IconFilterFunnel />
            </span>
            <div>
              <div className={styles.panelTitleRow}>
                <h3 id="lead-col-filter-heading" className={styles.panelTitle}>
                  Filter
                </h3>
                <InfoHelpIcon
                  title="Filter info"
                  modalTitle="Filter"
                  message="Keeps rows where this column matches the rule. Combines with search and other column filters."
                />
              </div>
            </div>
          </div>

          <div className={styles.filterFields}>
            <Select
              id="leadColFilterOp"
              label="Condition"
              value={filterOp}
              onChange={(e) => handleFilterOpChange(e.target.value)}
              options={filterSelectOptions}
              placeholder="Choose…"
            />
            {needsValue ? (
              <div className={needsSecond ? styles.filterValueRange : undefined}>
                {columnValueType === FILTER_VALUE_TYPE.DATE ? (
                  <DateTimePickerField
                    label={needsSecond ? 'Start date' : 'Value'}
                    mode="date"
                    value={filterValue}
                    onChange={(v) => {
                      setFilterValue(v);
                      setApplyError(null);
                    }}
                    placeholder={valuePlaceholder}
                    error={applyError && !needsSecond ? applyError : undefined}
                  />
                ) : (
                  <Input
                    label={needsSecond ? 'Start value' : 'Value'}
                    type={columnValueType === FILTER_VALUE_TYPE.NUMBER ? 'number' : 'text'}
                    value={filterValue}
                    onChange={(e) => {
                      setFilterValue(e.target.value);
                      setApplyError(null);
                    }}
                    placeholder={valuePlaceholder}
                    maxLength={200}
                    inputMode={columnValueType === FILTER_VALUE_TYPE.NUMBER ? 'numeric' : undefined}
                    error={applyError && !needsSecond ? applyError : undefined}
                    hint={`Matches against “${column.label}”. Max 200 characters.`}
                  />
                )}
                {needsSecond ? (
                  columnValueType === FILTER_VALUE_TYPE.DATE ? (
                    <DateTimePickerField
                      label="End date"
                      mode="date"
                      value={filterValue2}
                      onChange={(v) => {
                        setFilterValue2(v);
                        setApplyError(null);
                      }}
                      placeholder="End date"
                      error={applyError}
                    />
                  ) : (
                    <Input
                      label="End value"
                      type={columnValueType === FILTER_VALUE_TYPE.NUMBER ? 'number' : 'text'}
                      value={filterValue2}
                      onChange={(e) => {
                        setFilterValue2(e.target.value);
                        setApplyError(null);
                      }}
                      placeholder={columnValueType === FILTER_VALUE_TYPE.NUMBER ? 'End number' : 'End value'}
                      maxLength={200}
                      inputMode={columnValueType === FILTER_VALUE_TYPE.NUMBER ? 'numeric' : undefined}
                      error={applyError}
                    />
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  );
}
