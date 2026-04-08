export const LEAD_TABLE_COLUMNS_STORAGE_KEY = 'callnest.leadList.visibleColumns.v3';
const LEGACY_LEAD_TABLE_COLUMNS_STORAGE_KEY_V1 = 'callnest.leadList.visibleColumns.v1';
const LEGACY_LEAD_TABLE_COLUMNS_STORAGE_KEY_V2 = 'callnest.leadList.visibleColumns.v2';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   sortKey?: string,
 *   requireCampaign?: boolean,
 *   requireManagerAgent?: boolean,
 *   category?: 'default' | 'extra' | 'custom',
 *   customFieldType?: 'text' | 'number' | 'date' | 'boolean' | 'select',
 * }} LeadColumnDef
 */

import { customFieldColumnId, parseCustomFieldColumnId } from './customFieldColumnIds';

/** Back-compat exports (used by LeadDataTable / ContactsPage). */
export const LEAD_CUSTOM_FIELD_COL_PREFIX = 'cf:';
export const leadCustomFieldColumnId = customFieldColumnId;
export const parseLeadCustomFieldColumnId = parseCustomFieldColumnId;

/**
 * @param {Array<{ field_id?: number, id?: number, name?: string, label?: string }>} customFields from GET /contacts/custom-fields
 * @returns {LeadColumnDef[]}
 */
export function buildLeadCustomFieldColumnDefs(customFields) {
  if (!Array.isArray(customFields)) return [];
  return customFields.map((f) => {
    const id = f.field_id ?? f.id;
    return {
      id: customFieldColumnId(id),
      label: f.label || f.name || `Field ${id}`,
      category: 'custom',
      customFieldType: f.type,
    };
  });
}

/**
 * @param {LeadColumnDef[]} applicableBase
 * @param {Array<{ field_id?: number, id?: number, name?: string, label?: string }>} customFields
 */
export function mergeApplicableLeadColumnsWithCustomFields(applicableBase, customFields) {
  return [...applicableBase, ...buildLeadCustomFieldColumnDefs(customFields)];
}

/** @type {LeadColumnDef[]} */
const ALL_LEAD_COLUMNS = [
  { id: 'display_name', label: 'Display name', sortKey: 'display_name', category: 'default' },
  { id: 'primary_phone', label: 'Primary phone', sortKey: 'primary_phone', category: 'default' },
  { id: 'email', label: 'Email', sortKey: 'email', category: 'default' },
  { id: 'tag_names', label: 'Tag', sortKey: 'tag_names', category: 'default' },
  { id: 'campaign_name', label: 'Campaign', sortKey: 'campaign_name', requireCampaign: true, category: 'default' },
  { id: 'type', label: 'Type', sortKey: 'type', category: 'default' },
  { id: 'manager_name', label: 'Manager', sortKey: 'manager_name', requireManagerAgent: true, category: 'default' },
  { id: 'assigned_user_name', label: 'Agent', sortKey: 'assigned_user_name', requireManagerAgent: true, category: 'default' },
  { id: 'call_count_total', label: 'Call count', sortKey: null, category: 'extra' },
  { id: 'last_called_at', label: 'Last called', sortKey: null, category: 'extra' },
  { id: 'source', label: 'Source', sortKey: 'source', category: 'extra' },
  { id: 'city', label: 'City', sortKey: 'city', category: 'extra' },
  { id: 'company', label: 'Company', sortKey: 'company', category: 'extra' },
  { id: 'website', label: 'Website', sortKey: 'website', category: 'extra' },
  { id: 'job_title', label: 'Job title', sortKey: 'job_title', category: 'extra' },
  { id: 'industry', label: 'Industry', sortKey: 'industry', category: 'extra' },
  { id: 'state', label: 'State', sortKey: 'state', category: 'extra' },
  { id: 'country', label: 'Country', sortKey: 'country', category: 'extra' },
  { id: 'pin_code', label: 'PIN / Zip', sortKey: 'pin_code', category: 'extra' },
  { id: 'address', label: 'Address', sortKey: 'address', category: 'extra' },
  { id: 'address_line_2', label: 'Address line 2', sortKey: 'address_line_2', category: 'extra' },
  { id: 'tax_id', label: 'Tax ID', sortKey: 'tax_id', category: 'extra' },
  { id: 'date_of_birth', label: 'Date of birth', sortKey: 'date_of_birth', category: 'extra' },
  { id: 'created_at', label: 'Created', sortKey: 'created_at', category: 'extra' },
];

/**
 * Columns available for the leads list for the current user context (before visibility prefs).
 * @param {{ showCampaign: boolean, showManagerAgent: boolean }} opts
 * @returns {LeadColumnDef[]}
 */
export function getApplicableLeadColumns({ showCampaign, showManagerAgent }) {
  return ALL_LEAD_COLUMNS.filter((col) => {
    if (col.requireCampaign && !showCampaign) return false;
    if (col.requireManagerAgent && !showManagerAgent) return false;
    return true;
  });
}

/**
 * Default visible set: core lead columns only; "extra" fields start in Not visible until the user adds them.
 * @param {LeadColumnDef[]} applicable
 * @returns {string[]}
 */
export function getDefaultVisibleLeadColumnIds(applicable) {
  const ids = new Set(applicable.map((c) => c.id));
  const order = [
    'display_name',
    'primary_phone',
    'email',
    'tag_names',
    'type',
    'campaign_name',
    'manager_name',
    'assigned_user_name',
  ];
  return order.filter((id) => ids.has(id));
}

/**
 * @param {LeadColumnDef[]} applicableColumns
 * @returns {string[]}
 */
export function loadLeadVisibleColumnIds(applicableColumns) {
  const applicableIds = applicableColumns.map((c) => c.id);
  const defaults = getDefaultVisibleLeadColumnIds(applicableColumns);

  try {
    let raw = localStorage.getItem(LEAD_TABLE_COLUMNS_STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_LEAD_TABLE_COLUMNS_STORAGE_KEY_V2);
    if (!raw) raw = localStorage.getItem(LEGACY_LEAD_TABLE_COLUMNS_STORAGE_KEY_V1);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    const vis = Array.isArray(parsed.visible) ? parsed.visible : [];
    let cleaned = vis.filter((id) => applicableIds.includes(id));

    if (applicableIds.includes('display_name') && !cleaned.includes('display_name')) {
      cleaned = ['display_name', ...cleaned];
    }

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
export function saveLeadVisibleColumnIds(visibleIds) {
  const unique = [...new Set(visibleIds)];
  localStorage.setItem(LEAD_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify({ visible: unique }));
}
