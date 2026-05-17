import React, { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { PlatformTelephonyDefaultsForm } from '../components/telephony/PlatformTelephonyDefaultsForm';
import styles from './PlatformDefaultSettingsPage.module.scss';

export function PlatformDefaultSettingsPage() {
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('telephony');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Default settings"
        subtitle="Platform-wide defaults used when tenants have no plan or override."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={styles.tabsCard}>
        <Tabs>
          <TabList>
            <Tab isActive={tab === 'telephony'} onClick={() => setTab('telephony')}>
              Telephony defaults
            </Tab>
          </TabList>
          <TabPanel isActive={tab === 'telephony'}>
            <PlatformTelephonyDefaultsForm onError={setError} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
