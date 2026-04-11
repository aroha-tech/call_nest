import React from 'react';
import { PipelineCardIcon } from './PipelineCardIcons';
import styles from './LeadPipelineCards.module.scss';

/**
 * Single metric tile for lead/contact dashboard strips (icon + value + label).
 */
export function PipelineMetricCard({ label, value, variant, loading }) {
  const cardClass = `${styles.card} ${styles[`card_${variant}`] ?? ''}`.trim();
  return (
    <div className={cardClass}>
      <div className={styles.cardInner}>
        <div className={`${styles.iconWrap} ${styles[`iconWrap_${variant}`] ?? ''}`.trim()} aria-hidden>
          {loading ? <span className={styles.skeletonIcon} /> : <PipelineCardIcon variant={variant} className={styles.iconGlyph} />}
        </div>
        <div className={styles.cardText}>
          {loading ? (
            <>
              <span className={styles.skeletonValue} />
              <span className={styles.skeletonLabel} />
            </>
          ) : (
            <>
              <span className={styles.value}>{value != null ? value : '—'}</span>
              <span className={styles.label}>{label}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
