import React from 'react';
import { Modal } from '../components/ui/Modal';
import { DialSessionsFilterPanel } from './DialSessionsFilterPanel';

export function DialSessionsFilterModal({
  isOpen,
  onClose,
  showCreatedByFilter,
  createdByOptions,
  values,
  onApply,
  onResetAll,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filters" size="xl" closeOnOverlay closeOnEscape>
      <DialSessionsFilterPanel
        suppressHeading
        showCreatedByFilter={showCreatedByFilter}
        createdByOptions={createdByOptions}
        values={values}
        onResetAll={onResetAll}
        onApply={(payload) => {
          onApply?.(payload);
          onClose?.();
        }}
      />
    </Modal>
  );
}
