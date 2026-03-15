import React from 'react';
import { Button } from './Button';
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
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && actionLabel && (
        <Button onClick={action} variant="primary" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
