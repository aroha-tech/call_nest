export const DIAL_SESSIONS_COLUMNS_STORAGE_KEY = 'callnest.dialSessions.visibleColumns.v2';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   sortKey?: string | null,
 *   category?: 'default' | 'extra',
 *   columnFilterOnly?: boolean,
 * }} DialSessionsColumnDef
 */

/** @type {DialSessionsColumnDef[]} */
export const ALL_DIAL_SESSIONS_COLUMNS = [
  { id: 'session_no', label: 'Session #', sortKey: 'user_session_no', category: 'default' },
  { id: 'id', label: 'ID', sortKey: 'id', category: 'default' },
  { id: 'status', label: 'Status', sortKey: 'status', category: 'default' },
  { id: 'provider', label: 'Provider', sortKey: 'provider', category: 'default' },
  { id: 'leads', label: 'Total contacts', sortKey: 'items_count', category: 'default' },
  { id: 'called', label: 'Called', sortKey: 'called_count', category: 'default' },
  { id: 'connected', label: 'Connected', sortKey: 'connected_count', category: 'default' },
  { id: 'failed', label: 'Failed', sortKey: 'failed_count', category: 'default' },
  { id: 'queued_left', label: 'Queued left', sortKey: 'queued_count', category: 'default' },
  { id: 'script', label: 'Script', sortKey: 'script_name', category: 'extra' },
  { id: 'session_time', label: 'Session time', sortKey: 'duration_sec', category: 'extra' },
  { id: 'created', label: 'Created', sortKey: 'created_at', category: 'default' },
  { id: 'started', label: 'Started', sortKey: 'started_at', category: 'extra' },
  { id: 'ended', label: 'Ended', sortKey: 'ended_at', category: 'extra' },
  { id: 'created_by', label: 'Created by', sortKey: 'creator_name', category: 'default' },
];

export function getApplicableDialSessionsColumns() {
  return ALL_DIAL_SESSIONS_COLUMNS;
}

export function getDefaultVisibleDialSessionsColumnIds(applicable) {
  const ids = new Set((applicable || []).map((c) => c.id));
  const order = [
    'session_no',
    'id',
    'status',
    'provider',
    'leads',
    'called',
    'connected',
    'failed',
    'queued_left',
    'created',
    'started',
    'ended',
    'created_by',
  ];
  return order.filter((id) => ids.has(id));
}

export function loadDialSessionsVisibleColumnIds(applicableColumns) {
  const applicableIds = (applicableColumns || []).map((c) => c.id);
  const defaults = getDefaultVisibleDialSessionsColumnIds(applicableColumns);
  try {
    const raw = localStorage.getItem(DIAL_SESSIONS_COLUMNS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const vis = Array.isArray(parsed.visible) ? parsed.visible : [];
    const cleaned = [...new Set(vis.filter((id) => applicableIds.includes(id)))];
    return cleaned.length ? cleaned : defaults;
  } catch {
    return defaults;
  }
}

export function saveDialSessionsVisibleColumnIds(visibleIds) {
  const unique = [...new Set(visibleIds)];
  localStorage.setItem(DIAL_SESSIONS_COLUMNS_STORAGE_KEY, JSON.stringify({ visible: unique }));
}

