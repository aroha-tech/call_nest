import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Alert } from '../../components/ui/Alert';
import { SearchInput } from '../../components/ui/SearchInput';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
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

const AVAILABLE_LIST_INITIAL = 10;

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

/** @returns {{ typeLabel: string, icon: string }} */
function getColumnPresentation(col) {
  if (col?.category === 'custom' && col?.customFieldType) {
    const cf = col.customFieldType;
    const map = {
      text: { typeLabel: 'Text', icon: 'text_fields' },
      number: { typeLabel: 'Number', icon: 'numbers' },
      date: { typeLabel: 'Date', icon: 'calendar_today' },
      boolean: { typeLabel: 'Yes / No', icon: 'toggle_on' },
      select: { typeLabel: 'Select', icon: 'list' },
      multiselect: { typeLabel: 'Multi Select', icon: 'checklist' },
      multiselect_dropdown: { typeLabel: 'Multi Select', icon: 'checklist' },
    };
    return map[cf] || map.text;
  }
  if (col?.industryFieldType) {
    const t = String(col.industryFieldType).toLowerCase();
    if (t === 'number' || t === 'integer' || t === 'decimal') {
      return { typeLabel: 'Number', icon: 'numbers' };
    }
    if (t === 'datetime') {
      return { typeLabel: 'Date/Time', icon: 'schedule' };
    }
    if (t === 'date') {
      return { typeLabel: 'Date', icon: 'calendar_today' };
    }
    if (t === 'boolean') {
      return { typeLabel: 'Yes / No', icon: 'toggle_on' };
    }
    return { typeLabel: 'Text', icon: 'text_fields' };
  }

  const id = col.id;
  if (id === 'display_name') return { typeLabel: 'Text', icon: 'person' };
  if (id === 'primary_phone') return { typeLabel: 'Phone', icon: 'call' };
  if (id === 'email') return { typeLabel: 'Email', icon: 'mail' };
  if (id === 'website') return { typeLabel: 'URL', icon: 'link' };
  if (id === 'tag_names') return { typeLabel: 'Multi Select', icon: 'label' };
  if (id === 'status_name' || id === 'blacklist_status' || id === 'type') {
    return { typeLabel: 'Status', icon: 'flag' };
  }
  if (id === 'manager_name' || id === 'assigned_user_name') {
    return { typeLabel: 'User', icon: 'person' };
  }
  if (id === 'created_at' || id === 'last_called_at' || id === 'date_of_birth') {
    return { typeLabel: 'Date/Time', icon: 'schedule' };
  }
  if (id === 'call_count_total') return { typeLabel: 'Number', icon: 'numbers' };
  if (id === 'city' || id === 'state' || id === 'country' || id === 'pin_code') {
    return { typeLabel: 'Text', icon: 'location_on' };
  }
  if (
    id === 'campaign_name' ||
    id === 'company' ||
    id === 'source' ||
    id === 'job_title' ||
    id === 'industry' ||
    id === 'tax_id' ||
    id === 'address' ||
    id === 'address_line_2'
  ) {
    return { typeLabel: 'Text', icon: 'text_fields' };
  }
  return { typeLabel: 'Text', icon: 'title' };
}

export function LeadColumnCustomizeModal({
  isOpen,
  onClose,
  applicableColumns,
  visibleColumnIds,
  onSave,
  canAddCustomField = false,
  onCustomFieldCreated,
  title = 'Customize Columns',
  subtitle = 'Choose and arrange the columns you want to see in the table.',
  getDefaults,
  persistVisibleIds,
  /** Column id that stays visible and fixed first (leads: display_name). */
  pinnedColumnId = 'display_name',
  /** Retained for existing call sites; category letters are no longer shown in this modal. */
  standardColumnTagLabel: _standardColumnTagLabel = 'Lead',
  /**
   * When set, gear / chevron on visible rows open the same sort & filter UI as the table column header.
   */
  onOpenColumnSettings,
}) {
  const [visibleOrdered, setVisibleOrdered] = useState([]);
  const [search, setSearch] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [availableExpanded, setAvailableExpanded] = useState(false);

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
    setAvailableExpanded(false);
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
    const hasPinned = applicableColumns.some((c) => c.id === pinnedColumnId);
    const rest = visibleColumnIds.filter((id) => id !== pinnedColumnId);
    const ordered = hasPinned ? [pinnedColumnId, ...rest] : [...visibleColumnIds];
    setVisibleOrdered(ordered);
  }, [isOpen, visibleColumnIds, applicableColumns, pinnedColumnId]);

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

  const hiddenShown = useMemo(() => {
    if (availableExpanded || hiddenFiltered.length <= AVAILABLE_LIST_INITIAL) return hiddenFiltered;
    return hiddenFiltered.slice(0, AVAILABLE_LIST_INITIAL);
  }, [availableExpanded, hiddenFiltered]);

  const hiddenOverflow = Math.max(0, hiddenFiltered.length - AVAILABLE_LIST_INITIAL);

  const hideColumn = (id) => {
    if (id === pinnedColumnId) return;
    setVisibleOrdered((prev) => prev.filter((x) => x !== id));
  };

  const showColumn = (id) => {
    setVisibleOrdered((prev) => {
      if (prev.includes(id)) return prev;
      const head = prev[0] === pinnedColumnId ? [pinnedColumnId] : [];
      const tail = prev[0] === pinnedColumnId ? prev.slice(1) : [...prev];
      return [...head, ...tail, id];
    });
  };

  const handleDragStart = useCallback(
    (e, id) => {
      if (id === pinnedColumnId) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(id);
    },
    [pinnedColumnId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
    e.dataTransfer.dropEffect = types.includes('application/x-callnest-column-add') ? 'copy' : 'move';
  }, []);

  const handleDropOnRow = useCallback(
    (e, targetId) => {
      e.preventDefault();
      const addId = e.dataTransfer.getData('application/x-callnest-column-add');
      if (addId) {
        if (addId === pinnedColumnId) return;
        setVisibleOrdered((prev) => {
          if (prev.includes(addId)) return prev;
          const hasPinned = prev[0] === pinnedColumnId;
          const head = hasPinned ? [pinnedColumnId] : [];
          const tail = hasPinned ? prev.slice(1) : [...prev];
          if (targetId === pinnedColumnId) {
            return [...head, addId, ...tail];
          }
          const targetIdx = tail.indexOf(targetId);
          if (targetIdx < 0) return [...head, ...tail, addId];
          const next = [...tail];
          next.splice(targetIdx, 0, addId);
          return [...head, ...next];
        });
        setDraggingId(null);
        return;
      }

      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === pinnedColumnId || targetId === pinnedColumnId) return;
      if (draggedId === targetId) return;

      setVisibleOrdered((prev) => {
        const head = prev[0] === pinnedColumnId ? [pinnedColumnId] : [];
        const tail = prev[0] === pinnedColumnId ? prev.slice(1) : [...prev];
        const from = tail.indexOf(draggedId);
        const to = tail.indexOf(targetId);
        if (from < 0 || to < 0) return prev;
        const next = [...tail];
        const [removed] = next.splice(from, 1);
        next.splice(to, 0, removed);
        return head.length ? [...head, ...next] : next;
      });
      setDraggingId(null);
    },
    [pinnedColumnId]
  );

  const handleAvailableDragStart = useCallback((e, colId) => {
    e.dataTransfer.setData('application/x-callnest-column-add', colId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleDefault = () => {
    const fn = getDefaults || getDefaultVisibleLeadColumnIds;
    setVisibleOrdered(fn(applicableColumns));
  };

  const handleClearAll = () => {
    const hasPinned = applicableColumns.some((c) => c.id === pinnedColumnId);
    setVisibleOrdered(hasPinned ? [pinnedColumnId] : []);
  };

  const handleSelectAllAvailable = () => {
    if (hiddenFiltered.length === 0) return;
    const hasPinned = applicableColumns.some((c) => c.id === pinnedColumnId);
    setVisibleOrdered((prev) => {
      const want = new Set(prev);
      for (const c of hiddenFiltered) want.add(c.id);
      const ordered = [];
      if (hasPinned && want.has(pinnedColumnId)) ordered.push(pinnedColumnId);
      for (const c of applicableColumns) {
        if (c.id === pinnedColumnId) continue;
        if (want.has(c.id)) ordered.push(c.id);
      }
      if (!hasPinned) {
        return applicableColumns.filter((c) => want.has(c.id)).map((c) => c.id);
      }
      return ordered;
    });
  };

  const handleSave = () => {
    const ensured = visibleOrdered.includes(pinnedColumnId)
      ? visibleOrdered
      : applicableColumns.some((c) => c.id === pinnedColumnId)
        ? [pinnedColumnId, ...visibleOrdered.filter((id) => id !== pinnedColumnId)]
        : visibleOrdered;
    const persist = persistVisibleIds || saveLeadVisibleColumnIds;
    persist(ensured);
    onSave(ensured);
    onClose();
  };

  const visibleCount = visibleOrdered.length;
  const total = applicableColumns.length;
  const availableCount = hiddenFiltered.length;

  const headerIcon = (
    <span className={styles.headerGlyph}>
      <MaterialSymbol name="tune" size="md" />
    </span>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        headerIcon={headerIcon}
        size="xxl"
        closeOnEscape
        footer={
          <ModalFooter className={styles.modalFooter}>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              <MaterialSymbol name="check" size="sm" className={styles.footerBtnIcon} aria-hidden />
              Apply changes
            </Button>
          </ModalFooter>
        }
      >
        <div className={styles.toolbar}>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={setSearch}
            placeholder="Search columns... (press Enter)"
            className={styles.searchGrow}
          />
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.linkAction} onClick={handleDefault}>
              <MaterialSymbol name="refresh" size="sm" className={styles.linkIcon} />
              Reset to default
            </button>
            {canAddCustomField ? (
              <Button type="button" variant="secondary" size="sm" onClick={handleOpenAddField}>
                <MaterialSymbol name="add" size="sm" className={styles.footerBtnIcon} aria-hidden />
                Add custom column
              </Button>
            ) : null}
          </div>
        </div>

        <div className={styles.columnsGrid}>
          <section className={styles.panel}>
            <div className={styles.sectionHeaderRow}>
              <h3 className={styles.sectionTitle}>
                Visible Columns{' '}
                <span className={styles.sectionCount}>
                  ({visibleCount}/{total})
                </span>
              </h3>
              <button type="button" className={styles.linkAction} onClick={handleClearAll}>
                Clear all
              </button>
            </div>
            <p className={styles.sectionHint}>Drag &amp; drop to reorder columns</p>
            <ul
              className={styles.list}
              onDragOver={handleDragOver}
              role="list"
              aria-label="Visible columns"
            >
              {visibleFiltered.map((col) => {
                const locked = col.id === pinnedColumnId;
                const isDragging = draggingId === col.id;
                const pres = getColumnPresentation(col);
                return (
                  <li
                    key={col.id}
                    className={`${styles.rowVisible} ${isDragging ? styles.rowDragging : ''} ${
                      onOpenColumnSettings ? '' : styles.rowVisibleCompact
                    }`.trim()}
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
                        }}
                      >
                        <MaterialSymbol name="drag_indicator" size="sm" className={styles.dragGlyph} />
                      </div>
                    )}
                    <Checkbox
                      checked
                      disabled={locked}
                      onChange={() => {
                        if (!locked) hideColumn(col.id);
                      }}
                      className={styles.rowCheckbox}
                    />
                    <span className={styles.typeIcon} title={pres.typeLabel} aria-hidden>
                      <MaterialSymbol name={pres.icon} size="sm" />
                    </span>
                    <span className={styles.rowLabel}>{col.label}</span>
                    <span className={styles.typePill}>{pres.typeLabel}</span>
                    {onOpenColumnSettings ? (
                      <span className={styles.rowTrailing}>
                        <button
                          type="button"
                          className={styles.rowSettingsBtn}
                          aria-label={`Sort and filter ${col.label}`}
                          title="Sort and filter"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenColumnSettings(col);
                          }}
                        >
                          <MaterialSymbol name="settings" size="sm" className={styles.rowSettingsGlyph} />
                        </button>
                        <button
                          type="button"
                          className={styles.rowSettingsBtn}
                          aria-label={`Sort and filter ${col.label}`}
                          title="Sort and filter"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenColumnSettings(col);
                          }}
                        >
                          <MaterialSymbol name="expand_more" size="sm" className={styles.rowSettingsGlyph} />
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {visibleFiltered.length === 0 ? <p className={styles.empty}>No columns match your search.</p> : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeaderRow}>
              <h3 className={styles.sectionTitle}>
                Available Columns <span className={styles.sectionCount}>({availableCount})</span>
              </h3>
              {availableCount > 0 ? (
                <button type="button" className={styles.linkAction} onClick={handleSelectAllAvailable}>
                  Select all
                </button>
              ) : null}
            </div>
            <p className={styles.sectionHint}>Drag or click to add columns</p>
            {availableCount > 0 ? (
              <>
                <ul className={styles.list} role="list" aria-label="Available columns">
                  {hiddenShown.map((col) => {
                    const pres = getColumnPresentation(col);
                    return (
                      <li
                        key={col.id}
                        className={styles.rowAvailable}
                        role="listitem"
                        draggable
                        onDragStart={(e) => handleAvailableDragStart(e, col.id)}
                      >
                        <Checkbox
                          checked={false}
                          onChange={() => showColumn(col.id)}
                          className={styles.rowCheckbox}
                        />
                        <span className={styles.typeIcon} title={pres.typeLabel} aria-hidden>
                          <MaterialSymbol name={pres.icon} size="sm" />
                        </span>
                        <span className={styles.rowLabel}>{col.label}</span>
                        <span className={styles.typePill}>{pres.typeLabel}</span>
                        <button
                          type="button"
                          className={styles.addIconBtn}
                          onClick={() => showColumn(col.id)}
                          aria-label={`Add ${col.label}`}
                        >
                          <MaterialSymbol name="add" size="sm" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!availableExpanded && hiddenOverflow > 0 ? (
                  <button
                    type="button"
                    className={styles.showMoreBtn}
                    onClick={() => setAvailableExpanded(true)}
                  >
                    Show more ({hiddenOverflow})
                    <MaterialSymbol name="expand_more" size="sm" className={styles.showMoreChevron} />
                  </button>
                ) : null}
              </>
            ) : (
              <p className={styles.emptyMuted}>All available columns are visible.</p>
            )}
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
