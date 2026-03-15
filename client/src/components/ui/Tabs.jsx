import React from 'react';
import styles from './Tabs.module.scss';

export function Tabs({ children, className = '' }) {
  return <div className={`${styles.tabs} ${className}`}>{children}</div>;
}

export function TabList({ children }) {
  return <div className={styles.tabList}>{children}</div>;
}

export function Tab({ children, isActive, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`${styles.tab} ${isActive ? styles.active : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function TabPanel({ children, isActive }) {
  if (!isActive) return null;
  return <div className={styles.panel}>{children}</div>;
}
