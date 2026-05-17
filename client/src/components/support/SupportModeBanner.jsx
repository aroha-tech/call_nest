import React from 'react';
import { useAppSelector } from '../../app/hooks';
import { selectIsImpersonation, selectUser } from '../../features/auth/authSelectors';
import { useExitSupport } from '../../hooks/useExitSupport';
import { Button } from '../ui/Button';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import styles from './SupportModeBanner.module.scss';

export function SupportModeBanner() {
  const isImpersonation = useAppSelector(selectIsImpersonation);
  const user = useAppSelector(selectUser);
  const exitSupport = useExitSupport();

  if (!isImpersonation) return null;

  const label = user?.name || user?.email || 'user';
  const role = user?.role ? String(user.role).charAt(0).toUpperCase() + String(user.role).slice(1) : '';

  return (
    <div className={styles.banner} role="status">
      <div className={styles.inner}>
        <MaterialSymbol name="support_agent" size="sm" className={styles.icon} />
        <span className={styles.text}>
          Support mode — viewing as <strong>{label}</strong>
          {role ? ` (${role})` : ''}
        </span>
        <Button type="button" variant="secondary" size="sm" className={styles.exitBtn} onClick={exitSupport}>
          Exit support
        </Button>
      </div>
    </div>
  );
}
