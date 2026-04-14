import React from 'react';
import { MeetingCardIcon } from './MeetingCardIcons';
import styles from './MeetingMetricCards.module.scss';

function MeetingMetricCard({ label, value, variant, loading }) {
  const cardClass = `${styles.card} ${styles[`card_${variant}`] ?? ''}`.trim();
  return (
    <div className={cardClass}>
      <div className={styles.cardInner}>
        <div className={`${styles.iconWrap} ${styles[`iconWrap_${variant}`] ?? ''}`.trim()} aria-hidden>
          {loading ? <span className={styles.skeletonIcon} /> : <MeetingCardIcon variant={variant} className={styles.iconGlyph} />}
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

/**
 * Dashboard-style summary for Meetings (counts follow same filters as metrics API).
 */
export function MeetingMetricCards({ data, loading }) {
  const items = [
    { label: 'Total Meetings', value: data?.total, variant: 'total' },
    { label: 'Scheduled', value: data?.scheduled, variant: 'scheduled' },
    { label: 'Upcoming', value: data?.upcoming, variant: 'upcoming' },
    { label: 'Completed', value: data?.completed, variant: 'completed' },
    { label: 'Cancelled', value: data?.cancelled, variant: 'cancelled' },
    { label: 'Rescheduled', value: data?.rescheduled, variant: 'rescheduled' },
    { label: "Today's meetings", value: data?.today, variant: 'today' },
  ];

  return (
    <section className={styles.section} aria-label="Meeting summary">
      <div className={styles.grid7}>
        {items.map((item) => (
          <MeetingMetricCard key={item.variant} label={item.label} value={item.value} variant={item.variant} loading={loading} />
        ))}
      </div>
    </section>
  );
}
