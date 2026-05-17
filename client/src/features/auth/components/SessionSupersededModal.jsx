import React from 'react';
import { Modal, ModalFooter } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { MaterialSymbol } from '../../../components/ui/MaterialSymbol';
/**
 * One-time prompt when this account signed in elsewhere. Any action goes to login.
 */
export function SessionSupersededModal({ isOpen, onDismiss }) {
  const goToLogin = () => {
    onDismiss();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={goToLogin}
      title="Signed in elsewhere"
      subtitle="This account is open on another device."
      size="sm"
      closeOnOverlay={false}
      closeOnEscape={false}
      headerIcon={<MaterialSymbol name="devices" size="md" />}
      footer={
        <ModalFooter>
          <Button variant="primary" onClick={goToLogin}>
            <MaterialSymbol name="login" size="sm" />
            Sign in again
          </Button>
        </ModalFooter>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        Sign in again to use this device.
      </p>
    </Modal>
  );
}
