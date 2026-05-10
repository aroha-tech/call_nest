import React from 'react';

const MODULE_LABELS = {
  calling: 'CALLS',
  disposition: 'DISPOSITION',
  contacts: 'CONTACTS',
  meetings: 'MEETINGS',
  schedule_hub: 'SCHEDULE',
  tasks: 'TASKS',
  email: 'EMAIL',
};

function categoryLabel(moduleKey, eventType) {
  const k = String(moduleKey || '').toLowerCase();
  const ev = String(eventType || '').toLowerCase();
  if (k === 'contacts' && (ev.includes('assign') || ev.includes('campaign') || ev.includes('lead'))) {
    return 'LEADS';
  }
  return MODULE_LABELS[k] || (k ? k.replace(/_/g, ' ').toUpperCase() : 'GENERAL');
}

function eventKindLabel(eventType) {
  return String(eventType || '')
    .replace(/\./g, ' ')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase())
    .join(' ');
}

/** Pastel icon background + stronger icon color per module (light-UI friendly; works on elevated surfaces). */
export function getNotificationTone(moduleKey) {
  const k = String(moduleKey || '').toLowerCase();
  switch (k) {
    case 'meetings':
      return { tone: 'meetings', iconBg: '#ede9fe', iconColor: '#6366f1' };
    case 'schedule_hub':
      return { tone: 'schedule_hub', iconBg: '#e0f2fe', iconColor: '#0284c7' };
    case 'calling':
      return { tone: 'calling', iconBg: '#ccfbf1', iconColor: '#0d9488' };
    case 'tasks':
      return { tone: 'tasks', iconBg: '#ffe4e6', iconColor: '#e11d48' };
    case 'contacts':
      return { tone: 'contacts', iconBg: '#ffedd5', iconColor: '#ea580c' };
    case 'email':
      return { tone: 'email', iconBg: '#dbeafe', iconColor: '#2563eb' };
    case 'disposition':
      return { tone: 'disposition', iconBg: '#e0e7ff', iconColor: '#4f46e5' };
    default:
      return { tone: 'default', iconBg: '#f1f5f9', iconColor: '#64748b' };
  }
}

export function getNotificationPresentation(n) {
  const moduleKey = n?.module_key;
  const eventType = n?.event_type;
  const tone = getNotificationTone(moduleKey);
  return {
    categoryLabel: categoryLabel(moduleKey, eventType),
    eventKindLabel: eventKindLabel(eventType),
    tone,
  };
}

function IconCalendar({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 2v3M16 2v3M4 10h16M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPencil({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPhone({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 3h3l2 5-2 1.2a12 12 0 0 0 5.3 5.3L18 12l5 2v3a2 2 0 0 1-2.2 2A19 19 0 0 1 3 5.2 2 2 0 0 1 5 3Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUserPlus({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTask({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMail({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h16v16H4V4Zm0 4 8 5 8-5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBell({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 2.02-.396 3.744-1.136 5.07-.37.663-.786 1.17-1.182 1.548A8.3 8.3 0 0 1 4 16.5h16a8.3 8.3 0 0 1-1.182-1.382M9.2 19a2.8 2.8 0 0 0 5.6 0"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NotificationTypeIcon({ moduleKey, eventType, color }) {
  const k = String(moduleKey || '').toLowerCase();
  const ev = String(eventType || '').toLowerCase();
  if (k === 'meetings' && (ev.includes('reschedul') || ev.includes('updated') || ev.includes('edit'))) {
    return <IconPencil color={color} />;
  }
  if (k === 'meetings') return <IconCalendar color={color} />;
  if (k === 'schedule_hub') return <IconCalendar color={color} />;
  if (k === 'calling') return <IconPhone color={color} />;
  if (k === 'tasks') return <IconTask color={color} />;
  if (k === 'contacts' && (ev.includes('assign') || ev.includes('lead'))) {
    return <IconUserPlus color={color} />;
  }
  if (k === 'contacts') return <IconUserPlus color={color} />;
  if (k === 'email') return <IconMail color={color} />;
  if (k === 'disposition') return <IconPencil color={color} />;
  return <IconBell color={color} />;
}
