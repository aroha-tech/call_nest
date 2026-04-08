import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { usePermissions } from './usePermission';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { useEmailModuleEnabled } from './useEmailModuleEnabled';
import { PERMISSIONS } from '../utils/permissionUtils';

/**
 * Super Admin (Platform Admin) navigation items.
 */
const PLATFORM_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/', section: 'Main' },
  { key: 'tenants', label: 'Tenants', path: '/admin/tenants' },
  { key: 'users', label: 'Users', path: '/admin/users' },
  { key: 'workflow-map', label: 'Workflow', path: '/admin/workflow/map' },
  {
    key: 'masters',
    label: 'System Masters',
    section: 'Masters',
    children: [
      { key: 'industries', label: 'Industries', path: '/admin/masters/industries' },
      { key: 'dispo-types', label: 'Dispo Types', path: '/admin/masters/dispo-types' },
      { key: 'actions', label: 'Actions', path: '/admin/masters/actions' },
      { key: 'contact-statuses', label: 'Contact Statuses', path: '/admin/masters/contact-statuses' },
      { key: 'temperatures', label: 'Temperatures', path: '/admin/masters/temperatures' },
      { key: 'template-variables', label: 'Template Variables', path: '/admin/masters/template-variables' },
    ],
  },
  {
    key: 'dialer-workflow',
    label: 'Dialer Workflow',
    section: 'Workflow',
    children: [
      { key: 'default-dispositions', label: 'Default Dispositions', path: '/admin/workflow/default-dispositions' },
      { key: 'default-dialing-sets', label: 'Default Dialing Sets', path: '/admin/workflow/default-dialing-sets' },
    ],
  },
];

/**
 * Tenant Admin navigation items.
 */
const TENANT_ADMIN_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/', permission: PERMISSIONS.DASHBOARD_VIEW, section: 'Main' },
  { key: 'users', label: 'Users', path: '/users', permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM] },
  { key: 'leads', label: 'Leads', path: '/leads', permission: PERMISSIONS.LEADS_READ },
  {
    key: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    permissions: [PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ],
  },
  { key: 'contacts', label: 'Contacts', path: '/contacts', permission: PERMISSIONS.CONTACTS_READ },
  { key: 'deals', label: 'Deals', path: '/deals', permission: PERMISSIONS.PIPELINES_MANAGE },
  { key: 'dialer', label: 'Dialer', path: '/dialer', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'call-history', label: 'Call history', path: '/calls/history', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'reports', label: 'Reports', path: '/reports', permission: PERMISSIONS.REPORTS_VIEW },
  { key: 'workflow-map', label: 'Workflow', path: '/workflow/map', permission: PERMISSIONS.DASHBOARD_VIEW },
  {
    key: 'dialer-workflow',
    label: 'Dialer Workflow',
    section: 'Dialer',
    permission: PERMISSIONS.DISPOSITIONS_MANAGE,
    children: [
      { key: 'dispositions', label: 'Dispositions', path: '/workflow/dispositions', permission: PERMISSIONS.DISPOSITIONS_MANAGE },
      { key: 'dialing-sets', label: 'Dialing Sets', path: '/workflow/dialing-sets', permission: PERMISSIONS.DISPOSITIONS_MANAGE },
    ],
  },
  {
    key: 'dialer-resources',
    label: 'Dialer Resources',
    permission: PERMISSIONS.SETTINGS_MANAGE,
    children: [
      { key: 'dialer-scripts', label: 'Dialer Scripts', path: '/resources/dialer-scripts', permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    section: 'Messaging',
    permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
    children: [
      {
        key: 'whatsapp-accounts',
        label: 'Accounts',
        path: '/whatsapp/accounts',
        permissions: [
          PERMISSIONS.WHATSAPP_TEMPLATES_MANAGE,
          PERMISSIONS.WHATSAPP_ACCOUNTS_MANAGE,
          PERMISSIONS.SETTINGS_MANAGE,
        ],
      },
      {
        key: 'whatsapp-templates',
        label: 'Templates',
        path: '/whatsapp/templates',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
      {
        key: 'whatsapp-messages',
        label: 'Messages',
        path: '/whatsapp/messages',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
      {
        key: 'whatsapp-logs',
        label: 'API Logs',
        path: '/whatsapp/logs',
        permissions: [PERMISSIONS.WHATSAPP_LOGS_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
    children: [
      {
        key: 'email-sent',
        label: 'Sent',
        path: '/email/sent',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'email-templates',
        label: 'Templates',
        path: '/email/templates',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'email-accounts',
        label: 'Accounts',
        path: '/email/accounts',
        permissions: [
          PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
          PERMISSIONS.EMAIL_ACCOUNTS_MANAGE,
          PERMISSIONS.SETTINGS_MANAGE,
        ],
      },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    section: 'Workspace',
    permission: PERMISSIONS.SETTINGS_MANAGE,
    children: [
      { key: 'settings-main', label: 'Company', path: '/settings', permission: PERMISSIONS.SETTINGS_MANAGE },
      { key: 'contact-fields', label: 'Contact Fields', path: '/settings/contact-fields', permission: PERMISSIONS.SETTINGS_MANAGE },
      {
        key: 'contact-tags',
        label: 'Contact tags',
        path: '/settings/contact-tags',
        permissions: [PERMISSIONS.CONTACTS_UPDATE, PERMISSIONS.LEADS_UPDATE],
      },
      { key: 'integrations', label: 'Integrations', path: '/settings/integrations', permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
];

/**
 * Manager navigation items.
 */
const MANAGER_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/', permission: PERMISSIONS.DASHBOARD_VIEW, section: 'Main' },
  { key: 'leads', label: 'Leads', path: '/leads', permission: PERMISSIONS.LEADS_READ },
  {
    key: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    permissions: [PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ],
  },
  { key: 'contacts', label: 'Contacts', path: '/contacts', permission: PERMISSIONS.CONTACTS_READ },
  {
    key: 'contact-tags',
    label: 'Contact tags',
    path: '/settings/contact-tags',
    permissions: [PERMISSIONS.CONTACTS_UPDATE, PERMISSIONS.LEADS_UPDATE],
  },
  { key: 'deals', label: 'Deals', path: '/deals', permission: PERMISSIONS.PIPELINES_MANAGE },
  { key: 'dialer', label: 'Dialer', path: '/dialer', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'call-history', label: 'Call history', path: '/calls/history', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'reports', label: 'Reports', path: '/reports', permission: PERMISSIONS.REPORTS_VIEW },
  { key: 'users', label: 'My team', path: '/users', permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM] },
  { key: 'workflow-map', label: 'Workflow', path: '/workflow/map', permission: PERMISSIONS.DASHBOARD_VIEW },
  {
    key: 'dialer-workflow',
    label: 'Dialer Workflow',
    section: 'Dialer',
    permission: PERMISSIONS.DISPOSITIONS_MANAGE,
    children: [
      { key: 'dispositions', label: 'Dispositions', path: '/workflow/dispositions', permission: PERMISSIONS.DISPOSITIONS_MANAGE },
      { key: 'dialing-sets', label: 'Dialing Sets', path: '/workflow/dialing-sets', permission: PERMISSIONS.DISPOSITIONS_MANAGE },
    ],
  },
  {
    key: 'dialer-resources',
    label: 'Dialer Resources',
    permission: PERMISSIONS.SETTINGS_MANAGE,
    children: [
      { key: 'dialer-scripts', label: 'Dialer Scripts', path: '/resources/dialer-scripts', permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    section: 'Messaging',
    permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
    children: [
      {
        key: 'whatsapp-accounts',
        label: 'Accounts',
        path: '/whatsapp/accounts',
        permissions: [
          PERMISSIONS.WHATSAPP_TEMPLATES_MANAGE,
          PERMISSIONS.WHATSAPP_ACCOUNTS_MANAGE,
          PERMISSIONS.SETTINGS_MANAGE,
        ],
      },
      {
        key: 'whatsapp-templates',
        label: 'Templates',
        path: '/whatsapp/templates',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
      {
        key: 'whatsapp-messages',
        label: 'Messages',
        path: '/whatsapp/messages',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
      {
        key: 'whatsapp-logs',
        label: 'API Logs',
        path: '/whatsapp/logs',
        permissions: [PERMISSIONS.WHATSAPP_LOGS_VIEW, PERMISSIONS.SETTINGS_MANAGE],
      },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
    children: [
      {
        key: 'email-sent',
        label: 'Sent',
        path: '/email/sent',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'email-templates',
        label: 'Templates',
        path: '/email/templates',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'email-accounts',
        label: 'Accounts',
        path: '/email/accounts',
        permissions: [
          PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
          PERMISSIONS.EMAIL_ACCOUNTS_MANAGE,
          PERMISSIONS.SETTINGS_MANAGE,
        ],
      },
    ],
  },
];

/**
 * Agent navigation items.
 */
const AGENT_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/', permission: PERMISSIONS.DASHBOARD_VIEW, section: 'Main' },
  { key: 'leads', label: 'Leads', path: '/leads', permission: PERMISSIONS.LEADS_READ },
  {
    key: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    permissions: [PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ],
  },
  { key: 'contacts', label: 'Contacts', path: '/contacts', permission: PERMISSIONS.CONTACTS_READ },
  { key: 'dialer', label: 'Dialer', path: '/dialer', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'call-history', label: 'Call history', path: '/calls/history', permission: PERMISSIONS.DIAL_EXECUTE },
  { key: 'workflow-map', label: 'Workflow', path: '/workflow/map', permission: PERMISSIONS.DASHBOARD_VIEW },
  {
    key: 'dialer-workflow',
    label: 'Dialer Workflow',
    section: 'Dialer',
    // workflow.view (after migration) or dial.execute — all agents can open read-only workflow screens
    permissions: [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.DIAL_EXECUTE],
    children: [
      { key: 'dispositions', label: 'Dispositions', path: '/workflow/dispositions' },
      { key: 'dialing-sets', label: 'Dialing Sets', path: '/workflow/dialing-sets' },
    ],
  },
  {
    key: 'dialer-resources',
    label: 'Dialer Resources',
    permissions: [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.DIAL_EXECUTE],
    children: [
      { key: 'dialer-scripts', label: 'Dialer Scripts', path: '/resources/dialer-scripts' },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    section: 'Messaging',
    // Agents always have dial.execute; whatsapp.* permissions may be missing until DB seed/migration is applied.
    permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
    children: [
      {
        key: 'whatsapp-templates',
        label: 'Templates',
        path: '/whatsapp/templates',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'whatsapp-messages',
        label: 'Messages',
        path: '/whatsapp/messages',
        permissions: [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
    children: [
      {
        key: 'email-sent',
        label: 'Sent',
        path: '/email/sent',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
      {
        key: 'email-templates',
        label: 'Templates',
        path: '/email/templates',
        permissions: [PERMISSIONS.EMAIL_VIEW, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DIAL_EXECUTE],
      },
    ],
  },
];

/** Role names for tenant nav (role IDs are per-tenant, so we use role name). */
const ROLE_NAMES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  AGENT: 'agent',
};

/**
 * Filter navigation items recursively based on permissions.
 */
function filterNavItems(items, can, isPlatformAdmin) {
  return items
    .map((item) => {
      if (isPlatformAdmin) {
        if (item.children) {
          return { ...item, children: filterNavItems(item.children, can, isPlatformAdmin) };
        }
        return item;
      }

      const allowedByPermission = (() => {
        if (item.permissions?.length) {
          return item.permissions.some((p) => can(p));
        }
        if (item.permission) {
          return can(item.permission);
        }
        return true;
      })();

      if (allowedByPermission) {
        if (item.children) {
          const filteredChildren = filterNavItems(item.children, can, isPlatformAdmin);
          if (filteredChildren.length > 0) {
            return { ...item, children: filteredChildren };
          }
          return null;
        }
        return item;
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Whether pathname belongs to this nav path (exact, or under it with a path segment).
 * Avoids /settings matching /settings/contact-fields as "General" only — longer paths win below.
 */
function pathMatches(pathname, navPath) {
  if (navPath === '/') return pathname === '/';
  if (pathname === navPath) return true;
  if (navPath !== '/' && pathname.startsWith(`${navPath}/`)) return true;
  return false;
}

/**
 * Find active key from nested navigation items.
 * For nested children, the longest matching path wins (e.g. /settings/contact-fields vs /settings).
 */
function findActiveKey(items, pathname) {
  for (const item of items) {
    if (item.children) {
      const matches = item.children.filter((child) => pathMatches(pathname, child.path));
      if (matches.length > 0) {
        matches.sort((a, b) => b.path.length - a.path.length);
        const best = matches[0];
        return { parentKey: item.key, childKey: best.key };
      }
    } else if (pathMatches(pathname, item.path)) {
      return { parentKey: null, childKey: item.key };
    }
  }
  return { parentKey: null, childKey: 'dashboard' };
}

/**
 * Get navigation items based on user role.
 * Uses role name (not role ID) so tenant admins from any tenant see admin nav.
 */
function getNavItemsByRole(roleName, isPlatform, isPlatformAdmin) {
  if (isPlatform && isPlatformAdmin) {
    return PLATFORM_NAV_ITEMS;
  }

  switch (roleName) {
    case ROLE_NAMES.ADMIN:
      return TENANT_ADMIN_NAV_ITEMS;
    case ROLE_NAMES.MANAGER:
      return MANAGER_NAV_ITEMS;
    case ROLE_NAMES.AGENT:
      return AGENT_NAV_ITEMS;
    default:
      return AGENT_NAV_ITEMS;
  }
}

/**
 * Sales-first navigation model with permission-based filtering.
 * - Only shows menu items the user has permission to access.
 * - Platform admins see admin-specific navigation.
 * - Supports nested navigation with children (tabs).
 * - Provides a simple API for sidebar/topbar menu components.
 */
export function useSalesNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantSlug, isPlatform } = useTenant();
  const { can, isPlatformAdmin } = usePermissions();
  const user = useAppSelector(selectUser);
  const roleName = user?.role ?? 'agent';
  const { emailModuleEnabled } = useEmailModuleEnabled();

  const items = useMemo(() => {
    const baseItems = getNavItemsByRole(roleName, isPlatform, isPlatformAdmin);
    let list = filterNavItems(baseItems, can, isPlatformAdmin);
    if (emailModuleEnabled === false) {
      list = list.filter((item) => item.key !== 'email');
    }
    return list;
  }, [roleName, isPlatform, isPlatformAdmin, can, emailModuleEnabled]);

  const { activeKey, activeParentKey } = useMemo(() => {
    const { parentKey, childKey } = findActiveKey(items, location.pathname);
    return { activeKey: childKey, activeParentKey: parentKey };
  }, [items, location.pathname]);

  function goTo(path) {
    navigate(path);
  }

  return {
    items,
    activeKey,
    activeParentKey,
    goTo,
    tenantSlug,
    isPlatform,
    isPlatformAdmin,
  };
}

