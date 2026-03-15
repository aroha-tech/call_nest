import React from 'react';
import styles from './IconButton.module.scss';

export function IconButton({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  title,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${styles[variant]} ${styles[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
}
