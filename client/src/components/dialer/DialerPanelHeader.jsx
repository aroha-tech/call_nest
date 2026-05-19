import React from 'react';
import styles from './DialerPanelHeader.module.scss';

/**
 * @param {{ icon?: React.ReactNode, title: string, meta?: React.ReactNode, badge?: React.ReactNode, className?: string }} props
 */
export function DialerPanelHeader({ icon, title, meta, badge, className = '' }) {
  return (
    <header className={`${styles.head} ${className}`.trim()}>
      <div className={styles.left}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.title}>{title}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </div>
      {meta ? <div className={styles.meta}>{meta}</div> : null}
    </header>
  );
}
