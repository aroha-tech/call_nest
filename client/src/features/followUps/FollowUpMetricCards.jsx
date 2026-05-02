import React from 'react';
import { FollowUpMetricCardIcon } from './FollowUpMetricCardIcons';
import styles from './FollowUpMetricCards.module.scss';

function FollowUpMetricCard({ label, value, variant, loading }) {
  const cardClass = `${styles.card} ${styles[`card_${variant}`] ?? ''}`.trim();
  return (
    <div className={cardClass}>
      <div className={styles.cardInner}>
        <div className={`${styles.iconWrap} ${styles[`iconWrap_${variant}`] ?? ''}`.trim()} aria-hidden>
          {loading ? <span className={styles.skeletonIcon} /> : <FollowUpMetricCardIcon variant={variant} className={styles.iconGlyph} />}
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

export function FollowUpMetricCards({ data, loading }) {
  const items = [
    { label: 'Total follow-ups', value: data?.total, variant: 'total' },
    { label: 'Pending', value: data?.pending, variant: 'pending' },
    { label: 'Upcoming', value: data?.upcoming, variant: 'upcoming' },
    { label: 'Completed', value: data?.completed, variant: 'completed' },
    { label: 'Cancelled', value: data?.cancelled, variant: 'cancelled' },
    { label: 'Missed', value: data?.missed, variant: 'missed' },
    { label: "Today's follow-ups", value: data?.today, variant: 'today' },
  ];

  return (
    <section className={styles.section} aria-label="Follow-up summary">
      <div className={styles.grid7}>
        {items.map((item) => (
          <FollowUpMetricCard key={item.variant} label={item.label} value={item.value} variant={item.variant} loading={loading} />
        ))}
      </div>
    </section>
  );
}
