/** Shared UI helpers for tenant activity feed (dashboard + full history). */

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

export const ACTIVITY_KIND_LABEL = {
  call: 'Call',
  dialer: 'Dialer',
  crm: 'CRM',
  settings: 'Settings',
  whatsapp: 'WhatsApp',
  email: 'Email',
  teammate: 'Team',
  workspace: 'Workspace',
  campaign: 'Campaign',
};

/** Tab ids align with `GET .../dashboard/activity?tab=` and dashboard strip filters. */
export const ACTIVITY_FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'calls', label: 'Calls' },
  { id: 'records', label: 'CRM' },
  { id: 'team', label: 'Team', hideForAgent: true },
];

export function activityTabsForRole(role) {
  const r = String(role || 'agent');
  return ACTIVITY_FILTER_TABS.filter((t) => !t.hideForAgent || r !== 'agent');
}

export function initialsFromName(name) {
  if (!name || !String(name).trim()) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0].toUpperCase()).join('');
}

export function activityIconForKind(kind) {
  switch (kind) {
    case 'call':
      return { name: 'call', wrap: 'activityIconCall' };
    case 'dialer':
      return { name: 'call', wrap: 'activityIconCall' };
    case 'settings':
      return { name: 'tune', wrap: 'activityIconSettings' };
    case 'whatsapp':
      return { name: 'chat', wrap: 'activityIconWa' };
    case 'email':
      return { name: 'mail', wrap: 'activityIconEmail' };
    case 'teammate':
      return { name: 'person_add', wrap: 'activityIconTeam' };
    case 'workspace':
      return { name: 'rocket_launch', wrap: 'activityIconWorkspace' };
    case 'campaign':
      return { name: 'campaign', wrap: 'activityIconCampaign' };
    default:
      return { name: 'contract_edit', wrap: 'activityIconCrm' };
  }
}

export function statusBadgeForActivity(kind, title) {
  const t = String(title || '');
  const lower = t.toLowerCase();

  /** Fixed palette: green = ops/dialer/success, blue = outbound comms, teal = product/setup, purple = growth, amber = campaigns, rose = destructive, slate = neutral CRM edits */
  function fromTitleHeuristics() {
    if (/dialer session|dialer defaults|dialer queue|dialer/i.test(lower)) return { label: 'Dialer', variant: 'green' };
    if (/email sent|sent:|whatsapp sent|message sent/i.test(lower)) return { label: 'Sent', variant: 'blue' };
    if (/call (attempt|log)|connected call|disposition/i.test(lower)) return { label: 'Call', variant: 'green' };
    if (/meeting|calendar|invite/i.test(lower)) return { label: 'Meeting', variant: 'purple' };
    if (/campaign|blast|sequence/i.test(lower)) return { label: 'Campaign', variant: 'amber' };
    if (
      /pipeline|disposition|dialing set|call script|whatsapp account|email account|workspace settings|delete policy|integration|api key|webhook|tenant theme|branding/i.test(
        lower
      )
    ) {
      return { label: 'Settings', variant: 'teal' };
    }
    if (/csv import|import\(/i.test(lower)) return { label: 'Import', variant: 'purple' };
    if (/bulk deleted|deleted:/i.test(lower)) return { label: 'Deleted', variant: 'rose' };
    if (/tag\(s\)/i.test(lower)) return { label: 'Tags', variant: 'slate' };
    if (/updated assignment for|reassign|assignment/i.test(lower)) return { label: 'Assignment', variant: 'slate' };
    if (/deleted|archived|removed/i.test(lower)) return { label: 'Archived', variant: 'rose' };
    if (/created|registered|added/i.test(lower)) return { label: 'Created', variant: 'purple' };
    if (/updated|edit|changed|modified/i.test(lower)) return { label: 'Updated', variant: 'blue' };
    return null;
  }

  switch (kind) {
    case 'call':
      return { label: 'Completed', variant: 'green' };
    case 'dialer':
      return { label: 'Dialer', variant: 'green' };
    case 'whatsapp':
    case 'email':
      return { label: 'Sent', variant: 'blue' };
    case 'teammate':
      return { label: 'Team', variant: 'purple' };
    case 'workspace':
      return { label: 'Setup', variant: 'teal' };
    case 'campaign':
      return { label: 'Campaign', variant: 'amber' };
    case 'settings':
      return { label: 'Settings', variant: 'teal' };
    default: {
      const h = fromTitleHeuristics();
      if (h) return h;
      return { label: 'Updated', variant: 'blue' };
    }
  }
}

export function valueColumnForActivity(it) {
  const m = String(it.title || '').match(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (m) return `$${m[1]}`;
  return '—';
}

export function avatarHueFromString(s) {
  let h = 0;
  const str = String(s || 'x');
  for (let i = 0; i < str.length; i += 1) h = (h + str.charCodeAt(i) * (i + 1)) % 360;
  return h;
}
