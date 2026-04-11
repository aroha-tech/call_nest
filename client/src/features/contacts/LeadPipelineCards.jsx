import React from 'react';
import { PipelineMetricCard } from './PipelineMetricCard';
import styles from './LeadPipelineCards.module.scss';

/**
 * Dashboard-style summary for /leads (counts respect same visibility as the list).
 */
export function LeadPipelineCards({ data, loading }) {
  const items = [
    { label: 'Total Leads', value: data?.total, variant: 'total' },
    { label: 'New Leads', value: data?.newLeads, variant: 'new' },
    { label: 'Contacted Leads', value: data?.contacted, variant: 'contacted' },
    { label: 'Qualified Leads', value: data?.qualified, variant: 'qualified' },
    { label: 'Lost Leads', value: data?.lost, variant: 'lost' },
  ];

  return (
    <section className={styles.section} aria-label="Lead pipeline summary">
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
