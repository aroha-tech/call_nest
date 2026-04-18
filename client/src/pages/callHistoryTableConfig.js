export const CALL_HISTORY_COLUMNS_STORAGE_KEY = 'callnest.callHistory.visibleColumns.v4';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   sortKey?: string | null,
 *   category?: 'default' | 'extra',
 *   columnFilterOnly?: boolean,
 * }} CallHistoryColumnDef
 */

/** @type {CallHistoryColumnDef[]} */
export const ALL_CALL_HISTORY_COLUMNS = [
  { id: 'created_at', label: 'Call date', sortKey: 'created_at', category: 'default' },
  {
    id: 'call_notes',
    label: 'Notes',
    sortKey: null,
    category: 'default',
  },
  { id: 'contact', label: 'Customer', sortKey: 'contact_id', category: 'default' },
  { id: 'phone', label: 'Phone', sortKey: 'phone', category: 'default' },
  { id: 'agent', label: 'Agent', sortKey: 'agent', category: 'default' },
  { id: 'dial_session', label: 'Dial session', sortKey: 'dial_session', category: 'default' },
  { id: 'direction', label: 'Direction', sortKey: 'direction', category: 'default' },
  { id: 'status', label: 'Status', sortKey: 'status', category: 'default' },
  { id: 'is_connected', label: 'Connectivity', sortKey: 'is_connected', category: 'default' },
  { id: 'disposition', label: 'Disposition', sortKey: 'disposition', category: 'default' },
  { id: 'duration_sec', label: 'Duration', sortKey: 'duration_sec', category: 'extra' },
  { id: 'started_at', label: 'Started', sortKey: 'started_at', category: 'extra' },
  { id: 'ended_at', label: 'Ended', sortKey: 'ended_at', category: 'extra' },
  { id: 'provider', label: 'Provider', sortKey: 'provider', category: 'extra' },
];

/**
 * @returns {CallHistoryColumnDef[]}
 */
export function getApplicableCallHistoryColumns() {
  return ALL_CALL_HISTORY_COLUMNS;
}

/**
 * @param {CallHistoryColumnDef[]} applicable
 * @returns {string[]}
 */
export function getDefaultVisibleCallHistoryColumnIds(applicable) {
  const ids = new Set(applicable.map((c) => c.id));
  const order = [
    'call_notes',
    'contact',
    'phone',
    'agent',
    'dial_session',
    'direction',
    'status',
    'is_connected',
    'disposition',
    'created_at',
  ];
  return order.filter((id) => ids.has(id));
}

/**
 * @param {CallHistoryColumnDef[]} applicableColumns
 * @returns {string[]}
 */
export function loadCallHistoryVisibleColumnIds(applicableColumns) {
  const applicableIds = applicableColumns.map((c) => c.id);
  const defaults = getDefaultVisibleCallHistoryColumnIds(applicableColumns);

  try {
    const raw = localStorage.getItem(CALL_HISTORY_COLUMNS_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    const vis = Array.isArray(parsed.visible) ? parsed.visible : [];
    let cleaned = vis.filter((id) => applicableIds.includes(id));

    cleaned = [...new Set(cleaned)];

    if (cleaned.length === 0) return defaults;
    return cleaned;
  } catch {
    return defaults;
  }
}

/**
 * @param {string[]} visibleIds
 */
export function saveCallHistoryVisibleColumnIds(visibleIds) {
  const unique = [...new Set(visibleIds)];
  localStorage.setItem(CALL_HISTORY_COLUMNS_STORAGE_KEY, JSON.stringify({ visible: unique }));
}
