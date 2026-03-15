import React from 'react';
import styles from './Spinner.module.scss';

/**
 * Loading spinner in small or medium size.
 */
export function Spinner({ size = 'md', className = '' }) {
  const classNames = [styles.spinner, styles[size], className].filter(Boolean).join(' ');
  return <div className={classNames} role="status" aria-label="Loading" />;
}
