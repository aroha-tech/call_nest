import React from 'react';
import styles from './Badge.module.scss';

export function Badge({ 
  children, 
  variant = 'default',
  size = 'sm',
  className = '' 
}) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${styles[size]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ isActive }) {
  return (
    <Badge variant={isActive ? 'success' : 'muted'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}
