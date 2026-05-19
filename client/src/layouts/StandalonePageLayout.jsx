import React from 'react';
import styles from './StandalonePageLayout.module.scss';

export function StandalonePageLayout({ children, variant = 'default' }) {
  const wrapClass = variant === 'dialer' ? styles.wrapDialer : styles.wrap;
  return <div className={wrapClass}>{children}</div>;
}
