import React from 'react';
import { PipelineMetricCard } from './PipelineMetricCard';
import styles from './LeadPipelineCards.module.scss';

/**
 * Dashboard-style summary for /contacts (counts respect same visibility as the list).
 */
export function ContactDashboardCards({ data, loading }) {
  const items = [
    { label: 'Total Contacts', value: data?.totalContacts, variant: 'total' },
    { label: 'Contacted', value: data?.contacted, variant: 'contacted' },
    { label: 'Follow-ups Pending', value: data?.followUpsPending, variant: 'pending' },
    { label: 'Converted Contacts', value: data?.convertedContacts, variant: 'convertedContact' },
    { label: 'Lost Contacts', value: data?.lostContacts, variant: 'lost' },
  ];

  return (
    <section className={styles.section} aria-label="Contact summary">
      <div className={styles.grid5}>
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
