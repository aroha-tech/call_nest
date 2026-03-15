import React from 'react';
import { Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.scss';

/**
 * Centered layout for login/register with subtle gradient and card.
 */
export function AuthLayout() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.bg} />
      <main className={styles.main}>
        <div className={styles.logoWrap}>
          <span className={styles.logo}>Call Nest</span>
        </div>
        <div className={styles.cardWrap}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
