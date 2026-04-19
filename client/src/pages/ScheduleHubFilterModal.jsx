import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import styles from './ScheduleHubFilterModal.module.scss';

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

export function ScheduleHubFilterModal({
  isOpen,
  onClose,
  values,
  onApply,
  teamMemberOptions,
  timeFlagOptions,
  meetingStatusOptions,
  callbackStatusOptions,
  initialTab = 'meetings',
  savedFilterId = null,
  initialSavedFilterName = '',
  existingSavedFilters = [],
  onSaveNamedFilter,
  onUpdateNamedFilter,
}) {
  const [draft, setDraft] = useState(values);
  const [tab, setTab] = useState(initialTab);
  const [filterName, setFilterName] = useState('');
  const [filterNameError, setFilterNameError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDraft(values);
    setTab(initialTab || 'meetings');
    if (savedFilterId != null && normalizeFilterName(initialSavedFilterName)) {
      setFilterName(normalizeFilterName(initialSavedFilterName));
    } else {
      setFilterName('');
    }
    setFilterNameError('');
  }, [isOpen, values, initialTab, savedFilterId, initialSavedFilterName]);

  const fields = useMemo(() => draft || values, [draft, values]);

  const isEditingSaved = savedFilterId != null;
  const modalTitle = isEditingSaved ? 'Edit filter' : 'Filters';

  const buildFilterPayload = () => ({
    tab,
    assignedUserId: fields.assignedUserId ?? '',
    timeFlag: fields.timeFlag ?? '',
    meetingStatus: fields.meetingStatus ?? '',
    callbackStatus: fields.callbackStatus ?? '',
    searchQuery: fields.searchQuery ?? '',
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
    if (savedFilterId != null) onUpdateNamedFilter?.(savedFilterId, name, payload);
    else onSaveNamedFilter?.(name, payload);
    onClose();
  };

  const handleApply = () => {
    onApply?.(buildFilterPayload());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      closeOnOverlay
      closeOnEscape
      footer={
        <ModalFooter className={styles.footerRow}>
          <div className={styles.footerCluster}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleApply}>
              Apply
            </Button>
          </div>
          <div className={styles.footerCluster}>
            <Button type="button" variant="secondary" onClick={handleSave} disabled={!normalizeFilterName(filterName)}>
              {isEditingSaved ? 'Update' : 'Save'}
            </Button>
          </div>
        </ModalFooter>
      }
    >
      <div className={styles.advBody}>
        <div className={styles.nameBlock}>
          <Input
            label={isEditingSaved ? 'Filter name' : 'Filter name (for saving)'}
            value={filterName}
            onChange={(e) => {
              setFilterName(e.target.value);
              setFilterNameError('');
            }}
            placeholder="e.g. Today missed callbacks"
            error={filterNameError}
          />
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.refinePanel}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitleIcon} aria-hidden>
              <IconSliders />
            </span>
            <span className={styles.sectionTitleText}>Refine by field</span>
          </div>

          <div className={styles.criteriaGrid}>
            <Select
              label="Tab"
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              options={[
                { value: 'meetings', label: 'Meetings' },
                { value: 'callbacks', label: 'Callbacks' },
              ]}
            />
            <Select
              label="Team member"
              value={fields.assignedUserId || ''}
              onChange={(e) => setDraft((p) => ({ ...p, assignedUserId: e.target.value }))}
              options={teamMemberOptions}
            />
            <Select
              label="Time flag"
              value={fields.timeFlag || ''}
              onChange={(e) => setDraft((p) => ({ ...p, timeFlag: e.target.value }))}
              options={timeFlagOptions}
            />
            {tab === 'meetings' ? (
              <Select
                label="Meeting status"
                value={fields.meetingStatus || ''}
                onChange={(e) => setDraft((p) => ({ ...p, meetingStatus: e.target.value }))}
                options={meetingStatusOptions}
              />
            ) : (
              <Select
                label="Callback status"
                value={fields.callbackStatus || ''}
                onChange={(e) => setDraft((p) => ({ ...p, callbackStatus: e.target.value }))}
                options={callbackStatusOptions}
              />
            )}
            <Input
              label="Search"
              value={fields.searchQuery || ''}
              onChange={(e) => setDraft((p) => ({ ...p, searchQuery: e.target.value }))}
              placeholder="contact, phone, title, notes…"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

