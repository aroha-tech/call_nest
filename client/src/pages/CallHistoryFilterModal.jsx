import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MultiSelectDropdown } from '../components/ui/MultiSelectDropdown';
import { Select } from '../components/ui/Select';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import { TIME_RANGE_PRESET } from '../utils/dateRangePresets';
import { ALL_CALL_HISTORY_COLUMNS } from './callHistoryTableConfig';
import styles from './CallHistoryFilterModal.module.scss';

function IconSliders() {
  return (
    <svg className={styles.sectionSvg} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="4" y1="21" x2="4" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="10" x2="4" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="21" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="21" x2="20" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="12" x2="20" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="1" y1="14" x2="7" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPropertyRules() {
  return (
    <svg className={styles.sectionSvg} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CH_PROPERTY_FIELD_OPTIONS = ALL_CALL_HISTORY_COLUMNS.map((c) => ({ value: c.id, label: c.label }));

const OP_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'empty', label: 'Is empty' },
  { value: 'not_empty', label: 'Is not empty' },
];

function needsValue(op) {
  return ['contains', 'not_contains', 'starts_with', 'ends_with'].includes(op);
}

function normalizeColumnRules(rows) {
  const byField = new Map();
  for (const r of rows) {
    const field = String(r.field || '').trim();
    const op = String(r.op || '').trim();
    if (!field || !op) continue;
    const value = r.value == null ? '' : String(r.value).trim();
    if (needsValue(op) && !value) continue;
    byField.set(field, { field, op, ...(needsValue(op) ? { value } : {}) });
  }
  return [...byField.values()].slice(0, 12);
}

function dedupeInitialRules(rules) {
  if (!rules?.length) return [{ field: 'contact', op: 'contains', value: '' }];
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    const field = String(r.field || 'contact').trim();
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({
      field,
      op: r.op || 'contains',
      value: r.value ?? '',
    });
  }
  return out.length ? out : [{ field: 'contact', op: 'contains', value: '' }];
}

function fieldOptionsForRow(rows, rowIndex, allOptions) {
  const current = rows[rowIndex]?.field;
  const usedElsewhere = new Set(
    rows.map((r, i) => (i !== rowIndex ? r.field : null)).filter(Boolean)
  );
  const filtered = allOptions.filter((o) => o.value === current || !usedElsewhere.has(o.value));
  if (current && !filtered.some((o) => o.value === current)) {
    return [{ value: current, label: current }, ...filtered];
  }
  return filtered;
}

function firstUnusedFieldKey(rows, allOptions) {
  const used = new Set(rows.map((r) => r.field));
  const found = allOptions.find((o) => !used.has(o.value));
  return found?.value ?? null;
}

function normalizeFilterName(raw) {
  return String(raw ?? '').trim();
}

function duplicateNameMessage(existingSavedFilters, rawName, excludeId) {
  const n = normalizeFilterName(rawName).toLowerCase();
  if (!n) return '';
  const hit = (existingSavedFilters || []).find((f) => {
    const lower = String(f?.name || '').trim().toLowerCase();
    if (!lower || lower !== n) return false;
    if (excludeId == null) return true;
    return Number(f?.id) !== Number(excludeId);
  });
  return hit ? 'A saved filter with this name already exists. Choose a different name.' : '';
}

export function CallHistoryFilterModal({
  isOpen,
  onClose,
  values,
  onApply,
  dispositionOptions,
  agentOptions,
  directionOptions,
  statusOptions,
  connectedOptions,
  canPickAgents,
  initialColumnRules = [],
  savedFilterId = null,
  initialSavedFilterName = '',
  existingSavedFilters = [],
  onSaveNamedFilter,
  onUpdateNamedFilter,
}) {
  const [draft, setDraft] = useState(values);
  const [filterName, setFilterName] = useState('');
  const [filterNameError, setFilterNameError] = useState('');
  const [rows, setRows] = useState([{ field: 'contact', op: 'contains', value: '' }]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(values);
    if (savedFilterId != null && normalizeFilterName(initialSavedFilterName)) {
      setFilterName(normalizeFilterName(initialSavedFilterName));
    } else {
      setFilterName('');
    }
    setFilterNameError('');
    setRows(dedupeInitialRules(initialColumnRules));
  }, [isOpen, values, savedFilterId, initialSavedFilterName, initialColumnRules]);

  const fields = useMemo(() => draft || values, [draft, values]);

  const allFieldOptions = CH_PROPERTY_FIELD_OPTIONS;

  const fieldOptionsPerRow = useMemo(
    () => rows.map((_, idx) => fieldOptionsForRow(rows, idx, allFieldOptions)),
    [rows, allFieldOptions]
  );

  const canAddPropertyRow = firstUnusedFieldKey(rows, allFieldOptions) != null && rows.length < 12;

  const isEditingSaved = savedFilterId != null;
  const modalTitle = isEditingSaved ? 'Edit filter' : 'Filters';

  const buildFilterPayload = () => ({
    contactFilter: fields.contactFilter ?? '',
    dispositionFilterMulti: fields.dispositionFilterMulti ?? '',
    directionFilterMulti: fields.directionFilterMulti ?? '',
    statusFilterMulti: fields.statusFilterMulti ?? '',
    connectedFilterMulti: fields.connectedFilterMulti ?? '',
    agentFilterMulti: fields.agentFilterMulti ?? '',
    todayOnly: Boolean(fields.todayOnly),
    startedAfter: fields.startedAfter ?? '',
    startedBefore: fields.startedBefore ?? '',
    columnFilters: normalizeColumnRules(rows),
  });

  const handleSave = () => {
    const name = normalizeFilterName(filterName);
    if (!name) return;
    const dup = duplicateNameMessage(existingSavedFilters, name, savedFilterId);
    if (dup) {
      setFilterNameError(dup);
      return;
    }
    setFilterNameError('');
    const payload = buildFilterPayload();
    if (savedFilterId != null) {
      onUpdateNamedFilter?.(savedFilterId, name, payload);
    } else {
      onSaveNamedFilter?.(name, payload);
    }
    onClose();
  };

  const handleApply = () => {
    onApply?.(buildFilterPayload());
    onClose();
  };

  const addRow = () => {
    setRows((prev) => {
      const nextField = firstUnusedFieldKey(prev, allFieldOptions);
      if (!nextField || prev.length >= 12) return prev;
      return [...prev, { field: nextField, op: 'contains', value: '' }];
    });
  };

  const removeRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const patchRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl" closeOnEscape>
      <div className={styles.advBody}>
        <div className={styles.nameBlock}>
          <Input
            label={isEditingSaved ? 'Filter name' : 'Filter name (for saving)'}
            value={filterName}
            onChange={(e) => {
              setFilterName(e.target.value);
              setFilterNameError('');
            }}
            placeholder="e.g. Q2 healthcare leads"
            error={filterNameError}
          />
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.refinePanel}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitleIcon}>
              <IconSliders />
            </span>
            <span className={styles.sectionTitleText}>Refine by field</span>
          </div>
          <div className={styles.structuredGrid}>
            <Input
              label="Lead or contact (numeric key)"
              value={fields.contactFilter || ''}
              onChange={(e) => setDraft((p) => ({ ...p, contactFilter: e.target.value }))}
              placeholder="e.g. 123"
              inputMode="numeric"
            />
            <MultiSelectDropdown
              label="Disposition"
              value={fields.dispositionFilterMulti || ''}
              onChange={(v) => setDraft((p) => ({ ...p, dispositionFilterMulti: v }))}
              options={dispositionOptions}
              placeholder="All dispositions"
            />
            <MultiSelectDropdown
              label="Direction"
              value={fields.directionFilterMulti || ''}
              onChange={(v) => setDraft((p) => ({ ...p, directionFilterMulti: v }))}
              options={directionOptions}
              placeholder="Any direction"
            />
            <MultiSelectDropdown
              label="Status"
              value={fields.statusFilterMulti || ''}
              onChange={(v) => setDraft((p) => ({ ...p, statusFilterMulti: v }))}
              options={statusOptions}
              placeholder="All statuses"
            />
            <MultiSelectDropdown
              label="Connectivity"
              value={fields.connectedFilterMulti || ''}
              onChange={(v) => setDraft((p) => ({ ...p, connectedFilterMulti: v }))}
              options={connectedOptions}
              placeholder="Any"
            />
            {canPickAgents ? (
              <MultiSelectDropdown
                label="Agent"
                value={fields.agentFilterMulti || ''}
                onChange={(v) => setDraft((p) => ({ ...p, agentFilterMulti: v }))}
                options={agentOptions}
                placeholder="All agents"
              />
            ) : null}
          </div>
          <p className={styles.multiSelectNote}>
            Disposition, direction, call status, connectivity, and agent use multi-select: open the dropdown and choose
            one or more options.
          </p>

          <DateRangePresetControl
            variant="datetime"
            startLabel="Started after"
            endLabel="Started before"
            preset={fields.timeRangePreset ?? TIME_RANGE_PRESET.ALL_TIME}
            onPresetChange={(v) => setDraft((p) => ({ ...p, timeRangePreset: v }))}
            customStart={fields.customStartedAfter ?? ''}
            customEnd={fields.customStartedBefore ?? ''}
            onCustomStartChange={(v) => setDraft((p) => ({ ...p, customStartedAfter: v }))}
            onCustomEndChange={(v) => setDraft((p) => ({ ...p, customStartedBefore: v }))}
            includeLegacyTodayOption={fields.timeRangePreset === TIME_RANGE_PRESET.TODAY_CALENDAR}
          />
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.propertyPanel}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitleIcon}>
              <IconPropertyRules />
            </span>
            <span className={styles.sectionTitleText}>Property</span>
          </div>
          <p className={styles.hint}>
            Rules here are combined with the selections above. Each field can only be used once. Values are optional for
            empty / not empty.
          </p>
          <div className={styles.propertyRows}>
            <div className={styles.propertyGridHeader}>
              <span>Field</span>
              <span>Operator</span>
              <span>Value</span>
              <span className={styles.propertyGridHeaderAction} />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className={styles.row}>
                <Select
                  label=""
                  aria-label={`Property field, row ${idx + 1}`}
                  value={row.field}
                  onChange={(e) => patchRow(idx, { field: e.target.value })}
                  options={fieldOptionsPerRow[idx] ?? allFieldOptions}
                  className={styles.fieldSel}
                />
                <Select
                  label=""
                  aria-label={`Property operator, row ${idx + 1}`}
                  value={row.op}
                  onChange={(e) => patchRow(idx, { op: e.target.value })}
                  options={OP_OPTIONS}
                  className={styles.opSel}
                />
                <Input
                  label=""
                  aria-label={`Property value, row ${idx + 1}`}
                  value={row.value}
                  onChange={(e) => patchRow(idx, { value: e.target.value })}
                  placeholder={needsValue(row.op) ? 'Text to match' : '—'}
                  disabled={!needsValue(row.op)}
                  className={styles.valInp}
                />
                <button type="button" className={styles.removeRowBtn} onClick={() => removeRow(idx)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={styles.addPropertyBtn}
            onClick={addRow}
            disabled={!canAddPropertyRow}
          >
            + Add property
          </Button>
        </div>
      </div>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={handleApply}>
          Apply
        </Button>
        <Button type="button" variant="primary" onClick={handleSave} disabled={!normalizeFilterName(filterName)}>
          Save
        </Button>
      </ModalFooter>
    </Modal>
  );
}
