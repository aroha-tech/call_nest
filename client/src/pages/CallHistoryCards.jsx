import React from 'react';
import { PipelineMetricCard } from '../features/contacts/PipelineMetricCard';
import styles from '../features/contacts/LeadPipelineCards.module.scss';

function formatDurationShort(totalSeconds) {
  const s = Number(totalSeconds ?? 0);
  if (!Number.isFinite(s) || s <= 0) return '0s';
  const sec = Math.floor(s);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, '0')}s`;
  return `${ss}s`;
}

/**
 * Leads-style dashboard strip for /calls/history.
 * We reuse the same card component + styling for visual consistency.
 */
export function CallHistoryCards({ data, loading }) {
  const items = [
    { label: 'Total Calls', value: data?.totalCalls, variant: 'total' },
    { label: 'Outgoing Calls', value: data?.outgoingCalls, variant: 'new' },
    { label: 'Incoming Calls', value: data?.incomingCalls, variant: 'contacted' },
    { label: 'Missed Calls', value: data?.missedCalls, variant: 'lost' },
    { label: 'Connected Calls', value: data?.connectedCalls, variant: 'qualified' },
    { label: 'Not Connected Calls', value: data?.notConnectedCalls, variant: 'pending' },
    { label: "Today’s Calls", value: data?.todaysCalls, variant: 'contacted' },
    {
      label: 'Call Duration',
      value: data?.callDurationSec != null ? formatDurationShort(data.callDurationSec) : '—',
      variant: 'total',
    },
    {
      label: 'Average Call Time',
      value: data?.averageCallTimeSec != null ? formatDurationShort(data.averageCallTimeSec) : '—',
      variant: 'qualified',
    },
    { label: 'Follow-up Calls', value: data?.followUpCalls, variant: 'new' },
    { label: 'Scheduled Calls', value: data?.scheduledCalls, variant: 'pending' },
  ];

  return (
    <section className={styles.section} aria-label="Call history summary">
      <div className={styles.scrollRow} role="region" aria-label="Call history summary metrics">
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

