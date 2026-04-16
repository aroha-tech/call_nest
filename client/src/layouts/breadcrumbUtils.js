/**
 * Breadcrumb labels for AppShellLayout. Merges nav item paths with explicit overrides
 * so intermediate segments (e.g. /settings) keep sensible names.
 */

function collectPathLabels(items, out = {}) {
  if (!items?.length) return out;
  for (const item of items) {
    if (item.path) out[item.path] = item.label;
    if (item.children?.length) collectPathLabels(item.children, out);
  }
  return out;
}

/** Humanize a URL segment when no label is mapped */
function humanizeSegment(seg) {
  if (!seg) return '';
  return seg
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const TENANT_PATH_OVERRIDES = {
  '/calls/history': 'Call history',
  '/calls/dial-sessions': 'Dial sessions',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/leads/import': 'Import leads',
  '/leads/import/history': 'Import history',
  '/leads/new': 'New lead',
  '/contacts/import': 'Import contacts',
  '/contacts/import/history': 'Import history',
  '/contacts/new': 'New contact',
  '/unauthorized': 'Unauthorized',
};

const PLATFORM_PATH_OVERRIDES = {
  '/profile': 'Profile',
  '/admin': 'Admin',
  '/admin/masters': 'Masters',
  '/admin/workflow': 'Workflow',
  '/admin/dispositions': 'Dispositions',
  '/unauthorized': 'Unauthorized',
};

function buildLabelMap(navItems, isPlatform) {
  const fromNav = collectPathLabels(navItems);
  const overrides = isPlatform ? PLATFORM_PATH_OVERRIDES : TENANT_PATH_OVERRIDES;
  return { ...fromNav, ...overrides };
}

/**
 * @param {string} pathname
 * @returns {{ label: string, path: string, isCurrent: boolean }[] | null}
 */
function matchDynamicTenantRoutes(pathname) {
  const home = { label: 'Home', path: '/', isCurrent: false };

  const campaignOpen = pathname.match(/^\/campaigns\/([^/]+)\/open$/);
  if (campaignOpen) {
    return [
      home,
      { label: 'Campaigns', path: '/campaigns', isCurrent: false },
      { label: 'Campaign', path: pathname, isCurrent: true },
    ];
  }

  const leadId = pathname.match(/^\/leads\/([^/]+)$/);
  if (leadId && leadId[1] !== 'import' && leadId[1] !== 'new') {
    return [
      home,
      { label: 'Leads', path: '/leads', isCurrent: false },
      { label: 'Lead', path: pathname, isCurrent: true },
    ];
  }

  const contactId = pathname.match(/^\/contacts\/([^/]+)$/);
  if (contactId && contactId[1] !== 'import' && contactId[1] !== 'new') {
    return [
      home,
      { label: 'Contacts', path: '/contacts', isCurrent: false },
      { label: 'Contact', path: pathname, isCurrent: true },
    ];
  }

  return null;
}

/**
 * @param {string} pathname
 * @param {object[]} navItems
 * @param {boolean} isPlatform
 * @returns {{ label: string, path: string, isCurrent: boolean }[]}
 */
export function getBreadcrumbItems(pathname, navItems, isPlatform) {
  const labelMap = buildLabelMap(navItems, isPlatform);

  if (pathname === '/') {
    return [{ label: 'Home', path: '/', isCurrent: true }];
  }

  if (!isPlatform) {
    const dynamic = matchDynamicTenantRoutes(pathname);
    if (dynamic) return dynamic;
  }

  const parts = pathname.split('/').filter(Boolean);
  const crumbs = [{ label: 'Home', path: '/', isCurrent: false }];

  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const isLast = i === parts.length - 1;
    let label = labelMap[acc];

    if (!label) {
      const seg = parts[i];
      if (/^\d+$/.test(seg) || /^[a-f0-9-]{36}$/i.test(seg)) {
        const prev = parts[i - 1];
        if (prev === 'leads') label = 'Lead';
        else if (prev === 'contacts') label = 'Contact';
        else if (prev === 'campaigns') label = 'Campaign';
        else if (prev === 'admin' && parts[i + 1] === undefined) label = 'Details';
        else label = 'Details';
      } else {
        label = humanizeSegment(seg);
      }
    }

    crumbs.push({ label, path: acc, isCurrent: isLast });
  }

  return crumbs;
}
