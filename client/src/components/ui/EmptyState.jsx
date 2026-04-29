import React from 'react';
import { Button } from './Button';
import { InfoHelpIcon } from './InfoHelpIcon';
import styles from './EmptyState.module.scss';

export function EmptyState({
  icon = '📋',
  title,
  description,
  action,
  actionLabel,
  className = '',
}) {
  return (
    <div className={`${styles.empty} ${className}`}>
      <span className={styles.icon}>{icon}</span>
      <h3 className={styles.title}>
        <span>{title}</span>
        <InfoHelpIcon title="More details" modalTitle={title} message={description} className={styles.titleInfoBtn} />
      </h3>
      {action && actionLabel && (
        <Button onClick={action} variant="primary" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
