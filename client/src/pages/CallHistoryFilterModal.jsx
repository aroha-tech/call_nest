import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { MultiSelectDropdown } from '../components/ui/MultiSelectDropdown';
import styles from './CallHistoryFilterModal.module.scss';

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
  onReset,
  dispositionOptions,
  agentOptions,
  directionOptions,
  statusOptions,
  connectedOptions,
  canPickAgents,
  savedFilterId = null,
  initialSavedFilterName = '',
  existingSavedFilters = [],
  onSaveNamedFilter,
  onUpdateNamedFilter,
}) {
  const [draft, setDraft] = useState(values);
  const [filterName, setFilterName] = useState('');
  const [filterNameError, setFilterNameError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDraft(values);
    if (savedFilterId != null && normalizeFilterName(initialSavedFilterName)) {
      setFilterName(normalizeFilterName(initialSavedFilterName));
    } else {
      setFilterName('');
    }
    setFilterNameError('');
  }, [isOpen, values, savedFilterId, initialSavedFilterName]);

  const resetDraft = () =>
    setDraft({
      contactFilter: '',
      dispositionFilterMulti: '',
      directionFilterMulti: '',
      statusFilterMulti: '',
      connectedFilterMulti: '',
      agentFilterMulti: '',
      todayOnly: false,
      startedAfter: '',
      startedBefore: '',
    });

  const fields = useMemo(() => draft || values, [draft, values]);

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
  });

  const handleSaveNamed = () => {
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      closeOnEscape
      footer={
        <ModalFooter className={styles.footerRow}>
          <div className={styles.footerCluster}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetDraft();
                onReset?.();
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetDraft();
              }}
            >
              Clear (draft)
            </Button>
          </div>
          <div className={styles.footerCluster}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                onApply?.(buildFilterPayload());
                onClose();
              }}
            >
              Apply
            </Button>
          </div>
        </ModalFooter>
      }
    >
      <div className={styles.root}>
        <p className={styles.sectionLabel}>Filter criteria</p>
        <div className={styles.criteriaGrid}>
          <Input
            label="Contact / lead ID"
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
            searchable={false}
          />
          <MultiSelectDropdown
            label="Direction"
            value={fields.directionFilterMulti || ''}
            onChange={(v) => setDraft((p) => ({ ...p, directionFilterMulti: v }))}
            options={directionOptions}
            placeholder="Any direction"
            searchable={false}
          />

          <MultiSelectDropdown
            label="Status"
            value={fields.statusFilterMulti || ''}
            onChange={(v) => setDraft((p) => ({ ...p, statusFilterMulti: v }))}
            options={statusOptions}
            placeholder="All statuses"
            searchable={false}
          />
          <MultiSelectDropdown
            label="Connectivity"
            value={fields.connectedFilterMulti || ''}
            onChange={(v) => setDraft((p) => ({ ...p, connectedFilterMulti: v }))}
            options={connectedOptions}
            placeholder="Any"
            searchable={false}
          />
          {canPickAgents ? (
            <MultiSelectDropdown
              label="Agent"
              value={fields.agentFilterMulti || ''}
              onChange={(v) => setDraft((p) => ({ ...p, agentFilterMulti: v }))}
              options={agentOptions}
              placeholder="All agents"
              searchable={false}
            />
          ) : (
            <div aria-hidden className={styles.gridPad} />
          )}
        </div>

        <p className={styles.sectionLabel}>Started time</p>
        <div className={styles.dateGrid}>
          <Input
            label="Started after"
            type="datetime-local"
            value={fields.startedAfter || ''}
            onChange={(e) => setDraft((p) => ({ ...p, startedAfter: e.target.value }))}
          />
          <Input
            label="Started before"
            type="datetime-local"
            value={fields.startedBefore || ''}
            onChange={(e) => setDraft((p) => ({ ...p, startedBefore: e.target.value }))}
          />
        </div>

        <div className={styles.todayRow}>
          <Checkbox
            id="call-history-today-only"
            label="Today only (by attempt time)"
            checked={Boolean(fields.todayOnly)}
            onChange={(e) => setDraft((p) => ({ ...p, todayOnly: e.target.checked }))}
          />
        </div>

        <div className={styles.saveStrip}>
          <p className={styles.saveStripTitle}>
            {isEditingSaved ? 'Update saved filter' : 'Save as named filter (optional)'}
          </p>
          <div className={styles.saveStripRow}>
            <div className={styles.saveNameInput}>
              <Input
                label={isEditingSaved ? 'Filter name' : 'Name'}
                value={filterName}
                onChange={(e) => {
                  setFilterName(e.target.value);
                  setFilterNameError('');
                }}
                placeholder="e.g. My outbound calls"
                error={filterNameError}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!normalizeFilterName(filterName)}
              onClick={handleSaveNamed}
            >
              {isEditingSaved ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
