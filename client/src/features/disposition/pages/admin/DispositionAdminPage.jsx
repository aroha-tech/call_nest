import React, { useState } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Tabs, TabList, Tab, TabPanel } from '../../../../components/ui/Tabs';
import { IndustriesPage } from './IndustriesPage';
import { DispoTypesPage } from './DispoTypesPage';
import { DispoActionsPage } from './DispoActionsPage';
import { ContactStatusesPage } from './ContactStatusesPage';
import { ContactTemperaturesPage } from './ContactTemperaturesPage';
import { DefaultDispositionsPage } from './DefaultDispositionsPage';
import { DefaultDialingSetsPage } from './DefaultDialingSetsPage';
import { CampaignTypesPage } from './CampaignTypesPage';
import { CampaignStatusesPage } from './CampaignStatusesPage';
import styles from './DispositionAdminPage.module.scss';

const tabs = [
  { key: 'industries', label: 'Industries', component: IndustriesPage },
  { key: 'dispo-types', label: 'Dispo Types', component: DispoTypesPage },
  { key: 'dispo-actions', label: 'Actions', component: DispoActionsPage },
  { key: 'contact-statuses', label: 'Contact Statuses', component: ContactStatusesPage },
  { key: 'contact-temperatures', label: 'Temperatures', component: ContactTemperaturesPage },
  { key: 'default-dispositions', label: 'Default Dispositions', component: DefaultDispositionsPage },
  { key: 'default-dialing-sets', label: 'Default Dialing Sets', component: DefaultDialingSetsPage },
  { key: 'campaign-types', label: 'Campaign Types', component: CampaignTypesPage },
  { key: 'campaign-statuses', label: 'Campaign Statuses', component: CampaignStatusesPage },
];

export function DispositionAdminPage() {
  const [activeTab, setActiveTab] = useState('industries');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Disposition Management"
        description="Global dispositions, defaults, and campaign masters (types/statuses also under System Masters)."
      />

      <Tabs>
        <TabList>
          {tabs.map((tab) => (
            <Tab
              key={tab.key}
              isActive={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>

        {tabs.map((tab) => (
          <TabPanel key={tab.key} isActive={activeTab === tab.key}>
            <tab.component />
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
