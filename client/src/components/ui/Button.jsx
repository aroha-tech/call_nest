import React from 'react';
import { Spinner } from './Spinner';
import styles from './Button.module.scss';

/**
 * Reusable button with loading state and variants.
 */
export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  children,
  className = '',
  ...props
}) {
  const classNames = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size="sm" className={styles.spinner} />
          <span className={styles.label}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
