import React from 'react';
import { Outlet } from 'react-router-dom';
import styles from './CallsWorkspacePage.module.scss';

/**
 * Shell for /calls/* — sub-routes render their own header; tabs live in each page’s PageHeader.
 */
export function CallsWorkspacePage() {
  return (
    <div className={styles.wrap}>
      <Outlet />
    </div>
  );
}
