import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Alert } from '../../components/ui/Alert';
import { SearchInput } from '../../components/ui/SearchInput';
import { contactCustomFieldsAPI } from '../../services/contactCustomFieldsAPI';
import { getDefaultVisibleLeadColumnIds, saveLeadVisibleColumnIds } from './leadTableConfig';
import styles from './LeadColumnCustomizeModal.module.scss';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'multiselect', label: 'Multi-select (checkboxes)' },
  { value: 'multiselect_dropdown', label: 'Multi-select (dropdown)' },
];

function parseSelectOptionsFromCommaString(raw) {
  if (raw === undefined || raw === null) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function partitionVisible(applicableColumns, visibleOrdered) {
  const visSet = new Set(visibleOrdered);
  const visible = visibleOrdered.map((id) => applicableColumns.find((c) => c.id === id)).filter(Boolean);
  const hidden = applicableColumns.filter((c) => !visSet.has(c.id));
  return { visible, hidden };
}

export function LeadColumnCustomizeModal({
  isOpen,
  onClose,
  applicableColumns,
  visibleColumnIds,
  onSave,
  canAddCustomField = false,
  onCustomFieldCreated,
  title = 'Customize columns',
  getDefaults,
  persistVisibleIds,
}) {
  const [visibleOrdered, setVisibleOrdered] = useState([]);
  const [search, setSearch] = useState('');
  const [draggingId, setDraggingId] = useState(null);

  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addType, setAddType] = useState('text');
  const [addOptions, setAddOptions] = useState('');
  const [addRequired, setAddRequired] = useState(false);
  const [addErrors, setAddErrors] = useState({});
  const [addSubmitError, setAddSubmitError] = useState(null);
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setDraggingId(null);
    setAddFieldOpen(false);
    setAddName('');
    setAddLabel('');
    setAddType('text');
    setAddOptions('');
    setAddRequired(false);
    setAddErrors({});
    setAddSubmitError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const hasDn = applicableColumns.some((c) => c.id === 'display_name');
    const rest = visibleColumnIds.filter((id) => id !== 'display_name');
    const ordered = hasDn ? ['display_name', ...rest] : [...visibleColumnIds];
    setVisibleOrdered(ordered);
  }, [isOpen, visibleColumnIds, applicableColumns]);

  const resetAddFieldForm = () => {
    setAddName('');
    setAddLabel('');
    setAddType('text');
    setAddOptions('');
    setAddRequired(false);
    setAddErrors({});
    setAddSubmitError(null);
  };

  const handleOpenAddField = () => {
    resetAddFieldForm();
    setAddFieldOpen(true);
  };

  const handleCreateCustomField = async (e) => {
    e.preventDefault();
    setAddSubmitError(null);
    const errors = {};
    if (!String(addName).trim()) errors.name = 'Field key is required';
    if (!String(addLabel).trim()) errors.label = 'Label is required';
    if (!addType) errors.type = 'Type is required';
    const optionList = parseSelectOptionsFromCommaString(addOptions);
    if (
      (addType === 'select' || addType === 'multiselect' || addType === 'multiselect_dropdown') &&
      optionList.length === 0
    ) {
      errors.options = 'Add at least one option (comma-separated)';
    }
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }
    setAddErrors({});
    setAddSaving(true);
    try {
      const res = await contactCustomFieldsAPI.create({
        name: String(addName).trim(),
        label: String(addLabel).trim(),
        type: addType,
        is_required: addRequired,
        ...(addType === 'select' || addType === 'multiselect' || addType === 'multiselect_dropdown'
          ? { options: optionList }
          : {}),
      });
      const created = res?.data?.data;
      if (created && onCustomFieldCreated) {
        onCustomFieldCreated(created);
      }
      setAddFieldOpen(false);
      resetAddFieldForm();
    } catch (err) {
      setAddSubmitError(err.response?.data?.error || err.message || 'Failed to create field');
    } finally {
      setAddSaving(false);
    }
  };

  const { visible: visibleRows, hidden: hiddenRows } = useMemo(
    () => partitionVisible(applicableColumns, visibleOrdered),
    [applicableColumns, visibleOrdered]
  );

  const q = search.trim().toLowerCase();
  const visibleFiltered = useMemo(
    () => (q ? visibleRows.filter((c) => c.label.toLowerCase().includes(q)) : visibleRows),
    [visibleRows, q]
  );
  const hiddenFiltered = useMemo(
    () => (q ? hiddenRows.filter((c) => c.label.toLowerCase().includes(q)) : hiddenRows),
    [hiddenRows, q]
  );

  const hideColumn = (id) => {
    if (id === 'display_name') return;
    setVisibleOrdered((prev) => prev.filter((x) => x !== id));
  };

  const showColumn = (id) => {
    setVisibleOrdered((prev) => {
      if (prev.includes(id)) return prev;
      const head = prev[0] === 'display_name' ? ['display_name'] : [];
      const tail = prev[0] === 'display_name' ? prev.slice(1) : [...prev];
      return [...head, ...tail, id];
    });
  };

  const handleDragStart = useCallback((e, id) => {
    if (id === 'display_name') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnRow = useCallback((e, targetId) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === 'display_name' || targetId === 'display_name') return;
    if (draggedId === targetId) return;

    setVisibleOrdered((prev) => {
      const head = prev[0] === 'display_name' ? ['display_name'] : [];
      const tail = prev[0] === 'display_name' ? prev.slice(1) : [...prev];
      const from = tail.indexOf(draggedId);
      const to = tail.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...tail];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return head.length ? [...head, ...next] : next;
    });
    setDraggingId(null);
  }, []);

  const handleDefault = () => {
    const fn = getDefaults || getDefaultVisibleLeadColumnIds;
    setVisibleOrdered(fn(applicableColumns));
  };

  const handleSave = () => {
    const ensured = visibleOrdered.includes('display_name')
      ? visibleOrdered
      : applicableColumns.some((c) => c.id === 'display_name')
        ? ['display_name', ...visibleOrdered.filter((id) => id !== 'display_name')]
        : visibleOrdered;
    const persist = persistVisibleIds || saveLeadVisibleColumnIds;
    persist(ensured);
    onSave(ensured);
    onClose();
  };

  const visibleCount = visibleOrdered.length;
  const total = applicableColumns.length;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      closeOnEscape
      footer={
        <ModalFooter>
          <Button type="button" variant="secondary" size="sm" onClick={handleDefault}>
            Default columns
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Save
          </Button>
        </ModalFooter>
      }
    >
      <div className={styles.toolbarRow}>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={setSearch}
          placeholder="Search…"
          className={styles.searchGrow}
        />
        {canAddCustomField ? (
          <Button type="button" variant="secondary" size="sm" onClick={handleOpenAddField}>
            Add column
          </Button>
        ) : null}
      </div>

      <div className={styles.columnsGrid}>
        <section className={styles.panel}>
          <h3 className={styles.sectionHeading}>
            Visible <span className={styles.sectionCount}>({visibleCount}/{total})</span>
          </h3>
          <p className={styles.sectionSub}>
            Drag the handle to reorder. Uncheck to move a field to &quot;Not visible&quot;. Display name always stays on.
          </p>
          <ul
            className={styles.list}
            onDragOver={handleDragOver}
            role="list"
            aria-label="Visible columns"
          >
            {visibleFiltered.map((col) => {
              const locked = col.id === 'display_name';
              const isDragging = draggingId === col.id;
              return (
                <li
                  key={col.id}
                  className={`${styles.rowVisible} ${isDragging ? styles.rowDragging : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnRow(e, col.id)}
                  role="listitem"
                >
                  {locked ? (
                    <span className={styles.dragSpacer} aria-hidden />
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      className={styles.dragHandle}
                      draggable
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${col.label}`}
                      onDragStart={(e) => handleDragStart(e, col.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className={styles.dragGrip} aria-hidden>
                        ⠿
                      </span>
                    </div>
                  )}
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked
                      disabled={locked}
                      onChange={() => {
                        if (!locked) hideColumn(col.id);
                      }}
                    />
                    <span className={styles.rowLabel}>{col.label}</span>
                  </label>
                  <span className={styles.fieldTag}>
                    {col.category === 'custom' ? 'Custom' : col.category === 'extra' ? 'Extra' : 'Lead'}
                  </span>
                  {locked ? <span className={styles.pill}>Always</span> : null}
                </li>
              );
            })}
          </ul>
          {visibleFiltered.length === 0 ? <p className={styles.empty}>No fields match.</p> : null}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.sectionHeading}>Not visible</h3>
          <p className={styles.sectionSub}>Check a field to add it to the table (it appears at the end until you reorder).</p>
          <ul className={styles.list} role="list" aria-label="Hidden columns">
            {hiddenFiltered.map((col) => (
              <li key={col.id} className={styles.rowHidden} role="listitem">
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => showColumn(col.id)}
                  />
                  <span className={styles.rowLabel}>{col.label}</span>
                </label>
                <span className={styles.fieldTag}>
                  {col.category === 'custom' ? 'Custom' : col.category === 'extra' ? 'Extra' : 'Lead'}
                </span>
              </li>
            ))}
          </ul>
          {hiddenFiltered.length === 0 ? (
            <p className={styles.emptyMuted}>All available fields are visible.</p>
          ) : null}
        </section>
      </div>
    </Modal>

    <Modal
      isOpen={addFieldOpen}
      onClose={() => {
        setAddFieldOpen(false);
        resetAddFieldForm();
      }}
      title="Add custom field"
      size="md"
      closeOnEscape
      footer={
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setAddFieldOpen(false);
              resetAddFieldForm();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form="lead-add-custom-field-form" size="sm" loading={addSaving}>
            Create
          </Button>
        </ModalFooter>
      }
    >
      <form id="lead-add-custom-field-form" onSubmit={handleCreateCustomField} className={styles.addForm}>
        {addSubmitError ? <Alert variant="error">{addSubmitError}</Alert> : null}
        <Input
          label="Field key"
          required
          placeholder="e.g. property_type"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          error={addErrors.name}
          hint="Letters, numbers, underscores — same as in Settings."
        />
        <Input
          label="Label"
          required
          placeholder="Label shown in forms and this table"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          error={addErrors.label}
        />
        <Select
          label="Type"
          value={addType}
          onChange={(e) => setAddType(e.target.value)}
          options={FIELD_TYPE_OPTIONS}
          error={addErrors.type}
        />
        {addType === 'select' || addType === 'multiselect' || addType === 'multiselect_dropdown' ? (
          <Input
            label="Options (comma-separated)"
            placeholder="e.g. Hot, Warm, Cold"
            value={addOptions}
            onChange={(e) => setAddOptions(e.target.value)}
            error={addErrors.options}
            hint="Used for single select and both multi-select types"
          />
        ) : null}
        <Checkbox
          id="lead-add-cf-required"
          label="Required on contact / lead forms"
          checked={addRequired}
          onChange={(e) => setAddRequired(e.target.checked)}
        />
      </form>
    </Modal>
    </>
  );
}
