import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { MultiSelectDropdown } from '../../components/ui/MultiSelectDropdown';
import { normalizeListFilterAll } from '../../utils/listFilterNarrowing';
import styles from './ContactAdvancedFilterModal.module.scss';

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

/** Core fields — must match server COLUMN_FILTER_FIELDS + COLUMN_FILTER_OPS. Industry fields use `ind:field_key` (server validates against tenant definitions). */
const FIELD_OPTIONS = [
  { value: 'display_name', label: 'Name / display' },
  { value: 'primary_phone', label: 'Primary phone' },
  { value: 'blacklist_status', label: 'Blacklist status' },
  { value: 'email', label: 'Email' },
  { value: 'type', label: 'Record type' },
  { value: 'source', label: 'Source' },
  { value: 'city', label: 'City' },
  { value: 'company', label: 'Company' },
  { value: 'website', label: 'Website' },
  { value: 'job_title', label: 'Job title' },
  { value: 'industry', label: 'Industry' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'pin_code', label: 'PIN / ZIP' },
  { value: 'address', label: 'Address' },
  { value: 'address_line_2', label: 'Address line 2' },
  { value: 'tax_id', label: 'Tax ID' },
  { value: 'date_of_birth', label: 'Date of birth' },
  { value: 'created_at', label: 'Created at' },
];

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

function normalizeRows(rows) {
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

/** One rule per field for editing; keeps first occurrence when loading saved filters. */
function dedupeInitialRules(rules) {
  if (!rules?.length) return [{ field: 'display_name', op: 'contains', value: '' }];
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    const field = String(r.field || 'display_name').trim();
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({
      field,
      op: r.op || 'contains',
      value: r.value ?? '',
    });
  }
  return out.length ? out : [{ field: 'display_name', op: 'contains', value: '' }];
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

/**
 * List filters + multi-select (managers, campaigns, tags) + optional property rules (column_filters).
 * onApply / onSaveNamedFilter receive the same payload object.
 */
export function ContactAdvancedFilterModal({
  isOpen,
  onClose,
  initialRules = [],
  onApply,
  onSaveNamedFilter,
  onUpdateNamedFilter,
  savedFilterId = null,
  initialSavedFilterName = '',
  showCampaign = false,
  campaignOptions = [],
  initialCampaignIdsMulti = '',
  showManagersMulti = false,
  adminManagerOptions = [],
  initialAdminManagersMulti = '',
  showAgent = false,
  agentOptions = [],
  initialAgentFilter = '',
  showTags = false,
  tagOptions = [],
  initialTagIdsMulti = '',
  showStatuses = false,
  statusOptions = [],
  initialStatusIdsMulti = '',
  showDialerFilters = false,
  initialTouchStatus = '',
  initialMinCallCount = '',
  initialMaxCallCount = '',
  initialLastCalledPreset = '',
  /** For duplicate-name checks: `{ id, name }[]` */
  existingSavedFilters = [],
  /** `{ value: 'ind:field_key', label }[]` — tenant industry profile fields */
  industryFieldRuleOptions = [],
}) {
  const [filterName, setFilterName] = useState('');
  const [filterNameError, setFilterNameError] = useState('');
  const [saveAsNameError, setSaveAsNameError] = useState('');
  const [rows, setRows] = useState([{ field: 'display_name', op: 'contains', value: '' }]);
  const [draftCampaignIdsMulti, setDraftCampaignIdsMulti] = useState('');
  const [draftAdminManagersMulti, setDraftAdminManagersMulti] = useState('');
  const [draftAgentFilter, setDraftAgentFilter] = useState('');
  const [draftTagIdsMulti, setDraftTagIdsMulti] = useState('');
  const [draftStatusIdsMulti, setDraftStatusIdsMulti] = useState('');
  const [draftTouchStatus, setDraftTouchStatus] = useState('');
  const [draftMinCallCount, setDraftMinCallCount] = useState('');
  const [draftMaxCallCount, setDraftMaxCallCount] = useState('');
  const [draftLastCalledPreset, setDraftLastCalledPreset] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  const duplicateNameMessage = useMemo(() => {
    const names = (existingSavedFilters || []).map((f) => ({
      id: f.id,
      lower: String(f.name || '').trim().toLowerCase(),
    }));
    return (rawName, excludeId) => {
      const n = String(rawName || '').trim().toLowerCase();
      if (!n) return '';
      const hit = names.find((x) => {
        if (x.lower !== n) return false;
        if (excludeId == null) return true;
        return Number(x.id) !== Number(excludeId);
      });
      return hit
        ? 'A saved filter with this name already exists. Choose a different name.'
        : '';
    };
  }, [existingSavedFilters]);

  useEffect(() => {
    if (!isOpen) {
      setSaveAsOpen(false);
      setFilterNameError('');
      setSaveAsNameError('');
      return;
    }
    if (savedFilterId != null && String(initialSavedFilterName || '').trim()) {
      setFilterName(String(initialSavedFilterName).trim());
    } else {
      setFilterName('');
    }
    if (initialRules?.length) {
      setRows(dedupeInitialRules(initialRules));
    } else {
      setRows([{ field: 'display_name', op: 'contains', value: '' }]);
    }
    setDraftCampaignIdsMulti(initialCampaignIdsMulti || '');
    setDraftAdminManagersMulti(initialAdminManagersMulti || '');
    setDraftAgentFilter(normalizeListFilterAll(initialAgentFilter));
    setDraftTagIdsMulti(initialTagIdsMulti || '');
    setDraftStatusIdsMulti(initialStatusIdsMulti || '');
    setDraftTouchStatus(normalizeListFilterAll(initialTouchStatus));
    setDraftMinCallCount(initialMinCallCount ?? '');
    setDraftMaxCallCount(initialMaxCallCount ?? '');
    setDraftLastCalledPreset(normalizeListFilterAll(initialLastCalledPreset));
  }, [
    isOpen,
    savedFilterId,
    initialSavedFilterName,
    initialRules,
    initialCampaignIdsMulti,
    initialAdminManagersMulti,
    initialAgentFilter,
    initialTagIdsMulti,
    initialStatusIdsMulti,
    initialTouchStatus,
    initialMinCallCount,
    initialMaxCallCount,
    initialLastCalledPreset,
  ]);

  const allFieldOptions = useMemo(() => {
    const base = FIELD_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    const ind = (industryFieldRuleOptions || []).filter((o) => o?.value && o?.label);
    return ind.length ? [...base, ...ind] : base;
  }, [industryFieldRuleOptions]);

  const fieldOptionsPerRow = useMemo(
    () => rows.map((_, idx) => fieldOptionsForRow(rows, idx, allFieldOptions)),
    [rows, allFieldOptions]
  );

  const canAddPropertyRow = firstUnusedFieldKey(rows, allFieldOptions) != null && rows.length < 12;

  const buildPayload = () => ({
    columnRules: normalizeRows(rows),
    campaignIdsMulti: draftCampaignIdsMulti,
    adminManagersMulti: draftAdminManagersMulti,
    agentFilter: normalizeListFilterAll(draftAgentFilter),
    tagIdsMulti: draftTagIdsMulti,
    statusIdsMulti: draftStatusIdsMulti,
    touchStatus: normalizeListFilterAll(draftTouchStatus),
    minCallCount: draftMinCallCount,
    maxCallCount: draftMaxCallCount,
    lastCalledPreset: normalizeListFilterAll(draftLastCalledPreset),
  });

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

  const handleApply = () => {
    onApply?.(buildPayload());
    onClose?.();
  };

  const handleSave = () => {
    const name = String(filterName || '').trim();
    if (!name) return;
    const dup = duplicateNameMessage(name, savedFilterId);
    if (dup) {
      setFilterNameError(dup);
      return;
    }
    setFilterNameError('');
    const payload = buildPayload();
    if (savedFilterId != null) {
      onUpdateNamedFilter?.(savedFilterId, name, payload);
    } else {
      onSaveNamedFilter?.(name, payload);
    }
    onClose?.();
  };

  const openSaveAsDialog = () => {
    const suggested = String(filterName || '').trim() || 'My filter';
    setSaveAsName(`${suggested} copy`);
    setSaveAsNameError('');
    setSaveAsOpen(true);
  };

  const confirmSaveAs = () => {
    const name = String(saveAsName || '').trim();
    if (!name) return;
    const dup = duplicateNameMessage(name, null);
    if (dup) {
      setSaveAsNameError(dup);
      return;
    }
    setSaveAsNameError('');
    onSaveNamedFilter?.(name, buildPayload());
    setSaveAsOpen(false);
    onClose?.();
  };

  const showStructuredBlock =
    showCampaign || showStatuses || showManagersMulti || showAgent || showTags || showDialerFilters;

  const isEditingSaved = savedFilterId != null;
  const modalTitle = isEditingSaved ? 'Edit filter' : 'Filters';

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl" closeOnEscape={!saveAsOpen}>
      <div className={styles.body}>
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

        {showStructuredBlock ? (
          <>
            <div className={styles.refinePanel}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionTitleIcon}>
                  <IconSliders />
                </span>
                <span className={styles.sectionTitleText}>Refine by field</span>
              </div>
              <div className={styles.structuredGrid}>
                {showCampaign ? (
                  <MultiSelectDropdown
                    label="Campaigns"
                    value={draftCampaignIdsMulti}
                    onChange={setDraftCampaignIdsMulti}
                    options={campaignOptions}
                    placeholder="All campaigns"
                  />
                ) : null}
                {showStatuses ? (
                  <MultiSelectDropdown
                    label="Status"
                    value={draftStatusIdsMulti}
                    onChange={setDraftStatusIdsMulti}
                    options={statusOptions}
                    placeholder="All statuses"
                  />
                ) : null}
                {showManagersMulti ? (
                  <MultiSelectDropdown
                    label="Owning managers"
                    value={draftAdminManagersMulti}
                    onChange={setDraftAdminManagersMulti}
                    options={adminManagerOptions}
                    placeholder="All managers"
                  />
                ) : null}
                {showAgent ? (
                  <Select
                    allowEmpty
                    label="Assigned agent"
                    placeholder="All agents"
                    value={draftAgentFilter || ''}
                    onChange={(e) => setDraftAgentFilter(e.target.value)}
                    options={agentOptions}
                    className={styles.fullWidthSelect}
                  />
                ) : null}
                {showTags ? (
                  <MultiSelectDropdown
                    label="Tags (match all selected)"
                    value={draftTagIdsMulti}
                    onChange={setDraftTagIdsMulti}
                    options={tagOptions}
                    placeholder="Any tags"
                  />
                ) : null}
                {showDialerFilters ? (
                  <>
                    <Select
                      allowEmpty
                      label="Call status"
                      placeholder="All"
                      value={draftTouchStatus || ''}
                      onChange={(e) => setDraftTouchStatus(e.target.value)}
                      options={[
                        { value: 'untouched', label: 'Never called' },
                        { value: 'touched', label: 'Called' },
                      ]}
                      className={styles.fullWidthSelect}
                    />
                    <Select
                      allowEmpty
                      label="Last called"
                      placeholder="Any time"
                      value={draftLastCalledPreset || ''}
                      onChange={(e) => setDraftLastCalledPreset(e.target.value)}
                      options={[
                        { value: '1', label: 'Last 1 day' },
                        { value: '7', label: 'Last 7 days' },
                        { value: '30', label: 'Last 30 days' },
                        { value: '90', label: 'Last 90 days' },
                      ]}
                      className={styles.fullWidthSelect}
                    />
                    <Input
                      label="Min calls"
                      value={draftMinCallCount}
                      onChange={(e) => setDraftMinCallCount(e.target.value)}
                      placeholder="e.g. 0"
                    />
                    <Input
                      label="Max calls"
                      value={draftMaxCallCount}
                      onChange={(e) => setDraftMaxCallCount(e.target.value)}
                      placeholder="e.g. 5"
                    />
                  </>
                ) : null}
              </div>
              {(showCampaign || showStatuses || showManagersMulti || showTags) && (
                <p className={styles.multiSelectNote}>
                  Campaigns, status, owning managers, and tags: leave empty to include everything, or pick one or more
                  values to narrow the list.
                </p>
              )}
            </div>
            <hr className={styles.sectionDivider} />
          </>
        ) : null}

        <div className={styles.propertyPanel}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitleIcon}>
              <IconPropertyRules />
            </span>
            <span className={styles.sectionTitleText}>Property</span>
          </div>
          <p className={styles.hint}>
            Rules here are combined with the selections above. Each field can only be used once. Values are optional
            for empty / not empty.
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
                <button
                  type="button"
                  className={styles.removeRowBtn}
                  onClick={() => removeRow(idx)}
                >
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
            Add property
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
        <Button type="button" variant="primary" onClick={handleSave} disabled={!String(filterName || '').trim()}>
          Save
        </Button>
        {isEditingSaved ? (
          <Button type="button" variant="primary" onClick={openSaveAsDialog}>
            Save as…
          </Button>
        ) : null}
      </ModalFooter>
    </Modal>

    <Modal
      isOpen={saveAsOpen}
      onClose={() => setSaveAsOpen(false)}
      title="Save filter as"
      size="sm"
      closeOnEscape
    >
      <div className={styles.saveAsBody}>
        <Input
          label="Filter name"
          value={saveAsName}
          onChange={(e) => {
            setSaveAsName(e.target.value);
            setSaveAsNameError('');
          }}
          placeholder="e.g. Q2 healthcare leads (copy)"
          autoFocus
          error={saveAsNameError}
        />
      </div>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={() => setSaveAsOpen(false)}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={confirmSaveAs} disabled={!String(saveAsName || '').trim()}>
          Save
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}
