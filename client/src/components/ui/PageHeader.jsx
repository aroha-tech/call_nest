import React from 'react';
import styles from './PageHeader.module.scss';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className = '',
}) {
  return (
    <div className={`${styles.header} ${className}`}>
      {breadcrumbs && <div className={styles.breadcrumbs}>{breadcrumbs}</div>}
      <div className={styles.row}>
        <div className={styles.info}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
