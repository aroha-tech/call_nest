import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Alert } from '../../components/ui/Alert';
import { contactsAPI } from '../../services/contactsAPI';
import { callsAPI } from '../../services/callsAPI';
import { dialerSessionsAPI } from '../../services/dialerSessionsAPI';
import styles from './ExportCsvModal.module.scss';

function buildInitialIncludedOrder(applicableColumns, visibleColumnIds) {
  if (!Array.isArray(applicableColumns) || applicableColumns.length === 0) return [];
  const vis = new Set(visibleColumnIds || []);
  const ordered = applicableColumns.map((c) => c.id).filter((id) => vis.has(id));
  if (ordered.length) return ordered;
  return applicableColumns.slice(0, Math.min(8, applicableColumns.length)).map((c) => c.id);
}

export function ExportCsvModal({
  isOpen,
  onClose,
  type,
  /** `'contacts'` (default) uses contacts API; `'calls'` uses call history export. */
  exportEntity = 'contacts',
  /** Same shape as contactsAPI.getAll / list-ids filters (search, filter_*, column_filters, …). */
  listQueryParams,
  applicableColumns,
  visibleColumnIds,
  selectedIds,
  totalMatching = 0,
  allowSelectedScope = true,
}) {
  const [scope, setScope] = useState('filtered');
  const [includedOrder, setIncludedOrder] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setScope('filtered');
    setError('');
    setBusy(false);
    setIncludedOrder(buildInitialIncludedOrder(applicableColumns, visibleColumnIds));
    setDraggingId(null);
  }, [isOpen, applicableColumns, visibleColumnIds]);

  const idToLabel = useMemo(() => {
    const m = new Map();
    for (const c of applicableColumns || []) {
      m.set(c.id, c.label || 'Field');
    }
    return m;
  }, [applicableColumns]);

  const toggleColumn = useCallback((id) => {
    setIncludedOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  const handleDragStart = useCallback((e, id) => {
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

  const handleDropOnOrderRow = useCallback((e, targetId) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!draggedId || draggedId === targetId) return;
    setIncludedOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setIncludedOrder((applicableColumns || []).map((c) => c.id));
  }, [applicableColumns]);

  const clearAll = useCallback(() => {
    setIncludedOrder([]);
  }, []);

  const handleExport = async () => {
    setError('');
    if (!includedOrder.length) {
      setError('Choose at least one column.');
      return;
    }
    if (scope === 'selected' && (!selectedIds || selectedIds.size === 0)) {
      setError('Select at least one row, or switch to “All matching current filters”.');
      return;
    }

    setBusy(true);
    try {
      const body = {
        export_scope: scope,
        columns: includedOrder,
      };
      if (scope === 'selected') {
        body.selected_ids = [...selectedIds];
      }

      let res;
      if (exportEntity === 'calls') {
        res = await callsAPI.exportCsvPost(listQueryParams || {}, body);
      } else if (exportEntity === 'dialer_sessions') {
        res = await dialerSessionsAPI.exportCsvPost(listQueryParams || {}, body);
      } else {
        res = await contactsAPI.exportCsvPost(listQueryParams || {}, body);
      }
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        exportEntity === 'calls'
          ? 'call_history_export.csv'
          : exportEntity === 'dialer_sessions'
            ? 'dial_sessions_export.csv'
            : `${type === 'lead' ? 'leads' : 'contacts'}_export.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Export failed.';
      setError(typeof msg === 'string' ? msg : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const selectedDisabled = !allowSelectedScope || !selectedIds || selectedIds.size === 0;
  const noun =
    exportEntity === 'calls' ? 'call history' : type === 'lead' ? 'leads' : 'contacts';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        exportEntity === 'calls'
          ? 'Export call history (CSV)'
          : exportEntity === 'dialer_sessions'
            ? 'Export dial sessions (CSV)'
            : `Export ${noun} (CSV)`
      }
      size="lg"
      closeOnOverlay
      closeOnEscape
      footer={
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void handleExport()} disabled={busy}>
            {busy ? 'Exporting…' : 'Download CSV'}
          </Button>
        </ModalFooter>
      }
    >
      <div className={styles.body}>
        {error ? (
          <Alert variant="error" className={styles.alert}>
            {error}
          </Alert>
        ) : null}

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Rows to include</legend>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'filtered'}
              onChange={() => setScope('filtered')}
            />
            <span>
              All rows matching current filters and search
              {totalMatching > 0 ? (
                <span className={styles.hint}> ({totalMatching.toLocaleString()} in this list)</span>
              ) : null}
            </span>
          </label>
          <label className={`${styles.radioRow} ${selectedDisabled ? styles.radioRowDisabled : ''}`}>
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'selected'}
              disabled={selectedDisabled}
              onChange={() => setScope('selected')}
            />
            <span>
              Only selected rows
              {selectedIds && selectedIds.size > 0 ? (
                <span className={styles.hint}> ({selectedIds.size} selected)</span>
              ) : (
                <span className={styles.hint}> — select rows in the table first</span>
              )}
            </span>
          </label>
        </fieldset>

        <div className={styles.columnsHeader}>
          <span className={styles.legend}>Columns in the file</span>
          <div className={styles.columnsHeaderActions}>
            <Button type="button" size="sm" variant="secondary" onClick={selectAll}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearAll}>
              Clear
            </Button>
          </div>
        </div>

        <p className={styles.help}>
          Check the fields to export. Drag the grip on the right to set column order in the CSV.
        </p>

        <div className={styles.columnsGrid}>
          <div className={styles.checklist}>
            {(applicableColumns || []).map((col) => (
              <div key={col.id} className={styles.checkRow}>
                <Checkbox
                  id={`export-csv-col-${col.id}`}
                  label={col.label || 'Field'}
                  checked={includedOrder.includes(col.id)}
                  onChange={() => toggleColumn(col.id)}
                />
              </div>
            ))}
          </div>

          <div className={styles.orderPanel}>
            <div className={styles.orderTitle}>Order (top = first column)</div>
            <ul className={styles.orderList} onDragOver={handleDragOver}>
              {includedOrder.map((id) => {
                const isDragging = draggingId === id;
                return (
                  <li
                    key={id}
                    className={`${styles.orderItem} ${isDragging ? styles.orderItemDragging : ''}`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnOrderRow(e, id)}
                  >
                    <span className={styles.orderLabel}>{idToLabel.get(id) || id}</span>
                    <div
                      role="button"
                      tabIndex={0}
                      className={styles.dragHandle}
                      draggable
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${idToLabel.get(id) || id}`}
                      onDragStart={(e) => handleDragStart(e, id)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className={styles.dragGrip} aria-hidden>
                        ⠿
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {includedOrder.length === 0 ? <p className={styles.orderEmpty}>No columns selected</p> : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
