import React from 'react';
import { Button } from '../../../components/ui/Button';
import { MaterialSymbol } from '../../../components/ui/MaterialSymbol';
import authUi from './authFormShared.module.scss';
import styles from './LoginSessionConflictModal.module.scss';

/**
 * Shown when credentials are valid but the account already has an active session elsewhere.
 * Styled to match the auth (login) panel — not the global app modal.
 */
export function LoginSessionConflictModal({
  isOpen,
  onStay,
  onTakeOver,
  loading = false,
}) {
  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-conflict-title"
      aria-describedby="session-conflict-desc"
    >
      <div className={styles.panel}>
        <div className={styles.iconWrap} aria-hidden>
          <MaterialSymbol name="devices" size="lg" />
        </div>
        <h2 id="session-conflict-title" className={styles.title}>
          Already signed in
        </h2>
        <p id="session-conflict-desc" className={styles.message}>
          This account is open on another device. Sign in here to end that session.
        </p>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="primary"
            className={`${styles.actionBtn} ${authUi.authSubmit}`}
            onClick={onTakeOver}
            loading={loading}
            disabled={loading}
          >
            <MaterialSymbol name="login" size="sm" />
            Sign in here
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={styles.cancelBtn}
            onClick={onStay}
            disabled={loading}
          >
            <MaterialSymbol name="close" size="sm" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
