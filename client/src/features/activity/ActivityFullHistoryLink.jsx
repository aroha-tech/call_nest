import React from 'react';
import { Link } from 'react-router-dom';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import dashStyles from '../../pages/TenantDashboardPage.module.scss';

/** Footer CTA from the dashboard “Recent activity” card (preserves CRM/Calls tab via query). */
export function ActivityFullHistoryLink({ tab } = {}) {
  const suffix = tab && tab !== 'all' ? `?tab=${encodeURIComponent(tab)}` : '';
  return (
    <div className={dashStyles.activityFeedFooter}>
      <Link to={`/activities${suffix}`} className={dashStyles.activityHistoryLink}>
        <MaterialSymbol name="history" size="sm" className={dashStyles.activityHistoryLinkIcon} />
        <span>See full activity history</span>
      </Link>
    </div>
  );
}
