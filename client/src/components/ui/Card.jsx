import React from 'react';
import styles from './Card.module.scss';

/**
 * Container card with optional padding and subtle shadow.
 */
export function Card({ children, className = '', padding = true }) {
  const classNames = [
    styles.card,
    padding && styles.padded,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={classNames}>{children}</div>;
}
