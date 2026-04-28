import React from 'react';

const S = {
  common: {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.65,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
};

function Icon({ children, ...rest }) {
  return (
    <svg {...S.common} aria-hidden {...rest}>
      {children}
    </svg>
  );
}

function IconDefault() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  );
}

function IconDashboard() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </Icon>
  );
}

function IconBuilding() {
  return (
    <Icon>
      <path d="M3 21h18" />
      <path d="M6 21V8l6-3 6 3v13" />
      <path d="M9 21v-4h6v4" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </Icon>
  );
}

function IconUsers() {
  return (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

function IconLayers() {
  return (
    <Icon>
      <path d="m12.83 2.18 7.8 4.5a2 2 0 0 1 1 1.73v9.18a2 2 0 0 1-1 1.73l-7.8 4.5a2 2 0 0 1-2 0l-7.8-4.5a2 2 0 0 1-1-1.73V8.41a2 2 0 0 1 1-1.73l7.8-4.5a2 2 0 0 1 2 0Z" />
      <path d="M2.5 8.5 12 13.5l9.5-5" />
      <path d="M12 22V13.5" />
    </Icon>
  );
}

function IconFactory() {
  return (
    <Icon>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-5 3-4-3v12Z" />
      <path d="M12 2v4" />
      <path d="M8 14h8" />
    </Icon>
  );
}

function IconTag() {
  return (
    <Icon>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </Icon>
  );
}

function IconZap() {
  return (
    <Icon>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Icon>
  );
}

function IconUserCheck() {
  return (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8l2 2 4-4" />
    </Icon>
  );
}

function IconThermometer() {
  return (
    <Icon>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </Icon>
  );
}

function IconBraces() {
  return (
    <Icon>
      <path d="M8 3H6.5a2.5 2.5 0 0 0 0 5H8V9" />
      <path d="M16 3h1.5a2.5 2.5 0 0 1 0 5H16V9" />
      <path d="M8 15H6.5a2.5 2.5 0 0 1 0-5H8" />
      <path d="M16 15h1.5a2.5 2.5 0 0 0 0-5H16" />
    </Icon>
  );
}

function IconListTree() {
  return (
    <Icon>
      <path d="M21 12h-8" />
      <path d="M21 6H8" />
      <path d="M21 18h-8" />
      <path d="M3 6v4c0 1.1.9 2 2 2h4" />
      <path d="M3 10v6c0 1.1.9 2 2 2h4" />
    </Icon>
  );
}

function IconGitBranch() {
  return (
    <Icon>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Icon>
  );
}

function IconTarget() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  );
}

function IconMegaphone() {
  return (
    <Icon>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </Icon>
  );
}

function IconContact() {
  return (
    <Icon>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 2v4" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
      <circle cx="12" cy="9" r="2" />
    </Icon>
  );
}

function IconDeals() {
  return (
    <Icon>
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Icon>
  );
}

function IconPulse() {
  return (
    <Icon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  );
}

function IconBarChart() {
  return (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M7 16v-4" />
      <path d="M12 16v-8" />
      <path d="M17 16v-2" />
    </Icon>
  );
}

function IconPhone() {
  return (
    <Icon>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Icon>
  );
}

/** Dialer — handset + signal arcs (outbound / active call; same stroke language as other icons) */
function IconDialer() {
  return (
    <Icon>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      <path d="M14.05 2a9 9 0 0 1 8 7.88" />
      <path d="M14.05 6a5 5 0 0 1 5 4" />
    </Icon>
  );
}

/** Past calls / log — history arc + list lines */
function IconCallHistory() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M14 17h7" />
      <path d="M14 13h7" />
      <path d="M14 9h5" />
    </Icon>
  );
}

function IconFileText() {
  return (
    <Icon>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </Icon>
  );
}

function IconMessageCircle() {
  return (
    <Icon>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Icon>
  );
}

function IconInbox() {
  return (
    <Icon>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  );
}

function IconScrollText() {
  return (
    <Icon>
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
      <path d="M16 3h2a2 2 0 0 1 2 2v2" />
      <path d="M10 9h8" />
      <path d="M10 13h8" />
    </Icon>
  );
}

function IconTerminal() {
  return (
    <Icon>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </Icon>
  );
}

function IconMail() {
  return (
    <Icon>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Icon>
  );
}

function IconSettings() {
  return (
    <Icon>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function IconClipboardCheck() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="18" rx="2" />
      <path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5V6H9V4.5Z" />
      <path d="m9.2 14.2 2.2 2.2 4.2-4.2" />
    </Icon>
  );
}

function IconBuilding2() {
  return (
    <Icon>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </Icon>
  );
}

function IconTags() {
  return (
    <Icon>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

function IconPlug() {
  return (
    <Icon>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </Icon>
  );
}

/** Queued background work (imports, exports, bulk actions). */
function IconBackgroundTasks() {
  return (
    <Icon>
      <circle cx="6" cy="7" r="1.35" />
      <circle cx="6" cy="12" r="1.35" />
      <circle cx="6" cy="17" r="1.35" />
      <path d="M10.5 7H21M10.5 12H19M10.5 17H20" />
    </Icon>
  );
}

/** Process / workflow map (sidebar “Workflow”). */
function IconWorkflowMap() {
  return (
    <Icon>
      <circle cx="6" cy="6" r="2.25" />
      <circle cx="18" cy="6" r="2.25" />
      <circle cx="12" cy="18" r="2.25" />
      <path d="M6 8.25v3l6 4.5M18 8.25v3L12 15.75" />
    </Icon>
  );
}

/** Workspace activity log (sidebar “Activities”). */
function IconActivityFeed() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function IconCalendar() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

/** Tenant blacklist (blocked leads/contacts/numbers). */
function IconBlacklist() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </Icon>
  );
}

/** Meeting-related attendee / invitation emails (settings). */
function IconMeetingAttendeeEmails() {
  return (
    <Icon>
      <rect x="4" y="3" width="16" height="5" rx="1" />
      <path d="M7 3v3M17 3v3M4 6h16" />
      <rect width="18" height="11" x="3" y="10" rx="2" />
      <path d="m3 13 9 5 9-5" />
    </Icon>
  );
}

/** Meetings — calendar with highlighted event row */
function IconMeetings() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M7.5 14.5h9" />
    </Icon>
  );
}

/** Callbacks — reminder bell with small status dot */
function IconCallbacks() {
  return (
    <Icon>
      <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
      <circle cx="18.5" cy="6.5" r="1.5" />
    </Icon>
  );
}

/**
 * Per-item sidebar icon color (stroke + tinted chip). Mid-chroma tones read on dark (#000) and light (#f1f5f9) rails.
 * Keys align with `useSalesNavigation` / `NAV_ICON_MAP`; unknown keys fall back to `--color-accent-brand` in CSS.
 */
export const SHELL_NAV_ICON_ACCENTS = {
  dashboard: '#38bdf8',
  activity: '#a78bfa',
  activities: '#a78bfa',
  tenants: '#818cf8',
  users: '#34d399',
  masters: '#fb923c',
  industries: '#f97316',
  'industry-lead-fields': '#fdba74',
  'dispo-types': '#fbbf24',
  actions: '#facc15',
  'contact-statuses': '#2dd4bf',
  temperatures: '#f472b6',
  'template-variables': '#93c5fd',
  'campaign-types': '#ec4899',
  'campaign-statuses': '#db2777',
  'workflow-map': '#c084fc',
  dialer: '#60a5fa',
  'call-history': '#818cf8',
  'schedule-hub': '#2dd4bf',
  'schedule-meetings': '#14b8a6',
  'schedule-callbacks': '#0f766e',
  'dialer-workflow': '#a855f7',
  dispositions: '#c4b5fd',
  'dialing-sets': '#7c3aed',
  'default-dispositions': '#c084fc',
  'default-dialing-sets': '#6d28d9',
  'dialer-resources': '#0ea5e9',
  'dialer-scripts': '#0891b2',
  leads: '#fbbf24',
  campaigns: '#fb7185',
  contacts: '#22d3ee',
  deals: '#fb923c',
  blacklist: '#f87171',
  reports: '#64748b',
  'my-reports': '#64748b',
  'task-manager': '#84cc16',
  whatsapp: '#4ade80',
  'whatsapp-accounts': '#22c55e',
  'whatsapp-templates': '#16a34a',
  'whatsapp-messages': '#86efac',
  'whatsapp-logs': '#15803d',
  email: '#60a5fa',
  'email-sent': '#3b82f6',
  'email-templates': '#2563eb',
  'email-accounts': '#1d4ed8',
  meetings: '#14b8a6',
  settings: '#94a3b8',
  'settings-main': '#64748b',
  'contact-fields': '#a855f7',
  'contact-tags': '#d946ef',
  integrations: '#6366f1',
  'background-jobs': '#eab308',
  'meeting-attendee-emails': '#06b6d4',
};

const NAV_ICON_MAP = {
  dashboard: IconDashboard,
  tenants: IconBuilding,
  users: IconUsers,
  masters: IconLayers,
  industries: IconFactory,
  'industry-lead-fields': IconBraces,
  'dispo-types': IconTag,
  actions: IconZap,
  'contact-statuses': IconUserCheck,
  temperatures: IconThermometer,
  'template-variables': IconBraces,
  'campaign-types': IconMegaphone,
  'campaign-statuses': IconPulse,
  'workflow-map': IconWorkflowMap,
  activity: IconActivityFeed,
  dialer: IconDialer,
  'call-history': IconCallHistory,
  'schedule-hub': IconCalendar,
  'dialer-workflow': IconPhone,
  'default-dispositions': IconListTree,
  'default-dialing-sets': IconGitBranch,
  leads: IconTarget,
  campaigns: IconMegaphone,
  contacts: IconContact,
  deals: IconDeals,
  activities: IconPulse,
  reports: IconBarChart,
  'task-manager': IconClipboardCheck,
  dispositions: IconListTree,
  'dialing-sets': IconGitBranch,
  'dialer-resources': IconFileText,
  'dialer-scripts': IconFileText,
  whatsapp: IconMessageCircle,
  'whatsapp-accounts': IconPhone,
  'whatsapp-templates': IconScrollText,
  'whatsapp-messages': IconInbox,
  'whatsapp-logs': IconTerminal,
  email: IconMail,
  'email-sent': IconInbox,
  'email-templates': IconScrollText,
  'email-accounts': IconMail,
  meetings: IconMeetings,
  'schedule-meetings': IconMeetings,
  'schedule-callbacks': IconCallbacks,
  settings: IconSettings,
  'settings-main': IconBuilding2,
  'contact-fields': IconBraces,
  'contact-tags': IconTags,
  integrations: IconPlug,
  'background-jobs': IconBackgroundTasks,
  blacklist: IconBlacklist,
  'meeting-attendee-emails': IconMeetingAttendeeEmails,
};

/**
 * @param {Object} props
 * @param {string} props.navKey - navigation item `key` from useSalesNavigation
 * @param {string} [props.className]
 */
export function NavIcon({ navKey, className }) {
  const Cmp = NAV_ICON_MAP[navKey] || IconDefault;
  const accent = SHELL_NAV_ICON_ACCENTS[navKey];
  return (
    <span
      className={className}
      aria-hidden
      style={accent ? { ['--nav-icon-accent']: accent } : undefined}
    >
      <Cmp />
    </span>
  );
}

export function NavChevron({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
