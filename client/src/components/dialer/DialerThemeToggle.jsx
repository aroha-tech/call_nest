import React from 'react';
import styles from './DialerThemeToggle.module.scss';

/**
 * @param {{ theme: 'light' | 'dark', onChange: (t: 'light' | 'dark') => void, className?: string }} props
 */
export function DialerThemeToggle({ theme, onChange, className = '' }) {
  return (
    <div className={`${styles.toggle} ${className}`.trim()} role="group" aria-label="Dialer appearance">
      <button
        type="button"
        className={`${styles.btn} ${theme === 'light' ? styles.btnActive : ''}`.trim()}
        onClick={() => onChange('light')}
        aria-pressed={theme === 'light'}
        title="Light mode"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
        <span className={styles.label}>Light</span>
      </button>
      <button
        type="button"
        className={`${styles.btn} ${theme === 'dark' ? styles.btnActive : ''}`.trim()}
        onClick={() => onChange('dark')}
        aria-pressed={theme === 'dark'}
        title="Dark mode"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.label}>Dark</span>
      </button>
    </div>
  );
}
