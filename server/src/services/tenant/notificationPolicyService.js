const ROLE_BASED_NOTIFICATION_POLICY = {
  calling: {
    callback_overdue: ['admin', 'manager', 'agent'],
    session_followup_required: ['admin', 'manager', 'agent'],
  },
  disposition: {
    critical_status_changed: ['admin', 'manager'],
    overdue_disposition: ['admin', 'manager', 'agent'],
  },
  contacts: {
    contact_assigned: ['admin', 'manager', 'agent'],
    campaign_assigned: ['admin', 'manager', 'agent'],
    owner_changed: ['admin', 'manager'],
  },
  meetings: {
    meeting_created: ['admin', 'manager', 'agent'],
    meeting_rescheduled: ['admin', 'manager', 'agent'],
    meeting_reminder: ['admin', 'manager', 'agent'],
  },
  tasks: {
    task_assigned: ['admin', 'manager', 'agent'],
    task_due_soon: ['admin', 'manager', 'agent'],
    task_overdue: ['admin', 'manager', 'agent'],
  },
  email: {
    campaign_completed: ['admin', 'manager'],
    campaign_failed: ['admin', 'manager'],
    account_issue: ['admin', 'manager'],
  },
  deals: {
    deal_created: ['admin', 'manager'],
  },
};

export function resolveRolesForEvent(moduleKey, eventType) {
  const modulePolicy = ROLE_BASED_NOTIFICATION_POLICY[String(moduleKey || '').toLowerCase()] || {};
  const roles = modulePolicy[String(eventType || '').toLowerCase()];
  if (Array.isArray(roles) && roles.length > 0) return [...new Set(roles)];
  return ['admin', 'manager'];
}

