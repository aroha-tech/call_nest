import { query } from '../../config/db.js';
import { parseImportBufferToRecords } from '../../utils/importSpreadsheetBuffer.js';
import {
  buildPhonesFromCsvRow,
  extractNamesAndEmailFromNormalizedRow,
  pickFirstByAliasKeys,
  SOURCE_KEYS,
  STATUS_KEYS,
  PROPERTY_KEYS,
  BUDGET_KEYS,
  CITY_KEYS,
  STATE_KEYS,
  PIN_CODE_KEYS,
  SERVICES_KEYS,
  REMARK_KEYS,
  REMARK_STATUS_KEYS,
  ASSIGN_DATE_KEYS,
  LEAD_DATE_KEYS,
  LEAD_TIMESTAMP_KEYS,
  ASSIGN_STATUS_KEYS,
  COUNTRY_KEYS,
  ADDRESS_KEYS,
  ADDRESS_LINE2_KEYS,
  COMPANY_KEYS,
  JOB_TITLE_KEYS,
  WEBSITE_KEYS,
  INDUSTRY_KEYS,
  DATE_OF_BIRTH_KEYS,
  TAX_ID_KEYS,
  suggestImportColumnTarget,
  suggestNewCustomFieldType,
  IMPORT_CORE_FIELD_OPTIONS,
  pickFirstByAliasKeysRespectingIgnore,
  splitFullNameToFirstLast,
} from '../../utils/leadImportCsvHelpers.js';
import * as contactTagsService from './contactTagsService.js';
import * as contactAssignmentHistoryService from './contactAssignmentHistoryService.js';

function assertUniquePhoneLabels(phones) {
  if (!Array.isArray(phones)) return;
  const seen = new Set();
  for (const p of phones) {
    const label = (p?.label || 'mobile').toLowerCase();
    if (seen.has(label)) {
      const err = new Error(`Only one phone number is allowed per label (${label})`);
      err.status = 400;
      throw err;
    }
    seen.add(label);
  }
}

function normalizeDateOfBirthForDb(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

function trimStr(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Normalize CSV cell for contact_custom_field_values.value_text by field type. */
function normalizeImportedCustomFieldValue(raw, fieldType) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (fieldType === 'date') {
    const iso = normalizeDateOfBirthForDb(s);
    if (iso) return iso;
    const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (dmy) {
      const dd = parseInt(dmy[1], 10);
      const mm = parseInt(dmy[2], 10);
      let yyyy = parseInt(dmy[3], 10);
      if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${yyyy}-${pad(mm)}-${pad(dd)}`;
      }
    }
    return s;
  }
  if (fieldType === 'boolean') {
    const lower = s.toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(lower)) return '1';
    if (['0', 'false', 'no', 'n', 'off'].includes(lower)) return '0';
    return s;
  }
  if (fieldType === 'number') {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? String(n) : s;
  }
  if (fieldType === 'multiselect' || fieldType === 'multiselect_dropdown') {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.map((x) => String(x).trim()).filter(Boolean));
      }
    } catch {
      // fall through
    }
    const parts = s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
    return JSON.stringify(parts);
  }
  return s;
}

export function buildOwnershipWhere(user) {
  const clauses = ['c.tenant_id = ?', 'c.deleted_at IS NULL'];
  const params = [user.tenantId];

  if (user.role === 'agent') {
    clauses.push('c.assigned_user_id = ?');
    params.push(user.id);
  } else if (user.role === 'manager') {
    clauses.push('c.manager_id = ?');
    params.push(user.id);
  }

  return { whereSQL: clauses.join(' AND '), params };
}

/**
 * Optional list/export filters. Values: undefined (omit), 'unassigned', or positive user id (number).
 * Agents ignore; managers only their team + valid agents; admins validated against tenant users.
 */
async function applyContactListFilters(tenantId, user, whereClauses, params, { filterManagerId, filterAssignedUserId }) {
  if (user.role === 'agent') {
    return;
  }

  if (user.role === 'manager') {
    if (filterManagerId !== undefined && filterManagerId !== 'unassigned') {
      if (Number(filterManagerId) !== Number(user.id)) {
        const err = new Error('Managers can only filter within their team');
        err.status = 403;
        throw err;
      }
    }
    if (filterManagerId === 'unassigned') {
      const err = new Error('Managers cannot filter by unassigned pool');
      err.status = 403;
      throw err;
    }

    if (filterAssignedUserId !== undefined && filterAssignedUserId !== 'unassigned') {
      const [ag] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0 AND manager_id = ?
         LIMIT 1`,
        [filterAssignedUserId, tenantId, user.id]
      );
      if (!ag) {
        const err = new Error('Invalid agent filter');
        err.status = 403;
        throw err;
      }
      whereClauses.push('c.assigned_user_id = ?');
      params.push(Number(filterAssignedUserId));
    } else if (filterAssignedUserId === 'unassigned') {
      whereClauses.push('c.assigned_user_id IS NULL');
    }
    return;
  }

  if (user.role === 'admin') {
    if (filterManagerId === 'unassigned') {
      whereClauses.push('c.manager_id IS NULL');
    } else if (filterManagerId !== undefined) {
      const [m] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0
         LIMIT 1`,
        [filterManagerId, tenantId]
      );
      if (!m) {
        const err = new Error('Invalid manager filter');
        err.status = 400;
        throw err;
      }
      whereClauses.push('c.manager_id = ?');
      params.push(Number(filterManagerId));
    }

    if (filterAssignedUserId === 'unassigned') {
      whereClauses.push('c.assigned_user_id IS NULL');
    } else if (filterAssignedUserId !== undefined) {
      const [ag] = await query(
        `SELECT id FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0
         LIMIT 1`,
        [filterAssignedUserId, tenantId]
      );
      if (!ag) {
        const err = new Error('Invalid agent filter');
        err.status = 400;
        throw err;
      }
      whereClauses.push('c.assigned_user_id = ?');
      params.push(Number(filterAssignedUserId));
    }
  }
}

/**
 * When an agent's `users.manager_id` changes, set `contacts.manager_id` on every non-deleted row
 * assigned to that agent so team visibility matches (manager list + reporting).
 */
export async function syncContactsManagerForAgent(tenantId, agentUserId, newManagerId, updatedByUserId = null) {
  const mid = newManagerId === undefined || newManagerId === '' ? null : Number(newManagerId);
  await query(
    `UPDATE contacts
     SET manager_id = ?, updated_by = ?
     WHERE tenant_id = ? AND assigned_user_id = ? AND deleted_at IS NULL`,
    [mid, updatedByUserId, tenantId, agentUserId]
  );
}

/** Whitelist for GET /contacts list sorting (SQL fragments). */
const CONTACT_LIST_SORT_COLUMNS = {
  display_name: 'c.display_name',
  primary_phone: 'p.phone',
  email: 'c.email',
  tag_names: 'tag_names',
  campaign_name: 'cam.name',
  type: 'c.type',
  manager_name: 'mgr.name',
  assigned_user_name: 'ag.name',
  source: 'c.source',
  city: 'c.city',
  company: 'c.company',
  website: 'c.website',
  job_title: 'c.job_title',
  industry: 'c.industry',
  state: 'c.state',
  country: 'c.country',
  pin_code: 'c.pin_code',
  address: 'c.address',
  address_line_2: 'c.address_line_2',
  tax_id: 'c.tax_id',
  date_of_birth: 'c.date_of_birth',
  created_at: 'c.created_at',
};

/** Column filters: simple `c.*` string fields (shared handler) */
const CONTACT_LIST_SIMPLE_TEXT_FILTER_COL = {
  source: 'c.source',
  city: 'c.city',
  company: 'c.company',
  website: 'c.website',
  job_title: 'c.job_title',
  industry: 'c.industry',
  state: 'c.state',
  country: 'c.country',
  pin_code: 'c.pin_code',
  address: 'c.address',
  address_line_2: 'c.address_line_2',
  tax_id: 'c.tax_id',
};

function resolveContactListOrderBy(sortBy, sortDir) {
  const col = sortBy && CONTACT_LIST_SORT_COLUMNS[sortBy];
  if (!col) {
    return 'c.created_at DESC, c.id DESC';
  }
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  return `${col} ${dir}, c.id ASC`;
}

const CONTACT_LIST_JOIN_FROM = `
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN campaigns cam
       ON cam.id = c.campaign_id AND cam.tenant_id = c.tenant_id AND cam.deleted_at IS NULL
     LEFT JOIN users mgr
       ON mgr.id = c.manager_id AND mgr.tenant_id = c.tenant_id AND mgr.is_deleted = 0
     LEFT JOIN users ag
       ON ag.id = c.assigned_user_id AND ag.tenant_id = c.tenant_id AND ag.is_deleted = 0`;

const COLUMN_FILTER_FIELDS = new Set([
  'display_name',
  'primary_phone',
  'email',
  'tag_names',
  'campaign_name',
  'type',
  'manager_name',
  'assigned_user_name',
  'source',
  'city',
  'company',
  'website',
  'job_title',
  'industry',
  'state',
  'country',
  'pin_code',
  'address',
  'address_line_2',
  'tax_id',
  'date_of_birth',
  'created_at',
]);

const COLUMN_FILTER_OPS = new Set(['empty', 'not_empty', 'contains', 'not_contains', 'starts_with', 'ends_with']);

/**
 * @param {unknown} raw
 * @returns {Array<{ field: string, op: string, value?: string }>}
 */
export function normalizeContactListColumnFilters(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  let arr;
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const byField = new Map();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const field = String(item.field || '').trim();
    const op = String(item.op || '').trim();
    if (!COLUMN_FILTER_FIELDS.has(field) || !COLUMN_FILTER_OPS.has(op)) continue;
    const value = item.value == null ? '' : String(item.value).trim();
    if (value.length > 200) continue;
    if (['contains', 'not_contains', 'starts_with', 'ends_with'].includes(op) && value === '') continue;
    byField.set(field, { field, op, value });
  }
  return [...byField.values()].slice(0, 12);
}

/**
 * @param {string[]} whereClauses
 * @param {unknown[]} params
 * @param {Array<{ field: string, op: string, value?: string }>} rules
 */
function applyContactListColumnFilters(whereClauses, params, rules) {
  if (!rules || rules.length === 0) return;

  const likeWord = (v) => `%${v}%`;
  const starts = (v) => `${v}%`;
  const ends = (v) => `%${v}`;

  for (const { field, op, value } of rules) {
    switch (field) {
      case 'display_name':
        if (op === 'empty') {
          whereClauses.push(
            `((c.display_name IS NULL OR TRIM(c.display_name) = '')
              AND (c.first_name IS NULL OR TRIM(c.first_name) = '')
              AND (c.last_name IS NULL OR TRIM(c.last_name) = '')
              AND (c.email IS NULL OR TRIM(c.email) = ''))`
          );
        } else if (op === 'not_empty') {
          whereClauses.push(
            `((c.display_name IS NOT NULL AND TRIM(c.display_name) != '')
              OR (c.first_name IS NOT NULL AND TRIM(c.first_name) != '')
              OR (c.last_name IS NOT NULL AND TRIM(c.last_name) != '')
              OR (c.email IS NOT NULL AND TRIM(c.email) != ''))`
          );
        } else if (op === 'contains') {
          const q = likeWord(value);
          whereClauses.push(
            `(c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)`
          );
          params.push(q, q, q, q);
        } else if (op === 'not_contains') {
          const q = likeWord(value);
          whereClauses.push(
            `NOT (c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)`
          );
          params.push(q, q, q, q);
        } else if (op === 'starts_with') {
          const q = starts(value);
          whereClauses.push(
            `(c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)`
          );
          params.push(q, q, q, q);
        } else if (op === 'ends_with') {
          const q = ends(value);
          whereClauses.push(
            `(c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)`
          );
          params.push(q, q, q, q);
        }
        break;
      case 'primary_phone':
        if (op === 'empty') {
          whereClauses.push(`(p.phone IS NULL OR TRIM(p.phone) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(p.phone IS NOT NULL AND TRIM(p.phone) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(p.phone LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(p.phone IS NULL OR p.phone NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(p.phone LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(p.phone LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'email':
        if (op === 'empty') {
          whereClauses.push(`(c.email IS NULL OR TRIM(c.email) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.email IS NOT NULL AND TRIM(c.email) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(c.email LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(c.email IS NULL OR c.email NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(c.email LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(c.email LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'tag_names': {
        const tagFrom = `
          SELECT 1 FROM contact_tag_assignments cta_f
          INNER JOIN contact_tags ct_f ON ct_f.id = cta_f.tag_id AND ct_f.tenant_id = cta_f.tenant_id
          WHERE cta_f.contact_id = c.id AND cta_f.tenant_id = c.tenant_id AND ct_f.deleted_at IS NULL`;
        if (op === 'empty') {
          whereClauses.push(`NOT EXISTS (${tagFrom})`);
        } else if (op === 'not_empty') {
          whereClauses.push(`EXISTS (${tagFrom})`);
        } else if (op === 'contains') {
          whereClauses.push(`EXISTS (${tagFrom} AND ct_f.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`NOT EXISTS (${tagFrom} AND ct_f.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`EXISTS (${tagFrom} AND ct_f.name LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`EXISTS (${tagFrom} AND ct_f.name LIKE ?)`);
          params.push(ends(value));
        }
        break;
      }
      case 'campaign_name':
        if (op === 'empty') {
          whereClauses.push(`(c.campaign_id IS NULL OR cam.name IS NULL OR TRIM(cam.name) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.campaign_id IS NOT NULL AND cam.name IS NOT NULL AND TRIM(cam.name) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(cam.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(cam.name IS NULL OR cam.name NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(cam.name LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(cam.name LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'type':
        if (op === 'empty') {
          whereClauses.push(`(c.type IS NULL OR TRIM(c.type) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.type IS NOT NULL AND TRIM(c.type) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(c.type LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(c.type IS NULL OR c.type NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(c.type LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(c.type LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'manager_name':
        if (op === 'empty') {
          whereClauses.push(`(c.manager_id IS NULL)`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.manager_id IS NOT NULL)`);
        } else if (op === 'contains') {
          whereClauses.push(`(mgr.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(mgr.name IS NULL OR mgr.name NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(mgr.name LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(mgr.name LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'assigned_user_name':
        if (op === 'empty') {
          whereClauses.push(`(c.assigned_user_id IS NULL)`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.assigned_user_id IS NOT NULL)`);
        } else if (op === 'contains') {
          whereClauses.push(`(ag.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(ag.name IS NULL OR ag.name NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(ag.name LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(ag.name LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'source':
      case 'city':
      case 'company':
      case 'website':
      case 'job_title':
      case 'industry':
      case 'state':
      case 'country':
      case 'pin_code':
      case 'address':
      case 'address_line_2':
      case 'tax_id': {
        const col = CONTACT_LIST_SIMPLE_TEXT_FILTER_COL[field];
        if (!col) break;
        if (op === 'empty') {
          whereClauses.push(`(${col} IS NULL OR TRIM(${col}) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(${col} IS NOT NULL AND TRIM(${col}) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(${col} LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(${col} IS NULL OR ${col} NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(${col} LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(${col} LIKE ?)`);
          params.push(ends(value));
        }
        break;
      }
      case 'date_of_birth':
        if (op === 'empty') {
          whereClauses.push(`(c.date_of_birth IS NULL)`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.date_of_birth IS NOT NULL)`);
        } else if (op === 'contains') {
          whereClauses.push(`(CAST(c.date_of_birth AS CHAR) LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(c.date_of_birth IS NULL OR CAST(c.date_of_birth AS CHAR) NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(CAST(c.date_of_birth AS CHAR) LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(CAST(c.date_of_birth AS CHAR) LIKE ?)`);
          params.push(ends(value));
        }
        break;
      case 'created_at':
        if (op === 'empty') {
          whereClauses.push(`(c.created_at IS NULL)`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.created_at IS NOT NULL)`);
        } else if (op === 'contains') {
          whereClauses.push(`(CAST(c.created_at AS CHAR) LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(c.created_at IS NULL OR CAST(c.created_at AS CHAR) NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(CAST(c.created_at AS CHAR) LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(CAST(c.created_at AS CHAR) LIKE ?)`);
          params.push(ends(value));
        }
        break;
      default:
        break;
    }
  }
}

export async function listContacts(
  tenantId,
  user,
  {
    search = '',
    page = 1,
    limit = 20,
    type,
    statusId,
    filterManagerId,
    filterAssignedUserId,
    campaignIdFilter,
    sortBy,
    sortDir,
    columnFilters,
    touchStatus,
  } = {}
) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;
  const orderBySQL = resolveContactListOrderBy(sortBy, sortDir);

  const { whereSQL, params } = buildOwnershipWhere(user);
  const whereClauses = [whereSQL];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }

  if (statusId) {
    whereClauses.push('c.status_id = ?');
    params.push(statusId);
  }

  // touchStatus: 'untouched' | 'touched'
  if (touchStatus === 'untouched') {
    whereClauses.push('(c.last_called_at IS NULL OR c.call_count_total = 0)');
  } else if (touchStatus === 'touched') {
    whereClauses.push('(c.last_called_at IS NOT NULL AND c.call_count_total > 0)');
  }

  if (campaignIdFilter === 'none') {
    whereClauses.push('c.campaign_id IS NULL');
  } else if (campaignIdFilter !== undefined && campaignIdFilter !== null) {
    whereClauses.push('c.campaign_id = ?');
    params.push(Number(campaignIdFilter));
  }

  if (search) {
    const q = `%${search}%`;
    whereClauses.push(
      `(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ?
        OR c.city LIKE ? OR c.company LIKE ? OR EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_s
        INNER JOIN contact_tags ct_s ON ct_s.id = cta_s.tag_id AND ct_s.tenant_id = cta_s.tenant_id
        WHERE cta_s.contact_id = c.id AND cta_s.tenant_id = c.tenant_id AND ct_s.deleted_at IS NULL AND ct_s.name LIKE ?
      ))`
    );
    params.push(q, q, q, q, q, q, q);
  }

  await applyContactListFilters(tenantId, user, whereClauses, params, {
    filterManagerId,
    filterAssignedUserId,
  });

  const normalizedColumnFilters = normalizeContactListColumnFilters(columnFilters);
  applyContactListColumnFilters(whereClauses, params, normalizedColumnFilters);

  const finalWhere = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(DISTINCT c.id) AS total
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}`,
    params
  );
  const total = countRow.total;

  const data = await query(
    `SELECT 
        c.id,
        c.tenant_id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        c.city,
        c.state,
        c.country,
        c.address,
        c.address_line_2,
        c.pin_code,
        c.company,
        c.job_title,
        c.website,
        c.industry,
        c.date_of_birth,
        c.tax_id,
        (SELECT GROUP_CONCAT(DISTINCT ct.name ORDER BY ct.name SEPARATOR ', ')
         FROM contact_tag_assignments cta
         INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
         WHERE cta.tenant_id = c.tenant_id AND cta.contact_id = c.id AND ct.deleted_at IS NULL
        ) AS tag_names,
        c.manager_id,
        c.assigned_user_id,
        mgr.name AS manager_name,
        ag.name AS assigned_user_name,
        c.status_id,
        c.campaign_id,
        cam.name AS campaign_name,
        c.primary_phone_id,
        p.phone AS primary_phone,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.first_called_at,
        c.last_called_at,
        c.call_count_total,
        c.created_at
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}
     ORDER BY ${orderBySQL}
     LIMIT ${limitInt} OFFSET ${offsetInt}`,
    params
  );

  /** field_id → value_text per contact for list columns (Customize columns → tenant custom fields). */
  if (data.length > 0) {
    const contactIds = data.map((row) => row.id);
    const placeholders = contactIds.map(() => '?').join(',');
    const cfRows = await query(
      `SELECT contact_id, field_id, value_text
       FROM contact_custom_field_values
       WHERE tenant_id = ? AND contact_id IN (${placeholders})`,
      [tenantId, ...contactIds]
    );
    const byContact = new Map();
    for (const r of cfRows) {
      let m = byContact.get(r.contact_id);
      if (!m) {
        m = {};
        byContact.set(r.contact_id, m);
      }
      m[String(r.field_id)] = r.value_text;
    }
    for (const row of data) {
      row.custom_field_values = byContact.get(row.id) || {};
    }
  }

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function getContactById(id, tenantId, user) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const finalWhere = `${whereSQL} AND c.id = ?`;
  params.push(id);

  const [row] = await query(
    `SELECT 
        c.id,
        c.tenant_id,
        c.type,
        c.first_name,
        c.last_name,
        c.display_name,
        c.email,
        c.source,
        c.city,
        c.state,
        c.country,
        c.address,
        c.address_line_2,
        c.pin_code,
        c.company,
        c.job_title,
        c.website,
        c.industry,
        c.date_of_birth,
        c.tax_id,
        c.manager_id,
        c.assigned_user_id,
        c.status_id,
        c.campaign_id,
        c.primary_phone_id,
        p.phone AS primary_phone,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.first_called_at,
        c.last_called_at,
        c.call_count_total,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     WHERE ${finalWhere}`,
    params
  );

  if (!row) return null;

  const phones = await query(
    `SELECT id, phone, label, is_primary, created_at
     FROM contact_phones
     WHERE tenant_id = ? AND contact_id = ?
     ORDER BY is_primary DESC, id ASC`,
    [tenantId, id]
  );

  const tags = await contactTagsService.fetchTagsForContact(tenantId, id);

  return {
    ...row,
    phones,
    tags,
    tag_ids: tags.map((t) => t.id),
  };
}

export async function createContact(tenantId, user, payload) {
  const {
    type = 'lead',
    first_name,
    last_name,
    display_name,
    email,
    source,
    city,
    state,
    country,
    address,
    address_line_2,
    pin_code,
    company,
    job_title,
    website,
    industry,
    date_of_birth,
    tax_id,
    tag_ids,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones = [],
    custom_fields = [],
    created_source,
  } = payload;

  assertUniquePhoneLabels(phones);

  // Determine ownership defaults for agent-created contacts
  let resolvedManagerId = manager_id || null;
  let resolvedAssignedUserId = assigned_user_id || null;

  if (user.role === 'agent') {
    resolvedAssignedUserId = user.id;
    if (!resolvedManagerId) {
      const [userRow] = await query(
        `SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
        [user.id, tenantId]
      );
      resolvedManagerId = userRow?.manager_id ?? null;
    }
  }

  // Manager-created leads/contacts: default owning manager and assignee to self when not provided.
  // (Optional assigned_user_id in payload assigns to a team agent instead.)
  if (user.role === 'manager') {
    if (!resolvedManagerId) {
      resolvedManagerId = user.id;
    }
    if (!resolvedAssignedUserId) {
      resolvedAssignedUserId = user.id;
    }
  }

  const dob = date_of_birth !== undefined && date_of_birth !== null ? normalizeDateOfBirthForDb(date_of_birth) : null;

  const result = await query(
    `INSERT INTO contacts (
        tenant_id,
        type,
        first_name,
        last_name,
        display_name,
        email,
        source,
        city,
        state,
        country,
        address,
        address_line_2,
        pin_code,
        company,
        job_title,
        website,
        industry,
        date_of_birth,
        tax_id,
        manager_id,
        assigned_user_id,
        status_id,
        campaign_id,
        created_source,
        created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      type,
      first_name || null,
      last_name || null,
      display_name,
      email || null,
      source || null,
      trimStr(city),
      trimStr(state),
      trimStr(country),
      trimStr(address),
      trimStr(address_line_2),
      trimStr(pin_code),
      trimStr(company),
      trimStr(job_title),
      trimStr(website),
      trimStr(industry),
      dob,
      trimStr(tax_id),
      resolvedManagerId,
      resolvedAssignedUserId,
      status_id || null,
      campaign_id || null,
      created_source || 'manual',
      user.id,
    ]
  );

  const contactId = result.insertId;

  // Insert phones
  let primaryPhoneId = null;
  if (Array.isArray(phones) && phones.length > 0) {
    for (const phone of phones) {
      if (!phone?.phone) continue;
      const phoneResult = await query(
        `INSERT INTO contact_phones (
           tenant_id,
           contact_id,
           phone,
           label,
           is_primary
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          tenantId,
          contactId,
          phone.phone,
          phone.label || 'mobile',
          phone.is_primary ? 1 : 0,
        ]
      );
      if (phone.is_primary && !primaryPhoneId) {
        primaryPhoneId = phoneResult.insertId;
      }
    }
  }

  if (primaryPhoneId) {
    await query(
      `UPDATE contacts SET primary_phone_id = ? WHERE id = ? AND tenant_id = ?`,
      [primaryPhoneId, contactId, tenantId]
    );
  }

  // Insert custom fields
  if (Array.isArray(custom_fields) && custom_fields.length > 0) {
    for (const field of custom_fields) {
      if (!field?.field_id) continue;
      await query(
        `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [tenantId, contactId, field.field_id, field.value_text ?? null]
      );
    }
  }

  await contactTagsService.syncContactTagAssignments(tenantId, user, contactId, tag_ids);

  return getContactById(contactId, tenantId, user);
}

function normalizeOptionalUserId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchUserBrief(tenantId, userId) {
  const [row] = await query(
    `SELECT id, role, manager_id FROM users
     WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1`,
    [userId, tenantId]
  );
  return row || null;
}

/**
 * Enforce CRM ownership rules on PATCH (scenarios 6–8).
 */
async function assertCanChangeContactOwnership(tenantId, user, payload, existing) {
  const { manager_id, assigned_user_id } = payload;

  if (user.role === 'admin') {
    if (manager_id !== undefined && manager_id !== null && manager_id !== '') {
      const mid = normalizeOptionalUserId(manager_id);
      if (mid != null) {
        const [mgr] = await query(
          `SELECT id FROM users
           WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
          [mid, tenantId]
        );
        if (!mgr) {
          const err = new Error('Invalid manager_id');
          err.status = 400;
          throw err;
        }
      }
    }
    if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
      const aid = normalizeOptionalUserId(assigned_user_id);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
      }
    }
    return;
  }

  if (user.role === 'agent') {
    if (manager_id !== undefined || assigned_user_id !== undefined) {
      const err = new Error('Agents cannot change manager or assignment');
      err.status = 403;
      throw err;
    }
    return;
  }

  if (user.role === 'manager') {
    if (manager_id !== undefined) {
      if (manager_id === null || manager_id === '') {
        const err = new Error('Managers cannot clear manager_id');
        err.status = 403;
        throw err;
      }
      const mid = normalizeOptionalUserId(manager_id);
      if (mid !== Number(user.id)) {
        const err = new Error('Managers can only set themselves as manager');
        err.status = 403;
        throw err;
      }
    }
    if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
      const aid = normalizeOptionalUserId(assigned_user_id);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
        if (Number(agent.manager_id) !== Number(user.id)) {
          const err = new Error('Managers can only assign agents in their team');
          err.status = 403;
          throw err;
        }
        if (existing.manager_id != null && Number(existing.manager_id) !== Number(user.id)) {
          const err = new Error('Contact is not in your team');
          err.status = 403;
          throw err;
        }
      }
    }
  }
}

export async function updateContact(id, tenantId, user, payload) {
  const existing = await getContactById(id, tenantId, user);
  if (!existing) {
    return null;
  }

  const {
    type,
    first_name,
    last_name,
    display_name,
    email,
    source,
    city,
    state,
    country,
    address,
    address_line_2,
    pin_code,
    company,
    job_title,
    website,
    industry,
    date_of_birth,
    tax_id,
    tag_ids,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones,
    custom_fields,
  } = payload;

  await assertCanChangeContactOwnership(tenantId, user, payload, existing);

  if (Array.isArray(phones)) {
    assertUniquePhoneLabels(phones);
  }

  const updates = [];
  const params = [];

  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (first_name !== undefined) {
    updates.push('first_name = ?');
    params.push(first_name || null);
  }
  if (last_name !== undefined) {
    updates.push('last_name = ?');
    params.push(last_name || null);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(display_name);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    params.push(email || null);
  }
  if (source !== undefined) {
    updates.push('source = ?');
    params.push(source || null);
  }
  if (city !== undefined) {
    updates.push('city = ?');
    params.push(trimStr(city));
  }
  if (state !== undefined) {
    updates.push('state = ?');
    params.push(trimStr(state));
  }
  if (country !== undefined) {
    updates.push('country = ?');
    params.push(trimStr(country));
  }
  if (address !== undefined) {
    updates.push('address = ?');
    params.push(trimStr(address));
  }
  if (address_line_2 !== undefined) {
    updates.push('address_line_2 = ?');
    params.push(trimStr(address_line_2));
  }
  if (pin_code !== undefined) {
    updates.push('pin_code = ?');
    params.push(trimStr(pin_code));
  }
  if (company !== undefined) {
    updates.push('company = ?');
    params.push(trimStr(company));
  }
  if (job_title !== undefined) {
    updates.push('job_title = ?');
    params.push(trimStr(job_title));
  }
  if (website !== undefined) {
    updates.push('website = ?');
    params.push(trimStr(website));
  }
  if (industry !== undefined) {
    updates.push('industry = ?');
    params.push(trimStr(industry));
  }
  if (date_of_birth !== undefined) {
    updates.push('date_of_birth = ?');
    params.push(date_of_birth === null || date_of_birth === '' ? null : normalizeDateOfBirthForDb(date_of_birth));
  }
  if (tax_id !== undefined) {
    updates.push('tax_id = ?');
    params.push(trimStr(tax_id));
  }
  if (status_id !== undefined) {
    updates.push('status_id = ?');
    params.push(status_id || null);
  }
  if (campaign_id !== undefined) {
    updates.push('campaign_id = ?');
    params.push(campaign_id || null);
  }
  if (manager_id !== undefined) {
    updates.push('manager_id = ?');
    params.push(manager_id || null);
  }
  if (assigned_user_id !== undefined) {
    updates.push('assigned_user_id = ?');
    params.push(assigned_user_id || null);
  }

  // Track who performed the update
  updates.push('updated_by = ?');
  params.push(user.id);

  if (updates.length > 0) {
    params.push(id, tenantId);
    await query(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );
  }

  // Record assignment history if ownership fields were changed by this update call.
  // (assignment bulk uses assignContacts which should also record history)
  const nextManager =
    payload.manager_id !== undefined ? (payload.manager_id || null) : existing.manager_id ?? null;
  const nextAssigned =
    payload.assigned_user_id !== undefined
      ? (payload.assigned_user_id || null)
      : existing.assigned_user_id ?? null;
  const nextCampaign =
    payload.campaign_id !== undefined ? (payload.campaign_id || null) : existing.campaign_id ?? null;

  const changed =
    (payload.manager_id !== undefined && Number(nextManager || 0) !== Number(existing.manager_id || 0)) ||
    (payload.assigned_user_id !== undefined &&
      Number(nextAssigned || 0) !== Number(existing.assigned_user_id || 0)) ||
    (payload.campaign_id !== undefined && Number(nextCampaign || 0) !== Number(existing.campaign_id || 0));

  if (changed) {
    await contactAssignmentHistoryService.recordChange(tenantId, {
      contact_id: Number(id),
      changed_by_user_id: user?.id ?? null,
      change_source: 'manual',
      change_reason: 'update_contact',
      from_manager_id: existing.manager_id ?? null,
      to_manager_id: nextManager,
      from_assigned_user_id: existing.assigned_user_id ?? null,
      to_assigned_user_id: nextAssigned,
      from_campaign_id: existing.campaign_id ?? null,
      to_campaign_id: nextCampaign,
    });
  }

  // Update phones if provided (replace strategy)
  if (Array.isArray(phones)) {
    await query(
      `DELETE FROM contact_phones WHERE tenant_id = ? AND contact_id = ?`,
      [tenantId, id]
    );
    let primaryPhoneId = null;
    for (const phone of phones) {
      if (!phone?.phone) continue;
      const phoneResult = await query(
        `INSERT INTO contact_phones (
           tenant_id,
           contact_id,
           phone,
           label,
           is_primary
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          tenantId,
          id,
          phone.phone,
          phone.label || 'mobile',
          phone.is_primary ? 1 : 0,
        ]
      );
      if (phone.is_primary && !primaryPhoneId) {
        primaryPhoneId = phoneResult.insertId;
      }
    }
    if (primaryPhoneId) {
      await query(
        `UPDATE contacts SET primary_phone_id = ? WHERE id = ? AND tenant_id = ?`,
        [primaryPhoneId, id, tenantId]
      );
    } else {
      await query(
        `UPDATE contacts SET primary_phone_id = NULL WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );
    }
  }

  // Update custom fields if provided
  if (Array.isArray(custom_fields)) {
    for (const field of custom_fields) {
      if (!field?.field_id) continue;
      await query(
        `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [tenantId, id, field.field_id, field.value_text ?? null]
      );
    }
  }

  if (tag_ids !== undefined) {
    await contactTagsService.syncContactTagAssignments(tenantId, user, id, tag_ids);
  }

  return getContactById(id, tenantId, user);
}

async function fetchAgentDeleteFlagsForUser(tenantId, userId) {
  const [row] = await query(
    `SELECT agent_can_delete_leads, agent_can_delete_contacts
     FROM users
     WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0
     LIMIT 1`,
    [userId, tenantId]
  );
  return {
    agent_can_delete_leads: !!row?.agent_can_delete_leads,
    agent_can_delete_contacts: !!row?.agent_can_delete_contacts,
  };
}

function canUserDeleteContactRecord(user, existing, flags) {
  const perms = user.permissions || [];
  if (existing.type === 'lead' && perms.includes('leads.delete')) return true;
  if (existing.type === 'contact' && perms.includes('contacts.delete')) return true;
  if (user.role !== 'agent') return false;
  if (existing.type === 'lead') {
    if (!perms.includes('leads.update')) return false;
    return !!flags.agent_can_delete_leads;
  }
  if (existing.type === 'contact') {
    if (!perms.includes('contacts.update')) return false;
    return !!flags.agent_can_delete_contacts;
  }
  return false;
}

export async function softDeleteContact(
  id,
  tenantId,
  user,
  { deleted_source = 'manual', agentDeleteFlags: agentDeleteFlagsOpt = null } = {}
) {
  const existing = await getContactById(id, tenantId, user);
  if (!existing) return null;

  const flags =
    agentDeleteFlagsOpt ??
    (user?.role === 'agent'
      ? await fetchAgentDeleteFlagsForUser(tenantId, user.id)
      : { agent_can_delete_leads: false, agent_can_delete_contacts: false });
  if (!canUserDeleteContactRecord(user, existing, flags)) {
    const err = new Error('You do not have permission to delete this record');
    err.status = 403;
    throw err;
  }

  await query(
    `UPDATE contacts
     SET deleted_at = NOW(),
         deleted_by = ?,
         deleted_source = ?,
         updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [user.id, deleted_source || 'manual', user.id, id, tenantId]
  );

  return { id: Number(id), deleted_at: new Date().toISOString() };
}

const BULK_DELETE_MAX = 100;

export async function softDeleteContactsBulk(ids, tenantId, user, { deleted_source = 'manual' } = {}) {
  const raw = Array.isArray(ids) ? ids : [];
  const unique = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    BULK_DELETE_MAX
  );

  const deleted = [];
  const skipped = [];
  const flags =
    user?.role === 'agent'
      ? await fetchAgentDeleteFlagsForUser(tenantId, user.id)
      : { agent_can_delete_leads: false, agent_can_delete_contacts: false };

  for (const id of unique) {
    try {
      const r = await softDeleteContact(id, tenantId, user, { deleted_source, agentDeleteFlags: flags });
      if (r) deleted.push(r.id);
      else skipped.push({ id, reason: 'not_found_or_no_access' });
    } catch (e) {
      if (e.status === 403) skipped.push({ id, reason: 'forbidden' });
      else throw e;
    }
  }

  return { deleted, skipped, deletedCount: deleted.length };
}

export async function assignContacts(tenantId, user, payload) {
  const { contactIds, manager_id, assigned_user_id, campaign_id } = payload || {};

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    const err = new Error('contactIds must be a non-empty array');
    err.status = 400;
    throw err;
  }

  if (user.role === 'agent') {
    const err = new Error('Agents cannot assign or unassign contacts');
    err.status = 403;
    throw err;
  }

  const midProvided = manager_id !== undefined;
  const aidProvided = assigned_user_id !== undefined;
  const cidProvided = campaign_id !== undefined;

  if (!midProvided && !aidProvided && !cidProvided) {
    const err = new Error('Provide at least one of: manager_id, assigned_user_id, campaign_id');
    err.status = 400;
    throw err;
  }

  const normalizedMid = midProvided ? normalizeOptionalUserId(manager_id) : undefined;
  const normalizedAid = aidProvided ? normalizeOptionalUserId(assigned_user_id) : undefined;

  if (user.role === 'manager') {
    if (midProvided && normalizedMid !== null && Number(normalizedMid) !== Number(user.id)) {
      const err = new Error('Managers can only set themselves as owning manager');
      err.status = 403;
      throw err;
    }
    if (midProvided && normalizedMid === null) {
      const err = new Error('Managers cannot clear manager_id (use a tenant admin)');
      err.status = 403;
      throw err;
    }
  }

  const ids = [...new Set(contactIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) {
    const err = new Error('contactIds must contain valid numeric ids');
    err.status = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const contacts = await query(
    `SELECT id, manager_id, assigned_user_id FROM contacts
     WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [tenantId, ...ids]
  );

  if (contacts.length !== ids.length) {
    const err = new Error('One or more contacts were not found');
    err.status = 400;
    throw err;
  }

  if (user.role === 'manager') {
    const foreign = contacts.filter((c) => c.manager_id != null && Number(c.manager_id) !== Number(user.id));
    if (foreign.length > 0) {
      const err = new Error('Managers can only assign contacts in their own team');
      err.status = 403;
      throw err;
    }
  }

  if (midProvided && normalizedMid != null) {
    const [managerRow] = await query(
      `SELECT id FROM users
       WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
      [normalizedMid, tenantId]
    );
    if (!managerRow) {
      const err = new Error('Invalid manager_id');
      err.status = 400;
      throw err;
    }
  }

  if (midProvided && normalizedMid === null && user.role !== 'admin') {
    const err = new Error('Only admins can move contacts to the unassigned pool');
    err.status = 403;
    throw err;
  }

  let agentRow = null;
  if (aidProvided && normalizedAid != null) {
    agentRow = await fetchUserBrief(tenantId, normalizedAid);
    if (!agentRow || agentRow.role !== 'agent') {
      const err = new Error('assigned_user_id must be an agent');
      err.status = 400;
      throw err;
    }
    if (user.role === 'manager' && Number(agentRow.manager_id) !== Number(user.id)) {
      const err = new Error('Managers can only assign agents in their team');
      err.status = 403;
      throw err;
    }
  }

  const setClauses = [];
  const setParams = [];

  let clearAgentForManagerChange = false;
  if (midProvided) {
    if (normalizedMid === null) {
      clearAgentForManagerChange = true;
    } else {
      clearAgentForManagerChange = contacts.some(
        (c) => Number(c.manager_id || 0) !== Number(normalizedMid)
      );
    }
  }

  if (midProvided) {
    setClauses.push('manager_id = ?');
    setParams.push(normalizedMid);
  }

  if (aidProvided) {
    setClauses.push('assigned_user_id = ?');
    setParams.push(normalizedAid);
  } else if (clearAgentForManagerChange) {
    setClauses.push('assigned_user_id = ?');
    setParams.push(null);
  }

  // Assigning an agent without changing manager: contacts must share one team (or all pool) so we know which manager_id to set.
  // Unassigning (assigned_user_id: null) applies to any mix of managers — no same-manager rule.
  if (!midProvided && aidProvided && normalizedAid != null) {
    const mgrKeys = [...new Set(contacts.map((c) => (c.manager_id == null ? 'null' : String(c.manager_id))))];
    if (mgrKeys.length > 1) {
      const err = new Error(
        'Bulk agent assign requires all selected contacts to share the same manager (or all unassigned)'
      );
      err.status = 400;
      throw err;
    }
    const poolMgr = contacts[0].manager_id;

    if (poolMgr == null) {
      if (!setClauses.some((s) => s.startsWith('manager_id'))) {
        setClauses.unshift('manager_id = ?');
        setParams.unshift(agentRow.manager_id);
      }
    } else if (Number(agentRow.manager_id) !== Number(poolMgr)) {
      const err = new Error('Agent does not belong to the manager for these contacts');
      err.status = 400;
      throw err;
    }
  }

  if (midProvided && normalizedMid != null && aidProvided && normalizedAid != null) {
    if (Number(agentRow.manager_id) !== Number(normalizedMid)) {
      const err = new Error('Agent does not belong to the selected manager');
      err.status = 400;
      throw err;
    }
  }

  if (cidProvided) {
    setClauses.push('campaign_id = ?');
    setParams.push(campaign_id || null);
  }

  if (setClauses.length === 0) {
    const err = new Error('Nothing to update');
    err.status = 400;
    throw err;
  }

  setClauses.push('updated_by = ?');
  setParams.push(user.id);

  let whereSql = `tenant_id = ? AND id IN (${placeholders})`;
  let whereParams = [tenantId, ...ids];
  if (user.role === 'manager') {
    whereSql += ' AND (manager_id = ? OR manager_id IS NULL)';
    whereParams.push(user.id);
  }

  const updateResult = await query(
    `UPDATE contacts SET ${setClauses.join(', ')} WHERE ${whereSql}`,
    [...setParams, ...whereParams]
  );

  const affectedRows = updateResult?.affectedRows ?? 0;

  const updated = await query(
    `SELECT id, tenant_id, type, first_name, last_name, display_name, email, source, manager_id, assigned_user_id, status_id, campaign_id, created_at
     FROM contacts
     WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [tenantId, ...ids]
  );

  // Record assignment history for each affected row (append-only).
  // Use the "before" snapshot we loaded and the requested target values (normalizedMid/Aid/campaign_id).
  const byIdBefore = new Map(contacts.map((c) => [Number(c.id), c]));
  for (const c of updated) {
    const before = byIdBefore.get(Number(c.id));
    if (!before) continue;
    const changed =
      Number(before.manager_id || 0) !== Number(c.manager_id || 0) ||
      Number(before.assigned_user_id || 0) !== Number(c.assigned_user_id || 0) ||
      (cidProvided && Number((before.campaign_id ?? 0) || 0) !== Number((c.campaign_id ?? 0) || 0));
    if (!changed) continue;
    await contactAssignmentHistoryService.recordChange(tenantId, {
      contact_id: Number(c.id),
      changed_by_user_id: user?.id ?? null,
      change_source: 'manual',
      change_reason: 'assign_contacts',
      from_manager_id: before.manager_id ?? null,
      to_manager_id: c.manager_id ?? null,
      from_assigned_user_id: before.assigned_user_id ?? null,
      to_assigned_user_id: c.assigned_user_id ?? null,
      from_campaign_id: before.campaign_id ?? null,
      to_campaign_id: c.campaign_id ?? null,
    });
  }

  return { updatedCount: affectedRows, data: updated };
}

function normalizeHeader(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function toE164Phone(raw, defaultCountryCode = '+91') {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Excel sometimes exports long numbers as scientific notation (e.g. 9.19877E+11).
  // Convert that into a full integer string first, then normalize.
  const sciMatch = s.match(/^(\d+(?:\.\d+)?)e\+(\d+)$/i);
  const normalizedRaw = sciMatch
    ? (() => {
        const mantissa = sciMatch[1];
        const exp = parseInt(sciMatch[2], 10);
        const parts = mantissa.split('.');
        const intPart = parts[0] || '0';
        const fracPart = parts[1] || '';
        const digitsOnly = `${intPart}${fracPart}`.replace(/[^\d]/g, '');
        const decimals = fracPart.length;
        const zeros = Math.max(0, exp - decimals);
        return `${digitsOnly}${'0'.repeat(zeros)}`;
      })()
    : s;

  // Keep leading +, strip everything else non-digit
  const hasPlus = normalizedRaw.startsWith('+');
  const digits = normalizedRaw.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (hasPlus) return `+${digits}`;

  // If already looks like country+number without +, treat as full
  if (digits.length > 10) return `+${digits}`;

  const ccDigits = String(defaultCountryCode || '+91').replace(/[^\d]/g, '');
  if (!ccDigits) return `+${digits}`;
  return `+${ccDigits}${digits}`;
}

async function resolveContactStatusIdByName(tenantId, statusNameOrCode) {
  const s = String(statusNameOrCode || '').trim();
  if (!s) return null;
  const lowered = s.toLowerCase();

  // Exact code match first, then name match (case-insensitive)
  const rows = await query(
    `SELECT id
     FROM contact_status_master
     WHERE is_deleted = 0
       AND (LOWER(code) = ? OR LOWER(name) = ?)
     LIMIT 1`,
    [lowered, lowered]
  );
  return rows?.[0]?.id ?? null;
}

const CUSTOM_FIELD_TYPES = new Set([
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'multiselect_dropdown',
]);

/** How to interpret cell values: `auto` uses the DB field type (or provider default when creating). */
function effectiveImportValueType(cfg, fallbackType) {
  const iv = cfg?.importValueType;
  if (iv && iv !== 'auto') {
    if (iv === 'checkbox') return 'boolean';
    if (CUSTOM_FIELD_TYPES.has(iv)) return iv;
  }
  return fallbackType || 'text';
}

function effectiveCustomFieldImportType(cfg, fieldDef) {
  return effectiveImportValueType(cfg, fieldDef?.type || 'text');
}

function normalizeNewCustomFieldType(raw) {
  if (raw === 'checkbox') return 'boolean';
  return CUSTOM_FIELD_TYPES.has(raw) ? raw : 'text';
}

function coerceCustomFieldOptionsJson(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length > 0) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

async function ensureCustomFieldDefinition(tenantId, { name, label, type, options_json } = {}) {
  const safeName = normalizeHeader(name);
  const safeLabel = String(label || safeName).trim() || safeName;
  if (!safeName) return null;

  const fieldType = CUSTOM_FIELD_TYPES.has(type) ? type : 'text';
  const optsArr =
    fieldType === 'select' || fieldType === 'multiselect' || fieldType === 'multiselect_dropdown'
      ? coerceCustomFieldOptionsJson(options_json)
      : null;
  const optsStr = optsArr && optsArr.length ? JSON.stringify(optsArr) : null;

  const existing = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ? AND name = ?
     LIMIT 1`,
    [tenantId, safeName]
  );
  if (existing?.[0]?.id) return existing[0];

  try {
    const result = await query(
      `INSERT INTO contact_custom_fields (tenant_id, name, label, type, options_json, is_required, is_active)
       VALUES (?, ?, ?, ?, ?, 0, 1)`,
      [tenantId, safeName, safeLabel, fieldType, optsStr]
    );
    return { id: result.insertId, name: safeName, label: safeLabel, type: fieldType };
  } catch (e) {
    // If another request created it concurrently, fetch again
    const again = await query(
      `SELECT id, name, label, type
       FROM contact_custom_fields
       WHERE tenant_id = ? AND name = ?
       LIMIT 1`,
      [tenantId, safeName]
    );
    return again?.[0] ?? null;
  }
}

/** First-class `contacts` columns (not custom fields). Import + forms map here. */
const CONTACT_DEFAULT_EXTRA_KEYS = [
  'city',
  'state',
  'country',
  'address',
  'address_line_2',
  'pin_code',
  'company',
  'job_title',
  'website',
  'industry',
  'date_of_birth',
  'tax_id',
];

const CONTACT_DEFAULT_EXTRA_KEY_SET = new Set(CONTACT_DEFAULT_EXTRA_KEYS);

/** Auto-created custom fields for import/integration (excludes CONTACT_DEFAULT_EXTRA_KEYS). */
const PROVIDER_COLUMNS_AUTO_CF = [
  { key: 'property', label: 'Property', type: 'text' },
  { key: 'budget', label: 'Budget', type: 'number' },
  { key: 'services', label: 'Services', type: 'text' },
  { key: 'remark', label: 'Remark', type: 'text' },
  { key: 'remark_status', label: 'Remark Status', type: 'text' },
  { key: 'assign_date', label: 'Assign Date', type: 'date' },
  { key: 'lead_date', label: 'Lead Date', type: 'date' },
  { key: 'lead_timestamp', label: 'Time Stamp', type: 'text' },
  { key: 'assign_status', label: 'Assign', type: 'text' },
];

const PROVIDER_ALIAS_BY_KEY = {
  property: PROPERTY_KEYS,
  budget: BUDGET_KEYS,
  city: CITY_KEYS,
  state: STATE_KEYS,
  country: COUNTRY_KEYS,
  address: ADDRESS_KEYS,
  address_line_2: ADDRESS_LINE2_KEYS,
  pin_code: PIN_CODE_KEYS,
  company: COMPANY_KEYS,
  job_title: JOB_TITLE_KEYS,
  website: WEBSITE_KEYS,
  industry: INDUSTRY_KEYS,
  date_of_birth: DATE_OF_BIRTH_KEYS,
  tax_id: TAX_ID_KEYS,
  services: SERVICES_KEYS,
  remark: REMARK_KEYS,
  remark_status: REMARK_STATUS_KEYS,
  assign_date: ASSIGN_DATE_KEYS,
  lead_date: LEAD_DATE_KEYS,
  lead_timestamp: LEAD_TIMESTAMP_KEYS,
  assign_status: ASSIGN_STATUS_KEYS,
};

function applyCoreDefaultsFromNormalized(normalized, mappedCore = {}, headerMapping = null) {
  const out = {};
  for (const key of CONTACT_DEFAULT_EXTRA_KEYS) {
    let val = mappedCore[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      out[key] = key === 'date_of_birth' ? normalizeDateOfBirthForDb(val) : trimStr(val);
      continue;
    }
    let picked = pickFirstByAliasKeysRespectingIgnore(
      normalized,
      PROVIDER_ALIAS_BY_KEY[key] || [],
      headerMapping
    );
    if (picked === undefined || picked === null) {
      const direct = normalized[key];
      if (
        direct !== undefined &&
        direct !== null &&
        String(direct).trim() &&
        !(headerMapping && headerMapping[key]?.target === 'ignore')
      ) {
        picked = direct;
      }
    }
    if (picked === undefined || picked === null || !String(picked).trim()) continue;
    out[key] = key === 'date_of_birth' ? normalizeDateOfBirthForDb(picked) : trimStr(picked);
  }
  return out;
}

function pickDefinedCoreFieldsFromResolved(resolved) {
  const o = {};
  for (const k of CONTACT_DEFAULT_EXTRA_KEYS) {
    if (resolved[k] !== undefined) o[k] = resolved[k];
  }
  return o;
}

/** Labels for core `contacts` extras — same order as IMPORT_CORE_FIELD_OPTIONS subset. */
const CORE_EXTRA_FIELD_META = IMPORT_CORE_FIELD_OPTIONS.filter((o) => CONTACT_DEFAULT_EXTRA_KEY_SET.has(o.key));

/**
 * When a file column is explicitly mapped in `headerMapping`, do not also attach its value to a tenant
 * custom field just because the header text matches a custom field name (e.g. "City" → core city vs CF "city").
 */
function isHeaderMappingOwningColumn(headerMapping, columnKey) {
  return (
    headerMapping &&
    typeof headerMapping === 'object' &&
    Object.prototype.hasOwnProperty.call(headerMapping, columnKey)
  );
}

/** Skip legacy provider auto-fill when this logical field is already mapped via the grid. */
function isProviderLogicalFieldMappedInHeaderMapping(headerMapping, defKey, customFieldDefsById) {
  if (!headerMapping || typeof headerMapping !== 'object') return false;
  const nk = normalizeHeader(defKey);
  for (const cfg of Object.values(headerMapping)) {
    if (!cfg?.target || cfg.target === 'ignore') continue;
    if (cfg.target === defKey) return true;
    if (cfg.target === 'custom' && cfg.customFieldId && customFieldDefsById) {
      const f = customFieldDefsById.get(Number(cfg.customFieldId));
      if (f && normalizeHeader(f.name) === nk) return true;
    }
  }
  return false;
}

/**
 * Same rules as CSV import row processing (may create missing provider-style custom fields).
 * @returns {{ error: string } | { error: null, first_name, last_name, display_name, email, finalSource, resolvedStatusId, providerStatusName, campaign_id, manager_id, assigned_user_id, phones, custom_fields_deduped, primaryPhone }}
 */
async function resolveCsvRowToImportPayload(
  tenantId,
  { normalized, headerMapping, byHeader, defaultCountryCode, customFieldDefsById = null }
) {
  // Drop ignored columns once so no later path (aliases, provider auto-CF, tenant CF by header, core defaults)
  // can re-use their values — fixes "-- unmapped --" still filling City / Custom fields via parallel aliases.
  const row = { ...normalized };
  if (headerMapping && typeof headerMapping === 'object') {
    for (const nk of Object.keys(headerMapping)) {
      if (headerMapping[nk]?.target === 'ignore') {
        delete row[nk];
      }
    }
  }

  let first_name = null;
  let last_name = null;
  let email = null;
  let display_name = null;
  let mappedSource = null;
  let mappedStatusName = null;
  let mappedPrimaryPhone = null;

  const custom_fields = [];
  const mappedCore = {};

  if (headerMapping) {
    for (const [nk, cfg] of Object.entries(headerMapping)) {
      const val = row[nk];
      if (val === undefined) continue;
      const target = cfg?.target;
      if (!target || target === 'ignore') continue;

      if (target === 'first_name') first_name = val;
      else if (target === 'last_name') last_name = val;
      else if (target === 'full_name') {
        const sp = splitFullNameToFirstLast(val);
        if (!first_name) first_name = sp.first_name;
        if (!last_name) last_name = sp.last_name;
      } else if (target === 'display_name') display_name = val;
      else if (target === 'email') email = val;
      else if (target === 'primary_phone') mappedPrimaryPhone = val;
      else if (target === 'source') mappedSource = val;
      else if (target === 'status') mappedStatusName = val;
      else if (CONTACT_DEFAULT_EXTRA_KEY_SET.has(target)) {
        if (val === null || !String(val).trim()) continue;
        mappedCore[target] = target === 'date_of_birth' ? normalizeDateOfBirthForDb(val) : trimStr(val);
      } else if (PROVIDER_COLUMNS_AUTO_CF.some((d) => d.key === target)) {
        if (val === null || !String(val).trim()) continue;
        const def = PROVIDER_COLUMNS_AUTO_CF.find((d) => d.key === target);
        if (!def) continue;
        const existingField = byHeader.get(def.key);
        const field =
          existingField ||
          (await ensureCustomFieldDefinition(tenantId, { name: def.key, label: def.label, type: def.type }));
        if (!field?.id) continue;
        byHeader.set(def.key, field);
        byHeader.set(normalizeHeader(def.label), field);
        const effType = effectiveImportValueType(cfg, field.type);
        const pv = normalizeImportedCustomFieldValue(val, effType);
        custom_fields.push({ field_id: field.id, value_text: pv !== null ? pv : String(val) });
      } else if (target === 'custom' && cfg.customFieldId) {
        const fieldDef = customFieldDefsById?.get(Number(cfg.customFieldId)) || null;
        const effType = effectiveCustomFieldImportType(cfg, fieldDef);
        const pv = normalizeImportedCustomFieldValue(val, effType);
        custom_fields.push({
          field_id: cfg.customFieldId,
          value_text: pv !== null ? pv : val === null ? null : String(val),
        });
      } else if (target === 'new_custom') {
        if (val === null || !String(val).trim()) continue;
        const ft = normalizeNewCustomFieldType(cfg.fieldType);
        const label = String(cfg.fieldLabel || nk).trim() || nk;
        const importNameRaw = `import_${nk}`;
        const importName = importNameRaw.length > 100 ? importNameRaw.slice(0, 100) : importNameRaw;
        let opts = null;
        if (ft === 'select' || ft === 'multiselect' || ft === 'multiselect_dropdown') {
          opts = coerceCustomFieldOptionsJson(cfg.options_json ?? cfg.selectOptions);
        }
        const field = await ensureCustomFieldDefinition(tenantId, {
          name: importName,
          label,
          type: ft,
          options_json: opts,
        });
        if (!field?.id) continue;
        byHeader.set(normalizeHeader(field.name || importName), field);
        byHeader.set(normalizeHeader(label), field);
        const value_text = normalizeImportedCustomFieldValue(val, ft);
        custom_fields.push({ field_id: field.id, value_text });
        if (customFieldDefsById && field?.id) {
          customFieldDefsById.set(Number(field.id), {
            id: field.id,
            name: field.name,
            label: field.label,
            type: ft,
          });
        }
      }
    }
  }

  const extracted = extractNamesAndEmailFromNormalizedRow(row);
  if (!first_name) first_name = extracted.first_name;
  if (!last_name) last_name = extracted.last_name;
  if (!email) email = extracted.email;
  if (!display_name || !String(display_name).trim()) {
    display_name = extracted.display_name;
  }

  if (!display_name || !String(display_name).trim()) {
    const composed = [first_name, last_name].filter(Boolean).join(' ').trim();
    display_name = composed || email || extracted.full_name_raw || null;
  }

  const normalizedForPhones = { ...row };
  if (mappedPrimaryPhone != null && String(mappedPrimaryPhone).trim()) {
    normalizedForPhones.primary_phone = mappedPrimaryPhone;
  }
  const phones = buildPhonesFromCsvRow(normalizedForPhones, defaultCountryCode, toE164Phone);

  if (!display_name || !String(display_name).trim()) {
    return { error: 'display_name is required (or provide first_name/last_name/email)' };
  }

  if (!first_name && !email) {
    return { error: 'Either first_name or email is required' };
  }

  const directSource =
    row.source !== undefined && row.source !== null && String(row.source).trim()
      ? headerMapping?.source?.target === 'ignore'
        ? null
        : row.source
      : null;
  const providerSource = pickFirstByAliasKeysRespectingIgnore(row, SOURCE_KEYS, headerMapping);
  const finalSource = mappedSource || providerSource || directSource;

  const status_id = row.status_id || undefined;
  const providerStatusName =
    mappedStatusName || pickFirstByAliasKeysRespectingIgnore(row, STATUS_KEYS, headerMapping) || null;
  const resolvedStatusId =
    status_id || (providerStatusName ? await resolveContactStatusIdByName(tenantId, providerStatusName) : null);
  const campaign_id = row.campaign_id ? Number(row.campaign_id) : undefined;
  const manager_id = row.manager_id ? Number(row.manager_id) : undefined;
  const assigned_user_id = row.assigned_user_id ? Number(row.assigned_user_id) : undefined;

  for (const [k, v] of Object.entries(row)) {
    if (isHeaderMappingOwningColumn(headerMapping, k)) {
      continue;
    }
    let header = k;
    if (header.startsWith('cf:')) header = header.slice(3);
    const field = byHeader.get(normalizeHeader(header));
    if (!field) continue;
    if (v === undefined) continue;
    const effType = field?.type || 'text';
    const value_text =
      v === null ? null : normalizeImportedCustomFieldValue(v, effType) ?? String(v);
    custom_fields.push({ field_id: field.id, value_text });
  }

  for (const def of PROVIDER_COLUMNS_AUTO_CF) {
    if (isProviderLogicalFieldMappedInHeaderMapping(headerMapping, def.key, customFieldDefsById)) {
      continue;
    }
    let val = pickFirstByAliasKeysRespectingIgnore(
      row,
      PROVIDER_ALIAS_BY_KEY[def.key] || [],
      headerMapping
    );
    if (val === undefined || val === null || !String(val).trim()) {
      const dv = row[def.key];
      if (
        dv !== undefined &&
        dv !== null &&
        String(dv).trim() &&
        !(headerMapping && headerMapping[def.key]?.target === 'ignore')
      ) {
        val = dv;
      }
    }
    if (val === undefined || val === null || !String(val).trim()) continue;
    const existingField = byHeader.get(def.key);
    const field =
      existingField ||
      (await ensureCustomFieldDefinition(tenantId, { name: def.key, label: def.label, type: def.type }));
    if (!field?.id) continue;
    byHeader.set(def.key, field);
    byHeader.set(normalizeHeader(def.label), field);

    const pv = normalizeImportedCustomFieldValue(val, def.type);
    const value_text = pv !== null ? pv : val === null ? null : String(val);
    custom_fields.push({ field_id: field.id, value_text });
  }

  const coreDefaults = applyCoreDefaultsFromNormalized(row, mappedCore, headerMapping);

  const cfByField = new Map();
  for (const c of custom_fields) {
    if (c?.field_id) cfByField.set(c.field_id, c.value_text);
  }
  const custom_fields_deduped = [...cfByField.entries()].map(([field_id, value_text]) => ({
    field_id,
    value_text,
  }));

  const primaryPhone = phones.find((p) => p.is_primary)?.phone || null;

  return {
    error: null,
    first_name,
    last_name,
    display_name,
    email,
    finalSource,
    resolvedStatusId,
    providerStatusName: providerStatusName || null,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones,
    custom_fields_deduped,
    primaryPhone,
    ...coreDefaults,
  };
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportContactsCsv(
  tenantId,
  user,
  {
    search = '',
    type,
    statusId,
    includeCustomFields = true,
    filterManagerId,
    filterAssignedUserId,
    campaignIdFilter,
  } = {}
) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const whereClauses = [whereSQL];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }

  if (statusId) {
    whereClauses.push('c.status_id = ?');
    params.push(statusId);
  }

  if (campaignIdFilter === 'none') {
    whereClauses.push('c.campaign_id IS NULL');
  } else if (campaignIdFilter !== undefined && campaignIdFilter !== null) {
    whereClauses.push('c.campaign_id = ?');
    params.push(Number(campaignIdFilter));
  }

  if (search) {
    const q = `%${search}%`;
    whereClauses.push(
      `(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ?
        OR c.city LIKE ? OR c.company LIKE ? OR EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_s
        INNER JOIN contact_tags ct_s ON ct_s.id = cta_s.tag_id AND ct_s.tenant_id = cta_s.tenant_id
        WHERE cta_s.contact_id = c.id AND cta_s.tenant_id = c.tenant_id AND ct_s.deleted_at IS NULL AND ct_s.name LIKE ?
      ))`
    );
    params.push(q, q, q, q, q, q, q);
  }

  await applyContactListFilters(tenantId, user, whereClauses, params, {
    filterManagerId,
    filterAssignedUserId,
  });

  const finalWhere = `WHERE ${whereClauses.join(' AND ')}`;

  const contacts = await query(
    `SELECT 
        c.id,
        c.type,
        c.display_name,
        c.first_name,
        c.last_name,
        c.email,
        p.phone AS primary_phone,
        c.source,
        c.city,
        c.state,
        c.country,
        c.address,
        c.address_line_2,
        c.pin_code,
        c.company,
        c.job_title,
        c.website,
        c.industry,
        c.date_of_birth,
        c.tax_id,
        (SELECT GROUP_CONCAT(DISTINCT ct.name ORDER BY ct.name SEPARATOR ', ')
         FROM contact_tag_assignments cta
         INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
         WHERE cta.tenant_id = c.tenant_id AND cta.contact_id = c.id AND ct.deleted_at IS NULL
        ) AS tag_names,
        c.campaign_id,
        cam.name AS campaign_name,
        c.status_id,
        c.manager_id,
        c.assigned_user_id,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.created_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN campaigns cam
       ON cam.id = c.campaign_id AND cam.tenant_id = c.tenant_id AND cam.deleted_at IS NULL
     ${finalWhere}
     ORDER BY c.created_at DESC`,
    params
  );

  let customFields = [];
  let valuesByContact = new Map();
  if (includeCustomFields) {
    customFields = await query(
      `SELECT id, name, label
       FROM contact_custom_fields
       WHERE tenant_id = ?
       ORDER BY id ASC`,
      [tenantId]
    );

    const ids = contacts.map((c) => c.id);
    if (ids.length > 0 && customFields.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await query(
        `SELECT contact_id, field_id, value_text
         FROM contact_custom_field_values
         WHERE tenant_id = ? AND contact_id IN (${placeholders})`,
        [tenantId, ...ids]
      );

      for (const r of rows) {
        const map = valuesByContact.get(r.contact_id) || new Map();
        map.set(r.field_id, r.value_text);
        valuesByContact.set(r.contact_id, map);
      }
    }
  }

  const baseHeaders = [
    'id',
    'type',
    'display_name',
    'first_name',
    'last_name',
    'email',
    'primary_phone',
    'source',
    'city',
    'state',
    'country',
    'address',
    'address_line_2',
    'pin_code',
    'company',
    'job_title',
    'website',
    'industry',
    'date_of_birth',
    'tax_id',
    'tags',
    'campaign_id',
    'campaign_name',
    'status_id',
    'manager_id',
    'assigned_user_id',
    'created_source',
    'created_by',
    'updated_by',
    'created_at',
  ];

  const customHeaders = includeCustomFields
    ? customFields.map((f) => `cf:${f.name}`)
    : [];

  const headers = [...baseHeaders, ...customHeaders];
  const lines = [];

  // UTF-8 BOM helps Excel
  lines.push(`\uFEFF${headers.map(csvEscape).join(',')}`);

  for (const c of contacts) {
    const dob =
      c.date_of_birth == null
        ? ''
        : c.date_of_birth instanceof Date
          ? c.date_of_birth.toISOString().slice(0, 10)
          : String(c.date_of_birth).slice(0, 10);
    const base = [
      c.id,
      c.type,
      c.display_name,
      c.first_name,
      c.last_name,
      c.email,
      c.primary_phone,
      c.source,
      c.city,
      c.state,
      c.country,
      c.address,
      c.address_line_2,
      c.pin_code,
      c.company,
      c.job_title,
      c.website,
      c.industry,
      dob,
      c.tax_id,
      c.tag_names || '',
      c.campaign_id,
      c.campaign_name,
      c.status_id,
      c.manager_id,
      c.assigned_user_id,
      c.created_source,
      c.created_by,
      c.updated_by,
      c.created_at ? new Date(c.created_at).toISOString() : '',
    ];

    const cfMap = valuesByContact.get(c.id);
    const cfVals = includeCustomFields
      ? customFields.map((f) => (cfMap ? cfMap.get(f.id) ?? '' : ''))
      : [];

    lines.push([...base, ...cfVals].map(csvEscape).join(','));
  }

  return lines.join('\r\n');
}

export async function importContactsCsv(
  tenantId,
  user,
  {
    buffer,
    type = 'lead',
    mode = 'skip',
    created_source = 'import',
    defaultCountryCode = '+91',
    mapping,
    originalFilename = '',
  } = {}
) {
  const { records, headerRowIndex } = parseImportBufferToRecords(buffer, { originalFilename });

  const allFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const byHeader = new Map();
  const customFieldDefsById = new Map(allFields.map((f) => [f.id, f]));
  for (const f of allFields) {
    byHeader.set(normalizeHeader(f.name), f);
    byHeader.set(normalizeHeader(f.label), f);
  }

  // mapping: { [nk]: { target, customFieldId?, importValueType? } | { target:'new_custom', fieldType, fieldLabel?, selectOptions? } }
  const headerMapping = mapping && typeof mapping === 'object' ? mapping : null;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  // Hard guard to prevent accidental huge imports
  if (records.length > 2000) {
    const err = new Error('CSV import supports up to 2000 rows per upload');
    err.status = 400;
    throw err;
  }

  for (let i = 0; i < records.length; i++) {
    const rowIndex = headerRowIndex + i + 2; // 1-based sheet row (header + data offset)
    const row = records[i] || {};

    try {
      const normalized = {};
      for (const [k, v] of Object.entries(row)) {
        const nk = normalizeHeader(k);
        normalized[nk] = v;
      }

      const resolved = await resolveCsvRowToImportPayload(tenantId, {
        normalized,
        headerMapping,
        byHeader,
        defaultCountryCode,
        customFieldDefsById,
      });

      if (resolved.error) {
        throw new Error(resolved.error);
      }

      const {
        first_name,
        last_name,
        display_name,
        email,
        finalSource,
        resolvedStatusId,
        campaign_id,
        manager_id,
        assigned_user_id,
        phones,
        custom_fields_deduped,
        primaryPhone,
      } = resolved;

      const coreRowFields = pickDefinedCoreFieldsFromResolved(resolved);

      let existingId = null;
      if (primaryPhone) {
        const rows = await query(
          `SELECT c.id
           FROM contact_phones p
           JOIN contacts c
             ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
           WHERE p.tenant_id = ? AND p.phone = ? AND c.deleted_at IS NULL
           LIMIT 1`,
          [tenantId, primaryPhone]
        );
        existingId = rows?.[0]?.id ?? null;
      }

      if (existingId && mode !== 'update') {
        skipped++;
        continue;
      }

      if (existingId && mode === 'update') {
        const payload = {
          type,
          first_name,
          last_name,
          display_name,
          email,
          source: finalSource,
          ...coreRowFields,
          ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
          ...(campaign_id !== undefined ? { campaign_id } : {}),
          ...(manager_id !== undefined ? { manager_id } : {}),
          ...(assigned_user_id !== undefined ? { assigned_user_id } : {}),
          ...(phones.length > 0 ? { phones } : {}),
          ...(custom_fields_deduped.length > 0 ? { custom_fields: custom_fields_deduped } : {}),
        };

        await updateContact(existingId, tenantId, user, payload);
        updated++;
        continue;
      }

      await createContact(tenantId, user, {
        type,
        first_name,
        last_name,
        display_name,
        email,
        source: finalSource,
        ...coreRowFields,
        ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
        ...(campaign_id !== undefined ? { campaign_id } : {}),
        ...(manager_id !== undefined ? { manager_id } : {}),
        ...(assigned_user_id !== undefined ? { assigned_user_id } : {}),
        phones,
        custom_fields: custom_fields_deduped,
        created_source,
      });

      created++;
    } catch (e) {
      errors.push({
        row: rowIndex,
        error: e?.message || 'Import failed',
      });
    }
  }

  return {
    rowCount: records.length,
    created,
    updated,
    skipped,
    failed: errors.length,
    errors,
  };
}

export async function previewResolvedContactsImportCsv(
  tenantId,
  { buffer, mapping, defaultCountryCode = '+91', mode = 'skip', limit = 12, originalFilename = '' } = {}
) {
  const { records, headerRowIndex } = parseImportBufferToRecords(buffer, { originalFilename });

  if (!records || records.length === 0) {
    return { totalRows: 0, mode, sampleRows: [] };
  }

  if (records.length > 2000) {
    const err = new Error('CSV import supports up to 2000 rows per upload');
    err.status = 400;
    throw err;
  }

  const allFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const byHeader = new Map();
  const customFieldDefsById = new Map(allFields.map((f) => [f.id, f]));
  for (const f of allFields) {
    byHeader.set(normalizeHeader(f.name), f);
    byHeader.set(normalizeHeader(f.label), f);
  }

  const headerMapping = mapping && typeof mapping === 'object' ? mapping : null;

  const fieldLabelById = new Map(allFields.map((f) => [f.id, f.label || f.name]));

  const sampleLimit = Math.min(Math.max(1, parseInt(limit, 10) || 12), 50);
  const sampleRows = [];

  for (let i = 0; i < records.length && i < sampleLimit; i++) {
    const rowIndex = headerRowIndex + i + 2;
    const row = records[i] || {};
    const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeHeader(k)] = v;
    }

    const resolved = await resolveCsvRowToImportPayload(tenantId, {
      normalized,
      headerMapping,
      byHeader,
      defaultCountryCode,
      customFieldDefsById,
    });

    if (resolved.error) {
      sampleRows.push({
        sample_row: i + 1,
        row: rowIndex,
        error: resolved.error,
        duplicate_action: null,
      });
      continue;
    }

    let duplicate_action = 'create';
    if (resolved.primaryPhone) {
      const rows = await query(
        `SELECT c.id
         FROM contact_phones p
         JOIN contacts c
           ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
         WHERE p.tenant_id = ? AND p.phone = ? AND c.deleted_at IS NULL
         LIMIT 1`,
        [tenantId, resolved.primaryPhone]
      );
      if (rows?.[0]?.id) {
        duplicate_action = mode === 'update' ? 'update' : 'skip';
      }
    }

    const custom_fields_preview = (resolved.custom_fields_deduped || []).map((c) => {
      let display = c.value_text;
      if (display != null && String(display).trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(display);
          if (Array.isArray(parsed)) display = parsed.join(', ');
        } catch {
          // keep raw
        }
      }
      return {
        label: fieldLabelById.get(c.field_id) || `Field ${c.field_id}`,
        value: display,
      };
    });

    const coreExtras = pickDefinedCoreFieldsFromResolved(resolved);

    sampleRows.push({
      sample_row: i + 1,
      row: rowIndex,
      duplicate_action,
      display_name: resolved.display_name,
      first_name: resolved.first_name,
      last_name: resolved.last_name,
      email: resolved.email,
      primary_phone: resolved.primaryPhone,
      source: resolved.finalSource,
      status: resolved.providerStatusName,
      ...coreExtras,
      custom_fields_preview,
    });
  }

  return {
    totalRows: records.length,
    mode,
    sampleRows,
    standardExtraFieldColumns: CORE_EXTRA_FIELD_META,
  };
}

export async function previewContactsImportCsv(tenantId, { buffer, originalFilename = '' } = {}) {
  const { records } = parseImportBufferToRecords(buffer, { originalFilename });

  if (!records || records.length === 0) {
    return {
      columns: [],
      totalRows: 0,
      customFields: [],
      coreFields: IMPORT_CORE_FIELD_OPTIONS,
      standardExtraFieldColumns: CORE_EXTRA_FIELD_META,
    };
  }

  const firstRows = records.slice(0, 5);
  const headers = Object.keys(firstRows[0] || {});

  const customFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );

  const columns = headers.map((header) => {
    const normalized = normalizeHeader(header);
    const samples = [];
    for (const row of firstRows) {
      const v = row[header];
      if (v !== undefined && v !== null && String(v).trim()) {
        samples.push(String(v));
      }
    }

    const suggested = suggestImportColumnTarget(normalized, customFields);

    return {
      header,
      normalized,
      samples,
      suggested,
      suggestedFieldType: suggestNewCustomFieldType(normalized, samples),
    };
  });

  return {
    totalRows: records.length,
    columns,
    customFields,
    coreFields: IMPORT_CORE_FIELD_OPTIONS,
    standardExtraFieldColumns: CORE_EXTRA_FIELD_META,
  };
}

function pickFirstNonEmpty(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return v;
  }
  return null;
}

function extractLeadPhones(lead, defaultCountryCode) {
  const phones = [];

  // If provider sends explicit array
  if (Array.isArray(lead?.phones)) {
    const safe = lead.phones.filter((p) => p && p.phone);
    safe.forEach((p, idx) => {
      const phoneE164 = toE164Phone(p.phone, defaultCountryCode);
      if (!phoneE164) return;
      const label = String(p.label || (idx === 0 ? 'mobile' : 'work')).trim().toLowerCase() || 'mobile';
      const isPrimary = p.is_primary === 1 || p.is_primary === true || idx === 0;
      phones.push({ phone: phoneE164, label, is_primary: isPrimary ? 1 : 0 });
    });
  }

  // Fallback: common fields
  if (phones.length === 0) {
    const primaryRaw = pickFirstNonEmpty(
      lead?.primary_phone,
      lead?.phone,
      lead?.mobile_phone,
      lead?.mobilePhone,
      lead?.mobileno,
      lead?.phone_number
    );

    if (primaryRaw) {
      const e164 = toE164Phone(primaryRaw, defaultCountryCode);
      if (e164) phones.push({ phone: e164, label: 'mobile', is_primary: 1 });
    }

    const workRaw = pickFirstNonEmpty(lead?.work_phone, lead?.phone_work);
    if (workRaw) {
      const e164 = toE164Phone(workRaw, defaultCountryCode);
      if (e164) phones.push({ phone: e164, label: 'work', is_primary: 0 });
    }

    const homeRaw = pickFirstNonEmpty(lead?.home_phone, lead?.phone_home);
    if (homeRaw) {
      const e164 = toE164Phone(homeRaw, defaultCountryCode);
      if (e164) phones.push({ phone: e164, label: 'home', is_primary: 0 });
    }
  }

  // Ensure only one primary (first primary wins)
  if (phones.length > 0) {
    let primaryIdx = phones.findIndex((p) => p.is_primary === 1);
    if (primaryIdx === -1) primaryIdx = 0;
    phones.forEach((p, idx) => {
      p.is_primary = idx === primaryIdx ? 1 : 0;
    });
  }

  // Ensure unique labels (create/update validates label uniqueness)
  if (phones.length > 0) {
    const seen = new Set();
    phones.forEach((p, idx) => {
      const base = String(p?.label || (idx === 0 ? 'mobile' : 'work')).trim() || 'mobile';
      const key = base.toLowerCase();
      if (seen.has(key)) {
        // Make label unique deterministically
        const fallback = idx === 0 ? `${base}_${idx + 1}` : `alt_${base}_${idx + 1}`;
        p.label = fallback;
      } else {
        p.label = base;
      }
      seen.add(String(p.label).toLowerCase());
    });
  }

  return phones;
}

function extractCustomFieldValues(lead) {
  // Supported formats:
  // - { custom_fields: { property: '1BHK', city: 'Ahmedabad' } }
  // - { customFields: { ... } }
  // - { answers: [{ question: 'City', value: 'Ahmedabad' }, ...] }
  if (lead?.custom_fields && typeof lead.custom_fields === 'object') return lead.custom_fields;
  if (lead?.customFields && typeof lead.customFields === 'object') return lead.customFields;

  const answers = Array.isArray(lead?.answers) ? lead.answers : Array.isArray(lead?.lead_answers) ? lead.lead_answers : null;
  if (!answers) return {};

  const obj = {};
  for (const a of answers) {
    const key = a?.key || a?.field || a?.question || a?.name;
    const value = a?.value ?? a?.answer;
    if (!key) continue;
    obj[key] = value;
  }
  return obj;
}

function leadObjectToNormalizedRow(lead) {
  const n = {};
  if (!lead || typeof lead !== 'object') return n;
  for (const [k, v] of Object.entries(lead)) {
    if (v === undefined) continue;
    if (['phones', 'custom_fields', 'customFields', 'answers', 'lead_answers'].includes(k)) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) continue;
    n[normalizeHeader(k)] = v;
  }
  const cf = extractCustomFieldValues(lead);
  for (const [k, v] of Object.entries(cf)) {
    if (v !== undefined) n[normalizeHeader(k)] = v;
  }
  return n;
}

async function mapCustomFieldsForIntegration(tenantId, leadCustomFields) {
  if (!leadCustomFields || typeof leadCustomFields !== 'object') return [];

  const allFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const byKey = new Map();
  for (const f of allFields) {
    byKey.set(normalizeHeader(f.name), f);
    byKey.set(normalizeHeader(f.label), f);
  }

  const customFields = [];

  for (const [rawKey, rawVal] of Object.entries(leadCustomFields)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;

    const val = rawVal === undefined ? undefined : rawVal;
    if (val === undefined) continue;

    const nk = normalizeHeader(key);
    if (CONTACT_DEFAULT_EXTRA_KEY_SET.has(nk)) continue;

    const existing = byKey.get(nk);
    if (existing) {
      customFields.push({
        field_id: existing.id,
        value_text: val === null ? null : String(val),
      });
      continue;
    }

    const auto = PROVIDER_COLUMNS_AUTO_CF.find((d) => normalizeHeader(d.key) === nk);
    if (auto) {
      const created = await ensureCustomFieldDefinition(tenantId, {
        name: auto.key,
        label: auto.label,
        type: auto.type,
      });
      if (created?.id) {
        byKey.set(normalizeHeader(auto.key), created);
        byKey.set(normalizeHeader(auto.label), created);
        customFields.push({
          field_id: created.id,
          value_text: val === null ? null : String(val),
        });
      }
    }
  }

  return customFields;
}

export async function upsertLeadsFromIntegration(
  tenantId,
  user,
  { leads = [], defaultCountryCode = '+91', integrationCreatedSource = 'integration' } = {}
) {
  const whereBase = buildOwnershipWhere(user);
  const errors = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i] || {};
    const rowIndex = i + 1;

    try {
      const first_name = pickFirstNonEmpty(lead.first_name, lead.firstname, lead.firstName) ?? null;
      const last_name = pickFirstNonEmpty(lead.last_name, lead.lastname, lead.lastName) ?? null;
      const email = pickFirstNonEmpty(lead.email, lead.email_id) ?? null;

      const display_name = pickFirstNonEmpty(
        lead.display_name,
        lead.displayName,
        lead.full_name,
        [first_name, last_name].filter(Boolean).join(' '),
        email
      );

      const source = pickFirstNonEmpty(lead.source, lead.lead_source, lead.leadSource, lead.source_name) ?? null;

      const phones = extractLeadPhones(lead, defaultCountryCode);
      const primaryPhone = phones.find((p) => p.is_primary === 1)?.phone ?? null;

      if (!primaryPhone) {
        const err = new Error('No phone found for lead');
        err.status = 400;
        throw err;
      }

      const providerStatus =
        pickFirstNonEmpty(lead.lead_status, lead.leadStatus, lead.status, lead.status_code, lead.statusCode) ?? null;

      const resolvedStatusId = providerStatus ? await resolveContactStatusIdByName(tenantId, providerStatus) : null;

      const custom_fields = await mapCustomFieldsForIntegration(tenantId, extractCustomFieldValues(lead));
      const coreFromLead = applyCoreDefaultsFromNormalized(leadObjectToNormalizedRow(lead), {});

      const payload = {
        type: 'lead',
        first_name,
        last_name,
        display_name: display_name ?? [first_name, last_name].filter(Boolean).join(' ') ?? email ?? null,
        email,
        source,
        ...coreFromLead,
        ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
        ...(lead.campaign_id ? { campaign_id: Number(lead.campaign_id) } : {}),
        ...(lead.manager_id ? { manager_id: Number(lead.manager_id) } : {}),
        ...(lead.assigned_user_id ? { assigned_user_id: Number(lead.assigned_user_id) } : {}),
        phones,
        custom_fields,
        created_source: integrationCreatedSource,
      };

      // Dedupe by primary phone WITH ownership scope (agent/manager integration user)
      const existingRows = await query(
        `SELECT c.id
         FROM contacts c
         JOIN contact_phones p
           ON p.contact_id = c.id AND p.tenant_id = c.tenant_id
         WHERE ${whereBase.whereSQL}
           AND c.type = 'lead'
           AND p.is_primary = 1
           AND p.phone = ?
         LIMIT 1`,
        [...whereBase.params, primaryPhone]
      );

      const existingId = existingRows?.[0]?.id ?? null;

      if (existingId) {
        await updateContact(existingId, tenantId, user, payload);
        updated++;
      } else {
        await createContact(tenantId, user, payload);
        created++;
      }
    } catch (e) {
      errors.push({
        row: rowIndex,
        error: e?.message || 'Integration lead import failed',
      });
    }
  }

  return { created, updated, failed: errors.length, errors };
}

