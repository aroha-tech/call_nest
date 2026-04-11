import React, { useState } from 'react';
import { Modal, ModalFooter, ConfirmModal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import styles from './BrowseSavedFiltersModal.module.scss';

export function BrowseSavedFiltersModal({ isOpen, onClose, filters = [], onApply, onEdit, onDelete }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const runDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await onDelete?.(pendingDelete);
      setPendingDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Saved filters" size="md" closeOnEscape>
        <div className={styles.body}>
          {filters.length === 0 ? (
            <p className={styles.empty}>No saved filters yet. Use “Add new filter” and save from the filter dialog.</p>
          ) : (
            <ul className={styles.list}>
              {filters.map((f) => (
                <li key={f.id} className={styles.row}>
                  <span className={styles.name}>{f.name}</span>
                  <div className={styles.rowActions}>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onEdit?.(f)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        onApply?.(f);
                        onClose();
                      }}
                    >
                      Apply
                    </Button>
                    <Button type="button" size="sm" variant="danger" onClick={() => setPendingDelete(f)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={!!pendingDelete}
        onClose={() => !deleteLoading && setPendingDelete(null)}
        onConfirm={() => void runDelete()}
        title="Delete saved filter"
        message={
          pendingDelete
            ? `Remove “${String(pendingDelete.name || '').trim() || 'this filter'}”? This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleteLoading}
      />
    </>
  );
}
