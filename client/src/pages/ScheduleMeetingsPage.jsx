import React from 'react';
import { Alert } from '../components/ui/Alert';
import listStyles from '../components/admin/adminDataList.module.scss';
import { useEmailModuleEnabled } from '../hooks/useEmailModuleEnabled';
import { MeetingsPage } from './MeetingsPage';

export function ScheduleMeetingsPage() {
  const { emailModuleEnabled, loading } = useEmailModuleEnabled();
  if (loading) return null;
  if (emailModuleEnabled === false) {
    return (
      <div className={listStyles.page}>
        <Alert variant="info">Meetings are disabled for this tenant (Email module is not enabled).</Alert>
      </div>
    );
  }
  return <MeetingsPage />;
}

