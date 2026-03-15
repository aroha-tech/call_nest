import React from 'react';
import styles from './Alert.module.scss';

/**
 * Alert message for success, error, or info.
 */
export function Alert({ variant = 'info', title, children, className = '' }) {
  const classNames = [styles.alert, styles[variant], className].filter(Boolean).join(' ');
  return (
    <div className={classNames} role="alert">
      {title && <strong className={styles.title}>{title}</strong>}
      {children && <span className={styles.body}>{children}</span>}
    </div>
  );
}
