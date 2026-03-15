import React from 'react';
import styles from './PlaceholderPage.module.scss';

/**
 * Placeholder for tenant routes not yet implemented.
 * Renders a "Coming soon" message with the given title.
 */
export function PlaceholderPage({ title = 'Coming soon', description }) {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
