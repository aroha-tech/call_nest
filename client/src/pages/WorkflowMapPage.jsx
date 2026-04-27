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
          titleIcon="account_tree"
          description={
            isPlatform
              ? 'How tenants, masters, dialer defaults, and platform users connect.'
              : 'How leads, contacts, campaigns, dialer, and channels connect in your workspace.'
          }
        />
      </div>
      <DashboardFlowchart variant={variant} compact />
    </div>
  );
}
