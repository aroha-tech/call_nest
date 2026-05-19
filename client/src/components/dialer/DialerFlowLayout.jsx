import React from 'react';
import { DialerThemeToggle } from './DialerThemeToggle';
import styles from './DialerFlowLayout.module.scss';

/** Full-screen dialer shell: brand, inline credits, actions + theme (top right). */
export function DialerFlowLayout({
  theme,
  onThemeChange,
  subtitle,
  headerActions,
  credits,
  children,
  className = '',
}) {
  return (
    <div className={`${styles.root} ${className}`.trim()} data-dialer-theme={theme}>
      <header className={styles.appBar}>
        <div className={styles.appBarBrand}>
          <span className={styles.brandMark}>Dialer</span>
          {subtitle ? (
            <>
              <span className={styles.brandDivider} aria-hidden />
              <span className={styles.brandSubtitle}>{subtitle}</span>
            </>
          ) : null}
        </div>
        {credits ? <div className={styles.appBarCenter}>{credits}</div> : null}
        <div className={styles.appBarActions}>
          {headerActions}
          <DialerThemeToggle theme={theme} onChange={onThemeChange} className={styles.themeToggle} />
        </div>
      </header>
      <main className={styles.body}>{children}</main>
    </div>
  );
}
