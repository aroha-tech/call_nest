import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { DashboardFlowchart } from '../components/dashboard/DashboardFlowchart';
import styles from './WorkflowMapPage.module.scss';

/**
 * Dedicated Workflow screen: process map only (sidebar item "Workflow").
 * @param {{ variant: 'tenant' | 'platform' }} props
 */
export function WorkflowMapPage({ variant }) {
  const isPlatform = variant === 'platform';

  return (
    <div className={styles.wrapper}>
      <div className={styles.intro}>
        <PageHeader
          title="Workflow"
          description={
            isPlatform
              ? 'Visual map of how tenants, system masters, default dialer assets, and platform users fit together.'
              : 'Visual map of how leads, contacts, campaigns, dialer configuration, and channels connect in your workspace.'
          }
        />
      </div>
      <DashboardFlowchart variant={variant} compact />
    </div>
  );
}
