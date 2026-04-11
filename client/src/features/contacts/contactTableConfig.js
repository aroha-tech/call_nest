import { customFieldColumnId } from './customFieldColumnIds';

export const CONTACT_TABLE_COLUMNS_STORAGE_KEY = 'callnest.contactList.visibleColumns.v1';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   sortKey?: string,
 *   requireManagerAgent?: boolean,
 *   category?: 'default' | 'extra' | 'custom',
 *   customFieldType?: 'text' | 'number' | 'date' | 'boolean' | 'select',
 * }} ContactColumnDef
 */

/** @type {ContactColumnDef[]} */
const ALL_CONTACT_COLUMNS = [
  { id: 'display_name', label: 'Display name', sortKey: 'display_name', category: 'default' },
  { id: 'primary_phone', label: 'Primary phone', sortKey: 'primary_phone', category: 'default' },
  { id: 'email', label: 'Email', sortKey: 'email', category: 'default' },
  { id: 'tag_names', label: 'Tag', sortKey: 'tag_names', category: 'default' },
  { id: 'status_name', label: 'Status', sortKey: 'status_name', category: 'default' },
  { id: 'manager_name', label: 'Manager', sortKey: 'manager_name', requireManagerAgent: true, category: 'default' },
  { id: 'assigned_user_name', label: 'Agent', sortKey: 'assigned_user_name', requireManagerAgent: true, category: 'default' },

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
 * @param {{ showManagerAgent: boolean }} opts
 * @returns {ContactColumnDef[]}
 */
export function getApplicableContactColumns({ showManagerAgent }) {
  return ALL_CONTACT_COLUMNS.filter((col) => {
    if (col.requireManagerAgent && !showManagerAgent) return false;
    return true;
  });
}

/**
 * @param {ContactColumnDef[]} applicable
 * @returns {string[]}
 */
export function getDefaultVisibleContactColumnIds(applicable) {
  const ids = new Set(applicable.map((c) => c.id));
  const order = [
    'display_name',
    'primary_phone',
    'email',
    'tag_names',
    'status_name',
    'manager_name',
    'assigned_user_name',
  ];
  return order.filter((id) => ids.has(id));
}

/**
 * @param {ContactColumnDef[]} applicableColumns
 * @returns {string[]}
 */
export function loadContactVisibleColumnIds(applicableColumns) {
  const applicableIds = applicableColumns.map((c) => c.id);
  const defaults = getDefaultVisibleContactColumnIds(applicableColumns);

  try {
    const raw = localStorage.getItem(CONTACT_TABLE_COLUMNS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const vis = Array.isArray(parsed.visible) ? parsed.visible : [];
    let cleaned = [...new Set(vis.filter((id) => applicableIds.includes(id)))];
    if (applicableIds.includes('status_name') && !cleaned.includes('status_name')) {
      const tagIdx = cleaned.indexOf('tag_names');
      if (tagIdx >= 0) cleaned.splice(tagIdx + 1, 0, 'status_name');
      else cleaned = ['status_name', ...cleaned];
      cleaned = [...new Set(cleaned)];
    }
    return cleaned.length ? cleaned : defaults;
  } catch {
    return defaults;
  }
}

/**
 * @param {string[]} visibleIds
 */
export function saveContactVisibleColumnIds(visibleIds) {
  const unique = [...new Set(visibleIds)];
  localStorage.setItem(CONTACT_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify({ visible: unique }));
}

/**
 * @param {Array<{ field_id?: number, id?: number, name?: string, label?: string, type?: string }>} customFields
 * @returns {ContactColumnDef[]}
 */
export function buildContactCustomFieldColumnDefs(customFields) {
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
 * @param {ContactColumnDef[]} applicableBase
 * @param {Array<{ field_id?: number, id?: number, name?: string, label?: string, type?: string }>} customFields
 */
export function mergeApplicableContactColumnsWithCustomFields(applicableBase, customFields) {
  return [...applicableBase, ...buildContactCustomFieldColumnDefs(customFields)];
}

