import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '../../../../hooks/usePermission';
import { PERMISSIONS } from '../../../../utils/permissionUtils';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Tabs, TabList, Tab, TabPanel } from '../../../../components/ui/Tabs';
import { DispositionsPage } from './DispositionsPage';
import { DialingSetsPage } from './DialingSetsPage';
import styles from './DispositionSettingsPage.module.scss';

const TAB_FROM_PATH = {
  '/workflow/dispositions': 'dispositions',
  '/workflow/dialing-sets': 'dialing-sets',
};

export function DispositionSettingsPage() {
  const { can } = usePermissions();
  const readOnly = !can(PERMISSIONS.DISPOSITIONS_MANAGE);
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = TAB_FROM_PATH[location.pathname];
  const [activeTab, setActiveTab] = useState(pathTab || 'dispositions');

  useEffect(() => {
    if (pathTab && pathTab !== activeTab) setActiveTab(pathTab);
  }, [pathTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const path = tab === 'dialing-sets' ? '/workflow/dialing-sets' : '/workflow/dispositions';
    navigate(path, { replace: true });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Disposition Settings"
        description={
          readOnly
            ? 'View dispositions and dialing sets. Only administrators can add or edit.'
            : 'Configure dispositions and dialing sets for your team'
        }
      />

      <Tabs>
        <TabList>
          <Tab isActive={activeTab === 'dispositions'} onClick={() => handleTabChange('dispositions')}>
            Dispositions
          </Tab>
          <Tab isActive={activeTab === 'dialing-sets'} onClick={() => handleTabChange('dialing-sets')}>
            Dialing Sets
          </Tab>
        </TabList>

        <TabPanel isActive={activeTab === 'dispositions'}>
          <DispositionsPage readOnly={readOnly} />
        </TabPanel>

        <TabPanel isActive={activeTab === 'dialing-sets'}>
          <DialingSetsPage readOnly={readOnly} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
