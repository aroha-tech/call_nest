import React from 'react';
import { PipelineMetricCard } from '../features/contacts/PipelineMetricCard';
import styles from '../features/contacts/LeadPipelineCards.module.scss';

/**
 * Leads-style dashboard strip for /calls/history.
 * We reuse the same card component + styling for visual consistency.
 */
export function CallHistoryCards({ data, loading }) {
  const items = [
    { label: 'Total Calls', value: data?.totalCalls, variant: 'total' },
    { label: 'Outgoing Calls', value: data?.outgoingCalls, variant: 'new' },
    { label: 'Incoming Calls', value: data?.incomingCalls, variant: 'contacted' },
    { label: 'Connected Calls', value: data?.connectedCalls, variant: 'qualified' },
    { label: 'Missed Calls', value: data?.missedCalls, variant: 'lost' },
  ];

  return (
    <section className={styles.section} aria-label="Call history summary">
      <div className={styles.grid}>
        {items.map((item) => (
          <PipelineMetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            variant={item.variant}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}

