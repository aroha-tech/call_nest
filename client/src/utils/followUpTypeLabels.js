/** Labels for scheduled_callbacks.follow_up_type (schedule hub / performance). */

export const FOLLOW_UP_TYPE_OPTIONS = [
  { value: 'callback', label: 'Phone callback' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting follow-up' },
  { value: 'other', label: 'Other' },
];

const MAP = Object.fromEntries(FOLLOW_UP_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function followUpTypeLabel(v) {
  const k = String(v || 'callback').toLowerCase();
  return MAP[k] || 'Phone callback';
}
