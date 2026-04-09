import React from 'react';
import styles from './StandalonePageLayout.module.scss';

export function StandalonePageLayout({ children }) {
  return <div className={styles.wrap}>{children}</div>;
}

