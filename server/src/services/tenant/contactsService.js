import { query, withConnection } from '../../config/db.js';
import fs from 'fs/promises';
import { env } from '../../config/env.js';
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
import * as contactActivityEventsService from './contactActivityEventsService.js';
import { createAndDispatchNotification } from './notificationService.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';
import * as tenantIndustryFieldsService from './tenantIndustryFieldsService.js';

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

/** TEXT column — cap length defensively (UTF-8 safe slice on JS string). */
const CONTACT_NOTES_MAX_LEN = 60000;
function normalizeContactNotesForDb(v) {
  const t = trimStr(v);
  if (t == null) return null;
  return t.length > CONTACT_NOTES_MAX_LEN ? t.slice(0, CONTACT_NOTES_MAX_LEN) : t;
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

/** Coerce custom field ids from DB/JSON so Map lookups and inserts always match. */
function normalizeContactImportCustomFieldId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
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
async function applyContactListFilters(
  tenantId,
  user,
  whereClauses,
  params,
  { filterManagerId, filterAssignedUserId, filterManagerIds, filterUnassignedManagers = false } = {}
) {
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
      const err = new Error('Managers cannot filter by records with no manager');
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
    const multiIds = Array.isArray(filterManagerIds)
      ? [...new Set(filterManagerIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
      : [];
    const useMulti = multiIds.length > 0 || filterUnassignedManagers;

    if (useMulti) {
      if (multiIds.length > 0) {
        const ph = multiIds.map(() => '?').join(',');
        const mgrRows = await query(
          `SELECT id FROM users
           WHERE tenant_id = ? AND role = 'manager' AND is_deleted = 0 AND id IN (${ph})`,
          [tenantId, ...multiIds]
        );
        if (mgrRows.length !== multiIds.length) {
          const err = new Error('Invalid manager filter (unknown manager id)');
          err.status = 400;
          throw err;
        }
        if (filterUnassignedManagers) {
          whereClauses.push(`(c.manager_id IS NULL OR c.manager_id IN (${ph}))`);
          params.push(...multiIds);
        } else {
          whereClauses.push(`c.manager_id IN (${ph})`);
          params.push(...multiIds);
        }
      } else if (filterUnassignedManagers) {
        whereClauses.push('c.manager_id IS NULL');
      }
    } else if (filterManagerId === 'unassigned') {
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
  status_name: 'csm.name',
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
       ON ag.id = c.assigned_user_id AND ag.tenant_id = c.tenant_id AND ag.is_deleted = 0
     LEFT JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0`;

const COLUMN_FILTER_FIELDS = new Set([
  'display_name',
  'primary_phone',
  'email',
  'tag_names',
  'campaign_name',
  'type',
  'manager_name',
  'assigned_user_name',
  'status_name',
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

/** Matches client `industryFieldColumnId` / contacts.industry_profile object keys */
const INDUSTRY_LIST_FILTER_COL_PREFIX = 'ind:';
const INDUSTRY_PROFILE_JSON_KEY_RE = /^[a-z0-9_]{2,100}$/;

function parseIndustryProfileListFilterField(field) {
  if (!field || typeof field !== 'string') return null;
  if (!field.startsWith(INDUSTRY_LIST_FILTER_COL_PREFIX)) return null;
  const key = field.slice(INDUSTRY_LIST_FILTER_COL_PREFIX.length);
  if (!INDUSTRY_PROFILE_JSON_KEY_RE.test(key)) return null;
  return key;
}

const COLUMN_FILTER_OPS = new Set(['empty', 'not_empty', 'contains', 'not_contains', 'starts_with', 'ends_with']);

/**
 * @param {unknown} raw
 * @param {Set<string>|undefined} allowedIndustryFieldKeys — when a Set, only these `field_key`s accept `ind:` rules (from tenant effective industry fields).
 * @returns {Array<{ field: string, op: string, value?: string }>}
 */
export function normalizeContactListColumnFilters(raw, allowedIndustryFieldKeys) {
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
    const indKey = parseIndustryProfileListFilterField(field);
    if (indKey) {
      if (allowedIndustryFieldKeys instanceof Set && !allowedIndustryFieldKeys.has(indKey)) continue;
    } else if (!COLUMN_FILTER_FIELDS.has(field)) {
      continue;
    }
    if (!COLUMN_FILTER_OPS.has(op)) continue;
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
 * @param {string} fieldKey — safe [a-z0-9_]+ key inside industry_profile JSON
 * @param {string} op
 * @param {string} value
 */
function applyIndustryProfileColumnFilter(whereClauses, params, fieldKey, op, value) {
  const path = `$.${fieldKey}`;
  const likeWord = (v) => `%${v}%`;
  const starts = (v) => `${v}%`;
  const ends = (v) => `%${v}`;

  if (op === 'empty') {
    whereClauses.push(
      `(
        c.industry_profile IS NULL
        OR NOT JSON_CONTAINS_PATH(c.industry_profile, 'one', ?)
        OR JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) = 'NULL'
        OR (
          JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) = 'STRING'
          AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.industry_profile, ?))) = ''
        )
        OR (
          JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) = 'ARRAY'
          AND COALESCE(JSON_LENGTH(JSON_EXTRACT(c.industry_profile, ?)), 0) = 0
        )
      )`
    );
    params.push(path, path, path, path, path, path);
    return;
  }
  if (op === 'not_empty') {
    whereClauses.push(
      `(
        c.industry_profile IS NOT NULL
        AND JSON_CONTAINS_PATH(c.industry_profile, 'one', ?)
        AND JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) != 'NULL'
        AND NOT (
          JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) = 'STRING'
          AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(c.industry_profile, ?))) = ''
        )
        AND NOT (
          JSON_TYPE(JSON_EXTRACT(c.industry_profile, ?)) = 'ARRAY'
          AND COALESCE(JSON_LENGTH(JSON_EXTRACT(c.industry_profile, ?)), 0) = 0
        )
      )`
    );
    params.push(path, path, path, path, path, path);
    return;
  }
  if (op === 'contains') {
    whereClauses.push(
      `(c.industry_profile IS NOT NULL AND JSON_CONTAINS_PATH(c.industry_profile, 'one', ?) AND CAST(JSON_EXTRACT(c.industry_profile, ?) AS CHAR) LIKE ?)`
    );
    params.push(path, path, likeWord(value));
    return;
  }
  if (op === 'not_contains') {
    whereClauses.push(
      `(
        c.industry_profile IS NULL
        OR NOT JSON_CONTAINS_PATH(c.industry_profile, 'one', ?)
        OR CAST(JSON_EXTRACT(c.industry_profile, ?) AS CHAR) NOT LIKE ?
      )`
    );
    params.push(path, path, likeWord(value));
    return;
  }
  if (op === 'starts_with') {
    whereClauses.push(
      `(c.industry_profile IS NOT NULL AND JSON_CONTAINS_PATH(c.industry_profile, 'one', ?) AND CAST(JSON_EXTRACT(c.industry_profile, ?) AS CHAR) LIKE ?)`
    );
    params.push(path, path, starts(value));
    return;
  }
  if (op === 'ends_with') {
    whereClauses.push(
      `(c.industry_profile IS NOT NULL AND JSON_CONTAINS_PATH(c.industry_profile, 'one', ?) AND CAST(JSON_EXTRACT(c.industry_profile, ?) AS CHAR) LIKE ?)`
    );
    params.push(path, path, ends(value));
  }
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
    const indKey = parseIndustryProfileListFilterField(field);
    if (indKey) {
      applyIndustryProfileColumnFilter(whereClauses, params, indKey, op, value);
      continue;
    }
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
      case 'status_name':
        if (op === 'empty') {
          whereClauses.push(`(c.status_id IS NULL OR csm.name IS NULL OR TRIM(csm.name) = '')`);
        } else if (op === 'not_empty') {
          whereClauses.push(`(c.status_id IS NOT NULL AND csm.name IS NOT NULL AND TRIM(csm.name) != '')`);
        } else if (op === 'contains') {
          whereClauses.push(`(csm.name LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'not_contains') {
          whereClauses.push(`(csm.name IS NULL OR csm.name NOT LIKE ?)`);
          params.push(likeWord(value));
        } else if (op === 'starts_with') {
          whereClauses.push(`(csm.name LIKE ?)`);
          params.push(starts(value));
        } else if (op === 'ends_with') {
          whereClauses.push(`(csm.name LIKE ?)`);
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

const CONTACT_LIST_IDS_CAP = 10000;

/** Multi-campaign filter: array of positive campaign ids and/or 'none' (no campaign). Overrides legacy campaignIdFilter when non-empty. */
function applyCampaignIdsToWhere(whereClauses, params, { campaignIdFilter, campaignIdsFilter }) {
  const idsRaw = Array.isArray(campaignIdsFilter) ? campaignIdsFilter : [];
  if (idsRaw.length > 0) {
    const hasNone = idsRaw.some((x) => x === 'none' || String(x).toLowerCase() === 'none');
    const nums = [...new Set(idsRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (hasNone && nums.length > 0) {
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(`(c.campaign_id IS NULL OR c.campaign_id IN (${ph}))`);
      params.push(...nums);
    } else if (hasNone) {
      whereClauses.push('c.campaign_id IS NULL');
    } else if (nums.length > 0) {
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(`c.campaign_id IN (${ph})`);
      params.push(...nums);
    }
    return;
  }
  if (campaignIdFilter === 'none') {
    whereClauses.push('c.campaign_id IS NULL');
  } else if (campaignIdFilter !== undefined && campaignIdFilter !== null) {
    whereClauses.push('c.campaign_id = ?');
    params.push(Number(campaignIdFilter));
  }
}

/** Contacts must have every listed tag (AND). */
function applyFilterTagIdsToWhere(whereClauses, params, filterTagIds) {
  if (!Array.isArray(filterTagIds) || filterTagIds.length === 0) return;
  for (const tid of filterTagIds) {
    const n = Number(tid);
    if (!Number.isFinite(n) || n < 1) continue;
    whereClauses.push(
      `EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_ft
        INNER JOIN contact_tags ct_ft ON ct_ft.id = cta_ft.tag_id AND ct_ft.tenant_id = cta_ft.tenant_id
        WHERE cta_ft.contact_id = c.id AND cta_ft.tenant_id = c.tenant_id
          AND ct_ft.deleted_at IS NULL AND cta_ft.tag_id = ?
      )`
    );
    params.push(n);
  }
}

/** Multi-status: positive contact_status_master ids and/or 'none' (no status). Overrides legacy statusId when non-empty. */
function applyStatusIdsToWhere(whereClauses, params, { statusId, statusIdsFilter }) {
  const idsRaw = Array.isArray(statusIdsFilter) ? statusIdsFilter : [];
  if (idsRaw.length > 0) {
    const hasNone = idsRaw.some((x) => x === 'none' || String(x).toLowerCase() === 'none');
    const nums = [...new Set(idsRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (hasNone && nums.length > 0) {
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(`(c.status_id IS NULL OR c.status_id IN (${ph}))`);
      params.push(...nums);
    } else if (hasNone) {
      whereClauses.push('c.status_id IS NULL');
    } else if (nums.length > 0) {
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(`c.status_id IN (${ph})`);
      params.push(...nums);
    }
    return;
  }
  if (statusId !== undefined && statusId !== null && String(statusId).trim() !== '') {
    whereClauses.push('c.status_id = ?');
    params.push(Number(statusId));
  }
}

async function prepareContactListFinalWhere(
  tenantId,
  user,
  {
    search = '',
    type,
    statusId,
    statusIdsFilter,
    minCallCount,
    maxCallCount,
    lastCalledAfter,
    lastCalledBefore,
    filterManagerId,
    filterAssignedUserId,
    filterManagerIds,
    filterUnassignedManagers,
    campaignIdFilter,
    campaignIdsFilter,
    filterTagIds,
    columnFilters,
    touchStatus,
  }
) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const whereClauses = [whereSQL];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }

  applyStatusIdsToWhere(whereClauses, params, { statusId, statusIdsFilter });

  if (touchStatus === 'untouched') {
    whereClauses.push('(c.last_called_at IS NULL OR c.call_count_total = 0)');
  } else if (touchStatus === 'touched') {
    whereClauses.push('(c.last_called_at IS NOT NULL AND c.call_count_total > 0)');
  }

  if (Number.isFinite(minCallCount)) {
    whereClauses.push('(c.call_count_total >= ?)');
    params.push(Number(minCallCount));
  }
  if (Number.isFinite(maxCallCount)) {
    whereClauses.push('(c.call_count_total <= ?)');
    params.push(Number(maxCallCount));
  }
  if (lastCalledAfter) {
    whereClauses.push('(c.last_called_at IS NOT NULL AND c.last_called_at >= ?)');
    params.push(lastCalledAfter);
  }
  if (lastCalledBefore) {
    whereClauses.push('(c.last_called_at IS NOT NULL AND c.last_called_at <= ?)');
    params.push(lastCalledBefore);
  }

  applyCampaignIdsToWhere(whereClauses, params, { campaignIdFilter, campaignIdsFilter });
  applyFilterTagIdsToWhere(whereClauses, params, filterTagIds);

  if (search) {
    const q = `%${search}%`;
    whereClauses.push(
      `(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.display_name LIKE ?
        OR c.city LIKE ? OR c.company LIKE ? OR EXISTS (
        SELECT 1 FROM contact_tag_assignments cta_s
        INNER JOIN contact_tags ct_s ON ct_s.id = cta_s.tag_id AND ct_s.tenant_id = cta_s.tenant_id
        WHERE cta_s.contact_id = c.id AND cta_s.tenant_id = c.tenant_id AND ct_s.deleted_at IS NULL AND ct_s.name LIKE ?
      ) OR (c.industry_profile IS NOT NULL AND CAST(c.industry_profile AS CHAR) LIKE ?))`
    );
    params.push(q, q, q, q, q, q, q, q);
  }

  await applyContactListFilters(tenantId, user, whereClauses, params, {
    filterManagerId,
    filterAssignedUserId,
    filterManagerIds,
    filterUnassignedManagers,
  });

  const effIndFields = await tenantIndustryFieldsService.getEffectiveFieldDefinitions(tenantId);
  const allowedIndustryFieldKeys = new Set(effIndFields.map((d) => String(d.field_key)));
  const normalizedColumnFilters = normalizeContactListColumnFilters(columnFilters, allowedIndustryFieldKeys);
  applyContactListColumnFilters(whereClauses, params, normalizedColumnFilters);

  const finalWhere = `WHERE ${whereClauses.join(' AND ')}`;
  return { finalWhere, params };
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
    statusIdsFilter,
    minCallCount,
    maxCallCount,
    lastCalledAfter,
    lastCalledBefore,
    filterManagerId,
    filterAssignedUserId,
    filterManagerIds,
    filterUnassignedManagers,
    campaignIdFilter,
    campaignIdsFilter,
    filterTagIds,
    sortBy,
    sortDir,
    columnFilters,
    touchStatus,
  } = {}
) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 500);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;
  const orderBySQL = resolveContactListOrderBy(sortBy, sortDir);

  const { finalWhere, params } = await prepareContactListFinalWhere(tenantId, user, {
    search,
    type,
    statusId,
    statusIdsFilter,
    minCallCount,
    maxCallCount,
    lastCalledAfter,
    lastCalledBefore,
    filterManagerId,
    filterAssignedUserId,
    filterManagerIds,
    filterUnassignedManagers,
    campaignIdFilter,
    campaignIdsFilter,
    filterTagIds,
    columnFilters,
    touchStatus,
  });

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
        c.industry_profile,
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
        csm.name AS status_name,
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
    for (const row of data) {
      const ip = tenantIndustryFieldsService.parseIndustryProfileColumn(row.industry_profile);
      if (ip != null) row.industry_profile = ip;
      else delete row.industry_profile;
    }

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

/** All matching contact ids for current list filters (same visibility as listContacts), capped for bulk selection. */
export async function listContactIds(tenantId, user, options) {
  const { finalWhere, params } = await prepareContactListFinalWhere(tenantId, user, options);
  const [countRow] = await query(
    `SELECT COUNT(DISTINCT c.id) AS total
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}`,
    params
  );
  const total = countRow?.total ?? 0;
  const cap = CONTACT_LIST_IDS_CAP;
  const rows = await query(
    `SELECT DISTINCT c.id
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}
     ORDER BY c.id ASC
     LIMIT ${cap + 1}`,
    params
  );
  const truncated = rows.length > cap;
  const ids = (truncated ? rows.slice(0, cap) : rows).map((r) => r.id);
  return { ids, total, truncated, cap };
}

/**
 * All matching contact IDs for bulk background jobs (same filters as listContacts / list-ids).
 * Enforces env.backgroundJobMaxContactIds to protect the server.
 */
export async function listAllContactIdsForBulkJob(tenantId, user, options) {
  const { finalWhere, params } = await prepareContactListFinalWhere(tenantId, user, options);
  const [countRow] = await query(
    `SELECT COUNT(DISTINCT c.id) AS total
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}`,
    params
  );
  const total = Number(countRow?.total ?? 0);
  const cap = env.backgroundJobMaxContactIds;
  if (total > cap) {
    const err = new Error(
      `Too many matching records (${total}). Narrow your filters or raise BACKGROUND_JOB_MAX_CONTACT_IDS (current cap ${cap}).`
    );
    err.status = 400;
    throw err;
  }
  const rows = await query(
    `SELECT DISTINCT c.id
     ${CONTACT_LIST_JOIN_FROM}
     ${finalWhere}
     ORDER BY c.id ASC`,
    params
  );
  return rows.map((r) => Number(r.id));
}

/**
 * Lead counts for pipeline dashboard cards (same tenant + ownership visibility as default list, no extra filters).
 * Buckets use contact_status_master.code: new, contacted, qualified, lost.
 */
export async function getLeadPipelineSummary(tenantId, user) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const baseWhere = `${whereSQL} AND c.type = 'lead'`;

  const [totalRow] = await query(`SELECT COUNT(*) AS n FROM contacts c WHERE ${baseWhere}`, params);
  const total = Number(totalRow?.n ?? 0);

  const codeRows = await query(
    `SELECT LOWER(TRIM(csm.code)) AS code, COUNT(*) AS n
     FROM contacts c
     INNER JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0 AND COALESCE(csm.is_active, 1) = 1
     WHERE ${baseWhere}
     GROUP BY LOWER(TRIM(csm.code))`,
    params
  );

  const byCode = Object.create(null);
  for (const r of codeRows || []) {
    const k = String(r.code || '').toLowerCase();
    if (k) byCode[k] = Number(r.n ?? 0);
  }

  return {
    total,
    newLeads: byCode.new ?? 0,
    contacted: byCode.contacted ?? 0,
    qualified: byCode.qualified ?? 0,
    lost: byCode.lost ?? 0,
  };
}

/**
 * Contact list dashboard cards (same tenant + ownership visibility as default list, no extra filters).
 * - followUpsPending: contact records whose status code is qualified, nurturing, proposal_sent, or negotiation.
 * - convertedContacts: contacts (type=contact) with status converted.
 * - lostContacts: contacts with status lost.
 */
export async function getContactDashboardSummary(tenantId, user) {
  const { whereSQL, params } = buildOwnershipWhere(user);
  const baseContact = `${whereSQL} AND c.type = 'contact'`;

  const [totalRow] = await query(`SELECT COUNT(*) AS n FROM contacts c WHERE ${baseContact}`, params);
  const totalContacts = Number(totalRow?.n ?? 0);

  const codeRows = await query(
    `SELECT LOWER(TRIM(csm.code)) AS code, COUNT(*) AS n
     FROM contacts c
     INNER JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0 AND COALESCE(csm.is_active, 1) = 1
     WHERE ${baseContact}
     GROUP BY LOWER(TRIM(csm.code))`,
    params
  );

  const byCode = Object.create(null);
  for (const r of codeRows || []) {
    const k = String(r.code || '').toLowerCase();
    if (k) byCode[k] = Number(r.n ?? 0);
  }

  const pendingCodes = ['qualified', 'nurturing', 'proposal_sent', 'negotiation'];
  const followUpsPending = pendingCodes.reduce((sum, code) => sum + (byCode[code] ?? 0), 0);

  return {
    totalContacts,
    contacted: byCode.contacted ?? 0,
    followUpsPending,
    convertedContacts: byCode.converted ?? 0,
    lostContacts: byCode.lost ?? 0,
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
        c.notes,
        c.industry_profile,
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
        c.created_at,
        c.updated_at
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     WHERE ${finalWhere}`,
    params
  );

  if (!row) return null;

  const industryProfile = tenantIndustryFieldsService.parseIndustryProfileColumn(row.industry_profile);
  if (industryProfile != null) {
    row.industry_profile = industryProfile;
  } else {
    delete row.industry_profile;
  }

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

/**
 * Minimal contact row for update paths that already know the id is visible (e.g. CSV import duplicate rows).
 * Avoids loading phones + tags like getContactById.
 */
async function fetchContactSnapshotForUpdate(id, tenantId, user) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const { whereSQL, params } = buildOwnershipWhere(user);
  const finalWhere = `${whereSQL} AND c.id = ?`;
  params.push(cid);
  const [row] = await query(
    `SELECT c.id, c.tenant_id, c.type, c.manager_id, c.assigned_user_id, c.campaign_id
     FROM contacts c
     WHERE ${finalWhere}`,
    params
  );
  if (!row || Number(row.tenant_id) !== Number(tenantId)) return null;
  return row;
}

export async function appendContactPhone(tenantId, user, contactId, { phone, label = 'mobile' } = {}) {
  const cid = Number(contactId);
  if (!cid) {
    const err = new Error('Invalid contact id');
    err.status = 400;
    throw err;
  }
  const raw = String(phone || '').trim();
  if (!raw) {
    const err = new Error('phone is required');
    err.status = 400;
    throw err;
  }
  const existing = await getContactById(cid, tenantId, user);
  if (!existing) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const e164 = toE164Phone(raw);
  if (!e164) {
    const err = new Error('Invalid phone number');
    err.status = 400;
    throw err;
  }
  const rawLabel = String(label || 'mobile').trim().toLowerCase();
  const allowed = new Set(['mobile', 'home', 'work', 'whatsapp', 'other']);
  const lbl = allowed.has(rawLabel) ? rawLabel : 'other';
  const [dupLabel] = await query(
    `SELECT id FROM contact_phones WHERE tenant_id = ? AND contact_id = ? AND label = ? LIMIT 1`,
    [tenantId, cid, lbl]
  );
  if (dupLabel) {
    const err = new Error(`This contact already has a ${lbl} number`);
    err.status = 400;
    throw err;
  }
  const ins = await query(
    `INSERT INTO contact_phones (tenant_id, contact_id, phone, label, is_primary) VALUES (?, ?, ?, ?, 0)`,
    [tenantId, cid, e164, lbl]
  );
  const newPhoneId = ins.insertId;
  if (!existing.primary_phone_id) {
    await query(`UPDATE contacts SET primary_phone_id = ?, updated_by = ? WHERE id = ? AND tenant_id = ?`, [
      newPhoneId,
      user.id,
      cid,
      tenantId,
    ]);
  }
  return getContactById(cid, tenantId, user);
}

/**
 * Shared insert row resolution for createContact + CSV import bulk inserts.
 * @returns {{ insertParams: any[], phones: any[], custom_fields: any[], tag_ids: any }}
 */
async function buildContactInsertRow(
  tenantId,
  user,
  type,
  payload,
  statusCache = null,
  preloadedAgentManagerId = undefined
) {
  const {
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
    notes,
    industry_profile,
    tag_ids,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones = [],
    custom_fields = [],
    created_source,
  } = payload;

  let industryProfileJson = null;
  if (industry_profile !== undefined) {
    const v = await tenantIndustryFieldsService.validateIndustryProfileForTenant(tenantId, industry_profile);
    if (v.error) {
      const err = new Error(v.error);
      err.status = 400;
      throw err;
    }
    industryProfileJson = v.jsonStr;
  }

  let resolvedManagerId = manager_id || null;
  let resolvedAssignedUserId = assigned_user_id || null;

  if (user.role === 'agent') {
    resolvedAssignedUserId = user.id;
    if (!resolvedManagerId) {
      if (preloadedAgentManagerId !== undefined) {
        resolvedManagerId = preloadedAgentManagerId;
      } else {
        const [userRow] = await query(
          `SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
          [user.id, tenantId]
        );
        resolvedManagerId = userRow?.manager_id ?? null;
      }
    }
  }

  if (user.role === 'manager') {
    if (!resolvedManagerId) {
      resolvedManagerId = user.id;
    }
    if (!resolvedAssignedUserId) {
      resolvedAssignedUserId = user.id;
    }
  }

  const dob = date_of_birth !== undefined && date_of_birth !== null ? normalizeDateOfBirthForDb(date_of_birth) : null;

  let resolvedStatusId =
    status_id !== undefined && status_id !== null && String(status_id).trim() !== '' ? status_id : null;
  if (!resolvedStatusId) {
    resolvedStatusId = await resolveContactStatusIdByName(tenantId, 'new', statusCache);
  }

  const insertParams = [
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
    notes !== undefined && notes !== null ? normalizeContactNotesForDb(notes) : null,
    industryProfileJson,
    resolvedManagerId,
    resolvedAssignedUserId,
    resolvedStatusId,
    campaign_id || null,
    created_source || 'manual',
    user.id,
  ];

  return { insertParams, phones, custom_fields, tag_ids };
}

/** Max rows per multi-row INSERT during CSV import (tuned for packet size + round-trips). */
const IMPORT_BULK_CREATE_CHUNK = 500;

/** Coalesce tag merges on import-updates (avoid one DB round-trip per updated row). */
const IMPORT_TAG_MERGE_CHUNK = 800;

/**
 * Bulk-insert buffered new contacts (one INSERT for `contacts`), then phones + CF + tags.
 * Falls back to sequential createContact on failure.
 */
async function flushImportCreateBuffer(
  tenantId,
  user,
  type,
  buffer,
  sessionPhoneMap,
  statusCache,
  validatedTagIds,
  preloadedAgentManagerId = undefined
) {
  if (!buffer?.length) return;

  const tryBulk = async () => {
    const built = [];
    for (const item of buffer) {
      assertUniquePhoneLabels(item.payload.phones || []);
      built.push(
        await buildContactInsertRow(
          tenantId,
          user,
          type,
          item.payload,
          statusCache,
          preloadedAgentManagerId
        )
      );
    }

    const placeholders = built.map(
      () =>
        `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).join(', ');
    const flatParams = built.flatMap((b) => b.insertParams);
    const n = buffer.length;

    let contactIds;
    await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [insRes] = await conn.execute(
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
        notes,
        industry_profile,
        manager_id,
        assigned_user_id,
        status_id,
        campaign_id,
        created_source,
        created_by
      ) VALUES ${placeholders}`,
          flatParams
        );

        const firstId = Number(insRes.insertId);
        if (!Number.isFinite(firstId) || firstId <= 0) {
          throw new Error('Bulk contact insert did not return insertId');
        }

        contactIds = [];
        for (let i = 0; i < n; i++) {
          contactIds.push(firstId + i);
        }

        const phoneRows = [];
        for (let i = 0; i < n; i++) {
          const contactId = contactIds[i];
          const phones = built[i].phones || [];
          for (const phone of phones) {
            if (!phone?.phone) continue;
            phoneRows.push({
              contactId,
              phone: phone.phone,
              label: phone.label || 'mobile',
              is_primary: !!phone.is_primary,
            });
          }
        }
        if (phoneRows.length > 0) {
          const phPlaceholders = phoneRows.map(() => '(?, ?, ?, ?, ?)').join(',');
          const phFlat = phoneRows.flatMap((r) => [
            tenantId,
            r.contactId,
            r.phone,
            r.label,
            r.is_primary ? 1 : 0,
          ]);
          const [phInsRes] = await conn.execute(
            `INSERT INTO contact_phones (tenant_id, contact_id, phone, label, is_primary) VALUES ${phPlaceholders}`,
            phFlat
          );
          const firstPhId = Number(phInsRes.insertId);
          if (!Number.isFinite(firstPhId) || firstPhId <= 0) {
            throw new Error('Bulk phone insert did not return insertId');
          }
          const primaryIdByContact = new Map();
          for (let k = 0; k < phoneRows.length; k++) {
            const rowPhoneId = firstPhId + k;
            const pr = phoneRows[k];
            if (pr.is_primary && !primaryIdByContact.has(pr.contactId)) {
              primaryIdByContact.set(pr.contactId, rowPhoneId);
            }
          }
          if (primaryIdByContact.size > 0) {
            const cids = [...primaryIdByContact.keys()];
            const caseParts = cids.map(() => 'WHEN ? THEN ?').join(' ');
            const caseParams = cids.flatMap((cid) => [cid, primaryIdByContact.get(cid)]);
            const inPh = cids.map(() => '?').join(',');
            await conn.execute(
              `UPDATE contacts SET primary_phone_id = CASE id ${caseParts} END WHERE tenant_id = ? AND id IN (${inPh})`,
              [...caseParams, tenantId, ...cids]
            );
          }
        }

        const allCfTuples = [];
        for (let i = 0; i < n; i++) {
          const contactId = contactIds[i];
          const cfRows = Array.isArray(built[i].custom_fields)
            ? built[i].custom_fields.filter((f) => f?.field_id)
            : [];
          for (const field of cfRows) {
            allCfTuples.push([tenantId, contactId, field.field_id, field.value_text ?? null]);
          }
        }
        if (allCfTuples.length > 0) {
          const ph = allCfTuples.map(() => '(?, ?, ?, ?)').join(',');
          const params = allCfTuples.flat();
          await conn.execute(
            `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES ${ph}
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
            params
          );
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });

    // Import sets the same tag_ids on every row as `validatedTagIds`; merge once — do not per-row
    // syncContactTagAssignments (that would DELETE+INSERT per contact then duplicate insertTagAssignmentsMerge).
    if (validatedTagIds.length > 0) {
      await contactTagsService.insertTagAssignmentsMerge(tenantId, user, contactIds, validatedTagIds);
    }

    for (let i = 0; i < n; i++) {
      const primaryPhone = buffer[i].primaryPhone;
      if (primaryPhone != null && primaryPhone !== '') {
        sessionPhoneMap.set(primaryPhone, { id: contactIds[i], type });
      }
    }
  };

  try {
    await tryBulk();
  } catch (bulkErr) {
    console.error('import bulk create fallback (sequential)', bulkErr?.message || bulkErr);
    const fallbackIds = [];
    for (const item of buffer) {
      const createdContact = await createContact(tenantId, user, item.payload, { skipFetch: true });
      if (createdContact?.id != null) fallbackIds.push(createdContact.id);
      if (item.primaryPhone != null && item.primaryPhone !== '' && createdContact?.id != null) {
        sessionPhoneMap.set(item.primaryPhone, { id: createdContact.id, type });
      }
    }
    if (validatedTagIds.length > 0 && fallbackIds.length > 0) {
      await contactTagsService.insertTagAssignmentsMerge(tenantId, user, fallbackIds, validatedTagIds);
    }
  }
}

export async function createContact(tenantId, user, payload, options = {}) {
  const { skipFetch = false } = options;
  const {
    type = 'lead',
    phones = [],
  } = payload;

  assertUniquePhoneLabels(phones);

  const { insertParams, phones: ph, custom_fields: cf, tag_ids } = await buildContactInsertRow(
    tenantId,
    user,
    type,
    payload,
    null
  );

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
        notes,
        industry_profile,
        manager_id,
        assigned_user_id,
        status_id,
        campaign_id,
        created_source,
        created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    insertParams
  );

  const contactId = result.insertId;

  // Insert phones
  let primaryPhoneId = null;
  if (Array.isArray(ph) && ph.length > 0) {
    for (const phone of ph) {
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

  // Insert custom fields (batched for import performance)
  const cfRows = Array.isArray(cf) ? cf.filter((f) => f?.field_id) : [];
  if (cfRows.length > 0) {
    const placeholders = cfRows.map(() => '(?, ?, ?, ?)').join(',');
    const params = [];
    for (const field of cfRows) {
      params.push(tenantId, contactId, field.field_id, field.value_text ?? null);
    }
    await query(
      `INSERT INTO contact_custom_field_values (
         tenant_id,
         contact_id,
         field_id,
         value_text
       ) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
      params
    );
  }

  await contactTagsService.syncContactTagAssignments(tenantId, user, contactId, tag_ids);

  if (skipFetch) return { id: contactId };
  const createdOut = await getContactById(contactId, tenantId, user);
  const typeLower = String(type || 'lead').toLowerCase();
  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'contact',
    event_type: 'contact.created',
    summary: `${typeLower === 'contact' ? 'Contact' : 'Lead'} created: ${createdOut?.display_name || '—'}`,
    entity_type: 'contact',
    entity_id: contactId,
    contact_id: contactId,
    payload_json: { record_type: typeLower },
  });
  return createdOut;
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

/** Lead ↔ contact conversion: admins/managers, or users with both lead and contact update rights. */
function assertCanConvertContactType(user, existing, nextType) {
  const nt = String(nextType || '').toLowerCase();
  const ot = String(existing?.type || '').toLowerCase();
  if (nt !== 'lead' && nt !== 'contact') {
    const err = new Error('Invalid type');
    err.status = 400;
    throw err;
  }
  if (ot === nt) return;
  if (user.role === 'admin' || user.role === 'manager') return;
  const perms = user.permissions || [];
  if (perms.includes('leads.update') && perms.includes('contacts.update')) return;
  const err = new Error('You do not have permission to change record type between lead and contact');
  err.status = 403;
  throw err;
}

export async function updateContact(id, tenantId, user, payload, options = {}) {
  const { skipFetch = false, contactSnapshot = null, skipActivityLog = false } = options;
  let existing;
  if (
    contactSnapshot &&
    Number(contactSnapshot.id) === Number(id) &&
    Number(contactSnapshot.tenant_id) === Number(tenantId)
  ) {
    existing = contactSnapshot;
  } else {
    existing = await getContactById(id, tenantId, user);
  }
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
    industry_profile,
    notes,
    tag_ids,
    status_id,
    campaign_id,
    manager_id,
    assigned_user_id,
    phones,
    custom_fields,
  } = payload;

  await assertCanChangeContactOwnership(tenantId, user, payload, existing);

  if (type !== undefined && String(type) !== String(existing.type)) {
    assertCanConvertContactType(user, existing, type);
  }

  const convertingLeadToContact =
    type !== undefined && String(existing.type) === 'lead' && String(type) === 'contact';
  let convertedStatusId = null;
  if (convertingLeadToContact) {
    convertedStatusId = await resolveContactStatusIdByName(tenantId, 'converted', null);
  }

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
  if (notes !== undefined) {
    updates.push('notes = ?');
    params.push(normalizeContactNotesForDb(notes));
  }
  if (industry_profile !== undefined) {
    const v = await tenantIndustryFieldsService.validateIndustryProfileForTenant(tenantId, industry_profile);
    if (v.error) {
      const err = new Error(v.error);
      err.status = 400;
      throw err;
    }
    updates.push('industry_profile = ?');
    params.push(v.jsonStr);
  }
  if (convertingLeadToContact && convertedStatusId) {
    updates.push('status_id = ?');
    params.push(convertedStatusId);
  } else if (status_id !== undefined) {
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

  let recordChangeCalled = false;
  if (changed) {
    recordChangeCalled = true;
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

  // Update custom fields if provided (batched)
  if (Array.isArray(custom_fields)) {
    const cfRows = custom_fields.filter((f) => f?.field_id);
    if (cfRows.length > 0) {
      const placeholders = cfRows.map(() => '(?, ?, ?, ?)').join(',');
      const params = [];
      for (const field of cfRows) {
        params.push(tenantId, id, field.field_id, field.value_text ?? null);
      }
      await query(
        `INSERT INTO contact_custom_field_values (
           tenant_id,
           contact_id,
           field_id,
           value_text
         ) VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        params
      );
    }
  }

  if (tag_ids !== undefined) {
    await contactTagsService.syncContactTagAssignments(tenantId, user, id, tag_ids);
  }

  if (!skipActivityLog) {
    const coreKeys = [];
    const idishChanged = (a, b) => Number(a || 0) !== Number(b || 0);
    const strChanged = (a, b) => String(a ?? '') !== String(b ?? '');
    const trackCore = (key, before, after, mode = 'str') => {
      if (payload[key] === undefined) return;
      if (recordChangeCalled && ['manager_id', 'assigned_user_id', 'campaign_id'].includes(key)) return;
      if (mode === 'id') {
        if (idishChanged(before, after)) coreKeys.push(key);
      } else if (strChanged(before, after)) {
        coreKeys.push(key);
      }
    };
    trackCore('type', existing.type, type, 'str');
    trackCore('first_name', existing.first_name, first_name);
    trackCore('last_name', existing.last_name, last_name);
    trackCore('display_name', existing.display_name, display_name);
    trackCore('email', existing.email, email);
    trackCore('source', existing.source, source);
    trackCore('city', existing.city, city);
    trackCore('state', existing.state, state);
    trackCore('country', existing.country, country);
    trackCore('address', existing.address, address);
    trackCore('address_line_2', existing.address_line_2, address_line_2);
    trackCore('pin_code', existing.pin_code, pin_code);
    trackCore('company', existing.company, company);
    trackCore('job_title', existing.job_title, job_title);
    trackCore('website', existing.website, website);
    trackCore('industry', existing.industry, industry);
    trackCore('date_of_birth', existing.date_of_birth, date_of_birth);
    trackCore('tax_id', existing.tax_id, tax_id);
    trackCore('notes', existing.notes, notes);
    if (status_id !== undefined) {
      trackCore('status_id', existing.status_id, status_id, 'str');
    }
    if (industry_profile !== undefined) {
      const prev =
        existing.industry_profile != null ? JSON.stringify(existing.industry_profile) : null;
      const next =
        industry_profile != null ? JSON.stringify(industry_profile) : null;
      if (String(prev || '') !== String(next || '')) coreKeys.push('industry_profile');
    }
    if (!recordChangeCalled) {
      if (manager_id !== undefined) trackCore('manager_id', existing.manager_id, manager_id, 'id');
      if (assigned_user_id !== undefined) {
        trackCore('assigned_user_id', existing.assigned_user_id, assigned_user_id, 'id');
      }
      if (campaign_id !== undefined) trackCore('campaign_id', existing.campaign_id, campaign_id, 'id');
    }

    const touches = [];
    if (changed) touches.push('assignment');
    if (coreKeys.length) touches.push(`fields: ${coreKeys.join(', ')}`);
    if (Array.isArray(phones)) touches.push('phones');
    if (
      Array.isArray(custom_fields) &&
      custom_fields.filter((f) => f?.field_id).length > 0
    ) {
      touches.push('custom_fields');
    }
    if (tag_ids !== undefined) touches.push('tags');

    if (touches.length > 0) {
      const evSummary = `Record updated (${touches.join('; ')})`;
      await contactActivityEventsService.insertContactActivityEvent(tenantId, {
        contactId: Number(id),
        eventType: 'profile_updated',
        actorUserId: user?.id ?? null,
        summary: evSummary,
        payloadJson: { changed_core_keys: coreKeys, touches },
      });
      await safeLogTenantActivity(tenantId, user?.id, {
        event_category: 'contact',
        event_type: 'contact.updated',
        summary: evSummary.slice(0, 500),
        entity_type: 'contact',
        entity_id: Number(id),
        contact_id: Number(id),
        payload_json: { changed_core_keys: coreKeys, touches },
      });
    }
  }

  if (skipFetch) return existing ? { id: Number(id) } : null;
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

  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'contact',
    event_type: 'contact.deleted',
    summary: `${existing.type === 'contact' ? 'Contact' : 'Lead'} deleted: ${existing.display_name || '—'}`,
    entity_type: 'contact',
    entity_id: Number(id),
    contact_id: Number(id),
    payload_json: { deleted_source: deleted_source || 'manual' },
  });

  return { id: Number(id), deleted_at: new Date().toISOString() };
}

/** Default API cap for synchronous bulk delete; jobs use unlimited: true. */
const BULK_DELETE_MAX = 10000;

const BULK_DELETE_CHUNK = 500;

export async function softDeleteContactsBulk(
  ids,
  tenantId,
  user,
  { deleted_source = 'manual', unlimited = false } = {}
) {
  const raw = Array.isArray(ids) ? ids : [];

  const deduped = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  const unique = unlimited ? deduped : deduped.slice(0, BULK_DELETE_MAX);

  const deleted = [];
  const skipped = [];
  const flags =
    user?.role === 'agent'
      ? await fetchAgentDeleteFlagsForUser(tenantId, user.id)
      : { agent_can_delete_leads: false, agent_can_delete_contacts: false };

  const { whereSQL, params: ownParams } = buildOwnershipWhere(user);

  for (let i = 0; i < unique.length; i += BULK_DELETE_CHUNK) {
    const chunk = unique.slice(i, i + BULK_DELETE_CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const rows = await query(
      `SELECT c.id, c.type
       FROM contacts c
       WHERE ${whereSQL} AND c.id IN (${ph})`,
      [...ownParams, ...chunk]
    );
    const visibleById = new Map(rows.map((r) => [Number(r.id), String(r.type)]));

    const toDelete = [];
    for (const id of chunk) {
      const ctype = visibleById.get(id);
      if (ctype === undefined) {
        skipped.push({ id, reason: 'not_found_or_no_access' });
        continue;
      }
      if (!canUserDeleteContactRecord(user, { type: ctype }, flags)) {
        skipped.push({ id, reason: 'forbidden' });
        continue;
      }
      toDelete.push(id);
    }

    if (toDelete.length === 0) continue;

    const ph2 = toDelete.map(() => '?').join(',');
    await query(
      `UPDATE contacts
       SET deleted_at = NOW(),
           deleted_by = ?,
           deleted_source = ?,
           updated_by = ?
       WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${ph2})`,
      [user.id, deleted_source || 'manual', user.id, tenantId, ...toDelete]
    );

    deleted.push(...toDelete);
  }

  if (deleted.length > 0) {
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'contact',
      event_type: 'contact.bulk_deleted',
      summary: `Bulk deleted ${deleted.length} record(s)`,
      payload_json: {
        count: deleted.length,
        deleted_source: deleted_source || 'manual',
      },
    });
  }

  return { deleted, skipped, deletedCount: deleted.length };
}

/** Default API cap for synchronous bulk tag ops; background jobs pass unlimited: true. */
const BULK_TAG_OPS_MAX = 10000;
const BULK_TAG_OPS_CHUNK = 500;
/** Cap IN (tag_id, …) size per DELETE to stay under driver / packet limits when “remove all catalog tags”. */
const BULK_TAG_DELETE_TAG_CHUNK = 200;

/**
 * Merge tag_ids onto each visible contact (does not remove existing tags).
 * Chunked visibility checks + INSERT IGNORE (same ownership rules as list/detail via buildOwnershipWhere).
 */
export async function bulkAddTagsToContacts(tenantId, user, { contact_ids, tag_ids } = {}, options = {}) {
  const unlimited = Boolean(options.unlimited);
  const rawContacts = Array.isArray(contact_ids) ? contact_ids : [];
  const uniqueContactIds = [
    ...new Set(rawContacts.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  const requestTruncated = !unlimited && uniqueContactIds.length > BULK_TAG_OPS_MAX;
  const contactIds = unlimited ? uniqueContactIds : uniqueContactIds.slice(0, BULK_TAG_OPS_MAX);

  const rawTags = Array.isArray(tag_ids) ? tag_ids : [];
  const tidList = [
    ...new Set(rawTags.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
  ];

  if (contactIds.length === 0) {
    const err = new Error('contact_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }
  if (tidList.length === 0) {
    const err = new Error('tag_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const tPlace = tidList.map(() => '?').join(',');
  const tagRows = await query(
    `SELECT id FROM contact_tags WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${tPlace})`,
    [tenantId, ...tidList]
  );
  if (tagRows.length !== tidList.length) {
    const err = new Error('Invalid tag_id in list');
    err.status = 400;
    throw err;
  }

  const { whereSQL, params: ownParams } = buildOwnershipWhere(user);

  const updated = [];
  const skipped = [];

  for (let i = 0; i < contactIds.length; i += BULK_TAG_OPS_CHUNK) {
    const chunk = contactIds.slice(i, i + BULK_TAG_OPS_CHUNK);
    const cPlace = chunk.map(() => '?').join(',');
    const visibleRows = await query(
      `SELECT c.id FROM contacts c WHERE ${whereSQL} AND c.id IN (${cPlace})`,
      [...ownParams, ...chunk]
    );
    const allowedSet = new Set(visibleRows.map((r) => Number(r.id)));

    const chunkUpdated = [];
    for (const id of chunk) {
      const nid = Number(id);
      if (allowedSet.has(nid)) {
        chunkUpdated.push(nid);
        updated.push(nid);
      } else {
        skipped.push({ id: nid, reason: 'not_found_or_no_access' });
      }
    }

    if (chunkUpdated.length > 0) {
      await contactTagsService.insertTagAssignmentsMerge(tenantId, user, chunkUpdated, tidList);
    }
  }

  const out = { updated, skipped, updatedCount: updated.length };
  if (requestTruncated) {
    out.requestTruncated = true;
    out.cap = BULK_TAG_OPS_MAX;
  }
  if (updated.length > 0) {
    const contactCount = new Set(updated).size;
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'contact',
      event_type: 'contact.tags.bulk_add',
      summary: `Added ${tidList.length} tag(s) to ${contactCount} record(s)`,
      payload_json: { tag_ids: tidList, contact_count: contactCount },
    });
  }
  return out;
}

/**
 * Remove tag links from many visible contacts (only (contact_id, tag_id) pairs that exist are deleted).
 */
export async function bulkRemoveTagsFromContacts(tenantId, user, { contact_ids, tag_ids } = {}, options = {}) {
  const unlimited = Boolean(options.unlimited);
  const rawContacts = Array.isArray(contact_ids) ? contact_ids : [];
  const uniqueContactIds = [
    ...new Set(rawContacts.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  const requestTruncated = !unlimited && uniqueContactIds.length > BULK_TAG_OPS_MAX;
  const contactIds = unlimited ? uniqueContactIds : uniqueContactIds.slice(0, BULK_TAG_OPS_MAX);

  const rawTags = Array.isArray(tag_ids) ? tag_ids : [];
  const tidList = [
    ...new Set(rawTags.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
  ];

  if (contactIds.length === 0) {
    const err = new Error('contact_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }
  if (tidList.length === 0) {
    const err = new Error('tag_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const tPlace = tidList.map(() => '?').join(',');
  const tagRows = await query(
    `SELECT id FROM contact_tags WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${tPlace})`,
    [tenantId, ...tidList]
  );
  if (tagRows.length !== tidList.length) {
    const err = new Error('Invalid tag_id in list');
    err.status = 400;
    throw err;
  }

  const { whereSQL, params: ownParams } = buildOwnershipWhere(user);

  const updated = [];
  const skipped = [];
  let removedAssignmentCount = 0;

  for (let i = 0; i < contactIds.length; i += BULK_TAG_OPS_CHUNK) {
    const chunk = contactIds.slice(i, i + BULK_TAG_OPS_CHUNK);
    const cPlace = chunk.map(() => '?').join(',');
    const visibleRows = await query(
      `SELECT c.id FROM contacts c WHERE ${whereSQL} AND c.id IN (${cPlace})`,
      [...ownParams, ...chunk]
    );
    const allowedSet = new Set(visibleRows.map((r) => Number(r.id)));

    const chunkUpdated = [];
    for (const id of chunk) {
      const nid = Number(id);
      if (allowedSet.has(nid)) {
        chunkUpdated.push(nid);
        updated.push(nid);
      } else {
        skipped.push({ id: nid, reason: 'not_found_or_no_access' });
      }
    }

    if (chunkUpdated.length > 0) {
      const cPh = chunkUpdated.map(() => '?').join(',');
      for (let ti = 0; ti < tidList.length; ti += BULK_TAG_DELETE_TAG_CHUNK) {
        const tagChunk = tidList.slice(ti, ti + BULK_TAG_DELETE_TAG_CHUNK);
        const tPh = tagChunk.map(() => '?').join(',');
        const delResult = await query(
          `DELETE FROM contact_tag_assignments
           WHERE tenant_id = ? AND contact_id IN (${cPh}) AND tag_id IN (${tPh})`,
          [tenantId, ...chunkUpdated, ...tagChunk]
        );
        removedAssignmentCount += Number(delResult?.affectedRows ?? 0);
      }
    }
  }

  const out = {
    updated,
    skipped,
    updatedCount: updated.length,
    removedAssignmentCount,
  };
  if (requestTruncated) {
    out.requestTruncated = true;
    out.cap = BULK_TAG_OPS_MAX;
  }
  if (updated.length > 0) {
    const contactCount = new Set(updated).size;
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'contact',
      event_type: 'contact.tags.bulk_remove',
      summary: `Removed ${tidList.length} tag(s) from ${contactCount} record(s)`,
      payload_json: { tag_ids: tidList, contact_count: contactCount },
    });
  }
  return out;
}

const ASSIGN_CONTACTS_FETCH_CHUNK = 1500;
const ASSIGN_CONTACTS_UPDATE_CHUNK = 2000;

async function fetchAssignContactRowsChunked(tenantId, ids) {
  const contacts = [];
  for (let i = 0; i < ids.length; i += ASSIGN_CONTACTS_FETCH_CHUNK) {
    const chunk = ids.slice(i, i + ASSIGN_CONTACTS_FETCH_CHUNK);
    const ph = chunk.map(() => '?').join(', ');
    const rows = await query(
      `SELECT id, manager_id, assigned_user_id, campaign_id FROM contacts
       WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL`,
      [tenantId, ...chunk]
    );
    contacts.push(...rows);
  }
  return contacts;
}

async function selectContactsAfterAssignChunked(tenantId, ids) {
  const updated = [];
  for (let i = 0; i < ids.length; i += ASSIGN_CONTACTS_FETCH_CHUNK) {
    const chunk = ids.slice(i, i + ASSIGN_CONTACTS_FETCH_CHUNK);
    const ph = chunk.map(() => '?').join(', ');
    const rows = await query(
      `SELECT id, tenant_id, type, first_name, last_name, display_name, email, source, manager_id, assigned_user_id, status_id, campaign_id, created_at
       FROM contacts
       WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL`,
      [tenantId, ...chunk]
    );
    updated.push(...rows);
  }
  return updated;
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

  const contacts = await fetchAssignContactRowsChunked(tenantId, ids);

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
    const err = new Error('Only admins can clear the manager assignment');
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

  let affectedRows = 0;
  for (let o = 0; o < ids.length; o += ASSIGN_CONTACTS_UPDATE_CHUNK) {
    const sub = ids.slice(o, o + ASSIGN_CONTACTS_UPDATE_CHUNK);
    const ph = sub.map(() => '?').join(', ');
    let whereSql = `tenant_id = ? AND id IN (${ph})`;
    let whereParams = [tenantId, ...sub];
    if (user.role === 'manager') {
      whereSql += ' AND (manager_id = ? OR manager_id IS NULL)';
      whereParams.push(user.id);
    }
    const updateResult = await query(
      `UPDATE contacts SET ${setClauses.join(', ')} WHERE ${whereSql}`,
      [...setParams, ...whereParams]
    );
    affectedRows += Number(updateResult?.affectedRows ?? 0);
  }

  const updated = await selectContactsAfterAssignChunked(tenantId, ids);

  // Record assignment history for changed rows in one INSERT (bulk assign / unassign).
  const byIdBefore = new Map(contacts.map((c) => [Number(c.id), c]));
  const historyRows = [];
  for (const c of updated) {
    const before = byIdBefore.get(Number(c.id));
    if (!before) continue;
    const changed =
      Number(before.manager_id || 0) !== Number(c.manager_id || 0) ||
      Number(before.assigned_user_id || 0) !== Number(c.assigned_user_id || 0) ||
      (cidProvided && Number((before.campaign_id ?? 0) || 0) !== Number((c.campaign_id ?? 0) || 0));
    if (!changed) continue;
    historyRows.push({
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
  const summaryParts = [];
  if (midProvided) summaryParts.push('manager');
  if (aidProvided) summaryParts.push('agent');
  if (cidProvided) summaryParts.push('campaign');

  if (historyRows.length > 0) {
    try {
      await contactAssignmentHistoryService.recordChangesBulk(tenantId, historyRows);
      await safeLogTenantActivity(tenantId, user?.id, {
        event_category: 'contact',
        event_type: 'contact.bulk_assign',
        summary: `Updated assignment for ${historyRows.length} record(s) (${summaryParts.join(', ')})`,
        payload_json: {
          contacts_touched: historyRows.length,
          fields: summaryParts,
        },
      });
    } catch (e) {
      console.error('[contacts.assign] history/log failed:', e?.message || e);
    }
  }

  // Notify based on actual updated rows (not only history rows) so UI stays consistent.
  if (affectedRows > 0 && updated.length > 0) {
    const first = updated[0];
    await createAndDispatchNotification(tenantId, user?.id, {
      moduleKey: 'contacts',
      eventType: 'contact_assigned',
      severity: 'normal',
      title: `Contacts reassigned (${affectedRows})`,
      body: 'Contact ownership/assignment was updated.',
      assignedUserId: first?.assigned_user_id,
      managerId: first?.manager_id,
      entityType: 'contact',
      entityId: first?.id,
      ctaPath: '/contacts',
      eventHash: `contacts:assign:${tenantId}:${Date.now()}:${affectedRows}`,
    });
    if (cidProvided) {
      await createAndDispatchNotification(tenantId, user?.id, {
        moduleKey: 'contacts',
        eventType: 'campaign_assigned',
        severity: 'normal',
        title: `Campaign assignment updated (${affectedRows})`,
        body: 'Contacts/leads were assigned to a campaign.',
        assignedUserId: first?.assigned_user_id,
        managerId: first?.manager_id,
        entityType: 'contact',
        entityId: first?.id,
        ctaPath: '/campaigns',
        eventHash: `contacts:campaign:${tenantId}:${Date.now()}:${affectedRows}`,
      });
    }
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

/** One query at import start — avoids thousands of per-row status lookups on large CSVs. */
async function warmImportStatusCache(statusCache) {
  if (!statusCache) return;
  const rows = await query(
    `SELECT id, code, name FROM contact_status_master WHERE is_deleted = 0`
  );
  for (const r of rows) {
    if (r?.code) statusCache.set(String(r.code).toLowerCase(), r.id);
    if (r?.name) statusCache.set(String(r.name).toLowerCase(), r.id);
  }
}

async function resolveContactStatusIdByName(tenantId, statusNameOrCode, statusCache = null) {
  const s = String(statusNameOrCode || '').trim();
  if (!s) return null;
  const lowered = s.toLowerCase();
  if (statusCache?.has(lowered)) return statusCache.get(lowered);

  // Exact code match first, then name match (case-insensitive)
  const rows = await query(
    `SELECT id
     FROM contact_status_master
     WHERE is_deleted = 0
       AND (LOWER(code) = ? OR LOWER(name) = ?)
     LIMIT 1`,
    [lowered, lowered]
  );
  const id = rows?.[0]?.id ?? null;
  if (statusCache) statusCache.set(lowered, id);
  return id;
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

async function ensureCustomFieldDefinition(
  tenantId,
  { name, label, type, options_json } = {},
  cfDefCache = null
) {
  const safeName = normalizeHeader(name);
  const safeLabel = String(label || safeName).trim() || safeName;
  if (!safeName) return null;

  if (cfDefCache?.has(safeName)) return cfDefCache.get(safeName);

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
  if (existing?.[0]?.id) {
    const row = existing[0];
    cfDefCache?.set(safeName, row);
    return row;
  }

  try {
    const result = await query(
      `INSERT INTO contact_custom_fields (tenant_id, name, label, type, options_json, is_required, is_active)
       VALUES (?, ?, ?, ?, ?, 0, 1)`,
      [tenantId, safeName, safeLabel, fieldType, optsStr]
    );
    const row = { id: result.insertId, name: safeName, label: safeLabel, type: fieldType };
    cfDefCache?.set(safeName, row);
    return row;
  } catch (e) {
    // If another request created it concurrently, fetch again
    const again = await query(
      `SELECT id, name, label, type
       FROM contact_custom_fields
       WHERE tenant_id = ? AND name = ?
       LIMIT 1`,
      [tenantId, safeName]
    );
    const row = again?.[0] ?? null;
    if (row) cfDefCache?.set(safeName, row);
    return row;
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
  'notes',
];

const CONTACT_DEFAULT_EXTRA_KEY_SET = new Set(CONTACT_DEFAULT_EXTRA_KEYS);

/** Auto-created custom fields for import/integration (excludes CONTACT_DEFAULT_EXTRA_KEYS). */
const PROVIDER_COLUMNS_AUTO_CF = [
  { key: 'property', label: 'Property', type: 'text' },
  { key: 'budget', label: 'Budget', type: 'number' },
  { key: 'services', label: 'Services', type: 'text' },
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
  notes: REMARK_KEYS,
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
      out[key] =
        key === 'date_of_birth'
          ? normalizeDateOfBirthForDb(val)
          : key === 'notes'
            ? normalizeContactNotesForDb(val)
            : trimStr(val);
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
    out[key] =
      key === 'date_of_birth'
        ? normalizeDateOfBirthForDb(picked)
        : key === 'notes'
          ? normalizeContactNotesForDb(picked)
          : trimStr(picked);
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
 * Sync-only: primary phone E.164 for duplicate prefetch (no DB). Matches phone resolution in
 * {@link resolveCsvRowToImportPayload} without running custom-field / provider async work.
 */
function peekImportPrimaryPhoneE164(normalized, headerMapping, defaultCountryCode) {
  const row = { ...normalized };
  if (headerMapping && typeof headerMapping === 'object') {
    for (const nk of Object.keys(headerMapping)) {
      if (headerMapping[nk]?.target === 'ignore') {
        delete row[nk];
      }
    }
  }
  let mappedPrimaryPhone = null;
  if (headerMapping) {
    for (const [nk, cfg] of Object.entries(headerMapping)) {
      const val = row[nk];
      if (val === undefined) continue;
      const target = cfg?.target;
      if (!target || target === 'ignore') continue;
      if (target === 'primary_phone') mappedPrimaryPhone = val;
    }
  }
  const normalizedForPhones = { ...row };
  if (mappedPrimaryPhone != null && String(mappedPrimaryPhone).trim()) {
    normalizedForPhones.primary_phone = mappedPrimaryPhone;
  }
  const phones = buildPhonesFromCsvRow(normalizedForPhones, defaultCountryCode, toE164Phone);
  return phones.find((p) => p.is_primary)?.phone || null;
}

/** Load existing rows keyed by primary phone for import duplicate detection (same `recordType` only — leads and contacts are independent). */
async function prefetchImportExistingByPhones(tenantId, phones, recordType) {
  const rt = String(recordType || 'lead').toLowerCase() === 'contact' ? 'contact' : 'lead';
  const unique = [...new Set((phones || []).filter(Boolean))];
  const map = new Map();
  if (unique.length === 0) return map;
  const chunkSize = 450;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const ph = chunk.map(() => '?').join(',');
    const rows = await query(
      `SELECT p.phone AS phone, c.id AS id, c.type AS type
       FROM contact_phones p
       INNER JOIN contacts c
         ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND c.type = ? AND p.phone IN (${ph}) AND c.deleted_at IS NULL`,
      [tenantId, rt, ...chunk]
    );
    for (const r of rows) {
      if (r?.phone) map.set(r.phone, { id: r.id, type: r.type });
    }
  }
  return map;
}

/**
 * Same rules as CSV import row processing (may create missing provider-style custom fields).
 * @returns {{ error: string } | { error: null, first_name, last_name, display_name, email, finalSource, resolvedStatusId, providerStatusName, campaign_id, manager_id, assigned_user_id, phones, custom_fields_deduped, primaryPhone }}
 */
async function resolveCsvRowToImportPayload(
  tenantId,
  {
    normalized,
    headerMapping,
    byHeader,
    defaultCountryCode,
    customFieldDefsById = null,
    statusCache = null,
    cfDefCache = null,
  }
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
        mappedCore[target] =
          target === 'date_of_birth'
            ? normalizeDateOfBirthForDb(val)
            : target === 'notes'
              ? normalizeContactNotesForDb(val)
              : trimStr(val);
      } else if (target === 'remark') {
        // Legacy import maps: "remark" used to be an auto custom field; store on contacts.notes.
        if (val === null || !String(val).trim()) continue;
        mappedCore.notes = normalizeContactNotesForDb(val);
      } else if (PROVIDER_COLUMNS_AUTO_CF.some((d) => d.key === target)) {
        if (val === null || !String(val).trim()) continue;
        const def = PROVIDER_COLUMNS_AUTO_CF.find((d) => d.key === target);
        if (!def) continue;
        const existingField = byHeader.get(def.key);
        const field =
          existingField ||
          (await ensureCustomFieldDefinition(
            tenantId,
            { name: def.key, label: def.label, type: def.type },
            cfDefCache
          ));
        if (!field?.id) continue;
        byHeader.set(def.key, field);
        byHeader.set(normalizeHeader(def.label), field);
        const effType = effectiveImportValueType(cfg, field.type);
        const pv = normalizeImportedCustomFieldValue(val, effType);
        const fidAuto = normalizeContactImportCustomFieldId(field.id);
        if (fidAuto) {
          custom_fields.push({ field_id: fidAuto, value_text: pv !== null ? pv : String(val) });
        }
      } else if (target === 'custom' && cfg.customFieldId) {
        const fid = normalizeContactImportCustomFieldId(cfg.customFieldId);
        const fieldDef = fid ? customFieldDefsById?.get(fid) || null : null;
        const effType = effectiveCustomFieldImportType(cfg, fieldDef);
        const pv = normalizeImportedCustomFieldValue(val, effType);
        if (fid) {
          custom_fields.push({
            field_id: fid,
            value_text: pv !== null ? pv : val === null ? null : String(val),
          });
        }
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
        const field = await ensureCustomFieldDefinition(
          tenantId,
          {
            name: importName,
            label,
            type: ft,
            options_json: opts,
          },
          cfDefCache
        );
        const fidNew = normalizeContactImportCustomFieldId(field?.id);
        if (!fidNew) continue;
        byHeader.set(normalizeHeader(field.name || importName), field);
        byHeader.set(normalizeHeader(label), field);
        const pv = normalizeImportedCustomFieldValue(val, ft);
        custom_fields.push({
          field_id: fidNew,
          value_text: pv !== null ? pv : String(val),
        });
        if (customFieldDefsById) {
          customFieldDefsById.set(fidNew, {
            id: fidNew,
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
    status_id ||
    (providerStatusName ? await resolveContactStatusIdByName(tenantId, providerStatusName, statusCache) : null);
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
    const fidUn = normalizeContactImportCustomFieldId(field.id);
    if (fidUn) custom_fields.push({ field_id: fidUn, value_text });
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
      (await ensureCustomFieldDefinition(
        tenantId,
        { name: def.key, label: def.label, type: def.type },
        cfDefCache
      ));
    if (!field?.id) continue;
    byHeader.set(def.key, field);
    byHeader.set(normalizeHeader(def.label), field);

    const pv = normalizeImportedCustomFieldValue(val, def.type);
    const value_text = pv !== null ? pv : val === null ? null : String(val);
    const fidPv = normalizeContactImportCustomFieldId(field.id);
    if (fidPv) custom_fields.push({ field_id: fidPv, value_text });
  }

  const coreDefaults = applyCoreDefaultsFromNormalized(row, mappedCore, headerMapping);

  const cfByField = new Map();
  for (const c of custom_fields) {
    const fid = normalizeContactImportCustomFieldId(c?.field_id);
    if (!fid) continue;
    cfByField.set(fid, c.value_text);
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

/** Core column keys allowed in dynamic export (aligned with list column ids, tag_names = tags in CSV). */
const EXPORT_CORE_KEY_WHITELIST = new Set([
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
  'notes',
  'tag_names',
  'campaign_id',
  'campaign_name',
  'status_id',
  'status_name',
  'manager_id',
  'assigned_user_id',
  'manager_name',
  'assigned_user_name',
  'call_count_total',
  'last_called_at',
  'created_source',
  'created_by',
  'updated_by',
  'created_at',
]);

const EXPORT_HEADER_LABEL = {
  id: 'id',
  type: 'type',
  display_name: 'display_name',
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  primary_phone: 'primary_phone',
  source: 'source',
  city: 'city',
  state: 'state',
  country: 'country',
  address: 'address',
  address_line_2: 'address_line_2',
  pin_code: 'pin_code',
  company: 'company',
  job_title: 'job_title',
  website: 'website',
  industry: 'industry',
  date_of_birth: 'date_of_birth',
  tax_id: 'tax_id',
  notes: 'notes',
  tag_names: 'tags',
  campaign_id: 'campaign_id',
  campaign_name: 'campaign_name',
  status_id: 'status_id',
  status_name: 'status_name',
  manager_id: 'manager_id',
  assigned_user_id: 'assigned_user_id',
  manager_name: 'manager_name',
  assigned_user_name: 'assigned_user_name',
  call_count_total: 'call_count_total',
  last_called_at: 'last_called_at',
  created_source: 'created_source',
  created_by: 'created_by',
  updated_by: 'updated_by',
  created_at: 'created_at',
};

function formatExportCoreCell(key, c) {
  if (key === 'date_of_birth') {
    if (c.date_of_birth == null) return '';
    return c.date_of_birth instanceof Date
      ? c.date_of_birth.toISOString().slice(0, 10)
      : String(c.date_of_birth).slice(0, 10);
  }
  if (key === 'created_at' || key === 'last_called_at') {
    const v = c[key];
    if (v == null) return '';
    try {
      return new Date(v).toISOString();
    } catch {
      return String(v);
    }
  }
  if (key === 'tag_names') return c.tag_names ?? '';
  const v = c[key];
  return v == null ? '' : v;
}

/**
 * @returns {{ keys: Array<{ kind: 'core' | 'cf', key: string, fieldId?: number }>, headers: string[] }}
 */
async function resolveDynamicExportColumns(tenantId, columnKeys) {
  const keys = [];
  const seen = new Set();
  const cfIds = [];

  for (const raw of columnKeys) {
    const s = String(raw ?? '').trim();
    if (!s || seen.has(s)) continue;
    const m = /^cf:(\d+)$/i.exec(s);
    if (m) {
      const fieldId = Number(m[1]);
      if (Number.isFinite(fieldId) && fieldId > 0) {
        seen.add(s);
        keys.push({ kind: 'cf', key: `cf:${fieldId}`, fieldId });
        cfIds.push(fieldId);
      }
      continue;
    }
    if (EXPORT_CORE_KEY_WHITELIST.has(s)) {
      seen.add(s);
      keys.push({ kind: 'core', key: s });
    }
  }

  let cfMeta = [];
  if (cfIds.length > 0) {
    const uniq = [...new Set(cfIds)];
    const ph = uniq.map(() => '?').join(',');
    cfMeta = await query(
      `SELECT id, name, label FROM contact_custom_fields WHERE tenant_id = ? AND id IN (${ph})`,
      [tenantId, ...uniq]
    );
  }
  const cfById = new Map((cfMeta || []).map((r) => [r.id, r]));

  const resolved = [];
  const headers = [];
  for (const k of keys) {
    if (k.kind === 'core') {
      resolved.push(k);
      headers.push(EXPORT_HEADER_LABEL[k.key] || k.key);
    } else {
      const row = cfById.get(k.fieldId);
      if (!row) continue;
      resolved.push(k);
      headers.push(`cf:${row.name}`);
    }
  }

  return { keys: resolved, headers };
}

export async function exportContactsCsv(
  tenantId,
  user,
  {
    search = '',
    type,
    statusId,
    statusIdsFilter,
    includeCustomFields = true,
    filterManagerId,
    filterAssignedUserId,
    filterManagerIds,
    filterUnassignedManagers,
    campaignIdFilter,
    campaignIdsFilter,
    filterTagIds,
    minCallCount,
    maxCallCount,
    lastCalledAfter,
    lastCalledBefore,
    touchStatus,
    columnFilters,
    /** 'filtered' = apply list filters; 'selected' = only id list (+ type + ownership). */
    exportScope = 'filtered',
    selectedIds = [],
    /** Ordered column keys: core ids + `cf:fieldId`. Null/empty = legacy full export. */
    columnKeys = null,
  } = {}
) {
  const exportSelect = `
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
        c.notes,
        c.industry_profile,
        c.call_count_total,
        c.last_called_at,
        (SELECT GROUP_CONCAT(DISTINCT ct.name ORDER BY ct.name SEPARATOR ', ')
         FROM contact_tag_assignments cta
         INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
         WHERE cta.tenant_id = c.tenant_id AND cta.contact_id = c.id AND ct.deleted_at IS NULL
        ) AS tag_names,
        c.campaign_id,
        cam.name AS campaign_name,
        c.status_id,
        csm.name AS status_name,
        c.manager_id,
        c.assigned_user_id,
        mgr.name AS manager_name,
        ag.name AS assigned_user_name,
        c.created_source,
        c.created_by,
        c.updated_by,
        c.created_at`;

  const exportJoins = `
     FROM contacts c
     LEFT JOIN contact_phones p
       ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN campaigns cam
       ON cam.id = c.campaign_id AND cam.tenant_id = c.tenant_id AND cam.deleted_at IS NULL
     LEFT JOIN contact_status_master csm
       ON csm.id = c.status_id AND csm.is_deleted = 0
     LEFT JOIN users mgr
       ON mgr.id = c.manager_id AND mgr.tenant_id = c.tenant_id AND mgr.is_deleted = 0
     LEFT JOIN users ag
       ON ag.id = c.assigned_user_id AND ag.tenant_id = c.tenant_id AND ag.is_deleted = 0`;

  let finalWhere;
  let queryParams;

  if (exportScope === 'selected') {
    const { whereSQL, params: ownParams } = buildOwnershipWhere(user);
    const ids = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(
      0,
      10000
    );
    if (ids.length === 0) {
      return '\uFEFF';
    }
    const clauses = [whereSQL];
    const params = [...ownParams];
    if (type) {
      clauses.push('c.type = ?');
      params.push(type);
    }
    clauses.push(`c.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
    finalWhere = `WHERE ${clauses.join(' AND ')}`;
    queryParams = params;
  } else {
    const prepared = await prepareContactListFinalWhere(tenantId, user, {
      search,
      type,
      statusId,
      statusIdsFilter,
      minCallCount,
      maxCallCount,
      lastCalledAfter,
      lastCalledBefore,
      filterManagerId,
      filterAssignedUserId,
      filterManagerIds,
      filterUnassignedManagers,
      campaignIdFilter,
      campaignIdsFilter,
      filterTagIds,
      columnFilters,
      touchStatus,
    });
    finalWhere = prepared.finalWhere;
    queryParams = prepared.params;
  }

  const contacts = await query(
    `SELECT ${exportSelect}
     ${exportJoins}
     ${finalWhere}
     ORDER BY c.created_at DESC`,
    queryParams
  );

  const useDynamic =
    Array.isArray(columnKeys) &&
    columnKeys.length > 0 &&
    columnKeys.some((k) => String(k ?? '').trim());

  let customFields = [];
  let valuesByContact = new Map();
  let dynamicResolved = null;

  if (useDynamic) {
    dynamicResolved = await resolveDynamicExportColumns(tenantId, columnKeys);
    if (!dynamicResolved.keys.length) {
      return '\uFEFF';
    }
    const needCf = dynamicResolved.keys.filter((k) => k.kind === 'cf');
    customFields = needCf.map((k) => ({ id: k.fieldId, name: k.key, label: k.key }));

    const ids = contacts.map((c) => c.id);
    if (ids.length > 0 && needCf.length > 0) {
      const fieldIds = [...new Set(needCf.map((k) => k.fieldId))];
      const placeholders = ids.map(() => '?').join(',');
      const rows = await query(
        `SELECT contact_id, field_id, value_text
         FROM contact_custom_field_values
         WHERE tenant_id = ? AND contact_id IN (${placeholders}) AND field_id IN (${fieldIds.map(() => '?').join(',')})`,
        [tenantId, ...ids, ...fieldIds]
      );

      for (const r of rows) {
        const map = valuesByContact.get(r.contact_id) || new Map();
        map.set(r.field_id, r.value_text);
        valuesByContact.set(r.contact_id, map);
      }
    }
  } else if (includeCustomFields) {
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

  const lines = [];

  if (useDynamic && dynamicResolved?.keys?.length) {
    const headers = dynamicResolved.headers;
    lines.push(`\uFEFF${headers.map(csvEscape).join(',')}`);

    for (const c of contacts) {
      const cfMap = valuesByContact.get(c.id);
      const cells = dynamicResolved.keys.map((def) => {
        if (def.kind === 'core') return formatExportCoreCell(def.key, c);
        return cfMap && def.fieldId != null ? cfMap.get(def.fieldId) ?? '' : '';
      });
      lines.push(cells.map(csvEscape).join(','));
    }
    return lines.join('\r\n');
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
    'industry_profile_json',
    'tags',
    'campaign_id',
    'campaign_name',
    'status_id',
    'status_name',
    'manager_id',
    'assigned_user_id',
    'created_source',
    'created_by',
    'updated_by',
    'created_at',
  ];

  const customHeaders = includeCustomFields ? customFields.map((f) => `cf:${f.name}`) : [];

  const headers = [...baseHeaders, ...customHeaders];
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
      c.industry_profile
        ? typeof c.industry_profile === 'string'
          ? c.industry_profile
          : JSON.stringify(c.industry_profile)
        : '',
      c.tag_names || '',
      c.campaign_id,
      c.campaign_name,
      c.status_id,
      c.status_name,
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

/** Map export CSV options → list filter shape for listAllContactIdsForBulkJob / prepareContactListFinalWhere. */
export function exportOptsToListFilterOptions(exportOpts = {}) {
  return {
    search: exportOpts.search ?? '',
    type: exportOpts.type,
    statusId: exportOpts.statusId,
    statusIdsFilter: exportOpts.statusIdsFilter,
    minCallCount: exportOpts.minCallCount,
    maxCallCount: exportOpts.maxCallCount,
    lastCalledAfter: exportOpts.lastCalledAfter,
    lastCalledBefore: exportOpts.lastCalledBefore,
    filterManagerId: exportOpts.filterManagerId,
    filterAssignedUserId: exportOpts.filterAssignedUserId,
    filterManagerIds: exportOpts.filterManagerIds,
    filterUnassignedManagers: exportOpts.filterUnassignedManagers,
    campaignIdFilter: exportOpts.campaignIdFilter,
    campaignIdsFilter: exportOpts.campaignIdsFilter,
    filterTagIds: exportOpts.filterTagIds,
    columnFilters: exportOpts.columnFilters,
    touchStatus: exportOpts.touchStatus,
  };
}

/**
 * Stream a large export to disk by reusing exportContactsCsv in page-sized chunks (selected scope).
 * For filtered scope, resolves all matching IDs first (bounded by backgroundJobMaxContactIds).
 */
export async function exportContactsCsvToJobFile(
  tenantId,
  user,
  exportOpts,
  outputPath,
  onProgress,
  /** @type {null | (() => Promise<boolean>)} */ cancelCheck = null
) {
  const pageSize = env.backgroundJobExportPageSize;
  const scope = exportOpts.exportScope === 'selected' ? 'selected' : 'filtered';

  let idList;
  if (scope === 'filtered') {
    idList = await listAllContactIdsForBulkJob(
      tenantId,
      user,
      exportOptsToListFilterOptions(exportOpts)
    );
  } else {
    idList = [
      ...new Set(
        (Array.isArray(exportOpts.selectedIds) ? exportOpts.selectedIds : [])
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ].sort((a, b) => a - b);
  }

  const total = idList.length;
  if (total === 0) {
    const empty = await exportContactsCsv(tenantId, user, {
      ...exportOpts,
      exportScope: 'selected',
      selectedIds: [],
    });
    await fs.writeFile(outputPath, empty || '\uFEFF', 'utf8');
    if (typeof onProgress === 'function') await onProgress({ processed: 0, total: 0, step: 'export' });
    return { rowCount: 0, path: outputPath };
  }

  const pick = {
    search: exportOpts.search ?? '',
    type: exportOpts.type,
    statusId: exportOpts.statusId,
    statusIdsFilter: exportOpts.statusIdsFilter,
    includeCustomFields: exportOpts.includeCustomFields !== false && exportOpts.includeCustomFields !== 0,
    filterManagerId: exportOpts.filterManagerId,
    filterAssignedUserId: exportOpts.filterAssignedUserId,
    filterManagerIds: exportOpts.filterManagerIds,
    filterUnassignedManagers: exportOpts.filterUnassignedManagers,
    campaignIdFilter: exportOpts.campaignIdFilter,
    campaignIdsFilter: exportOpts.campaignIdsFilter,
    filterTagIds: exportOpts.filterTagIds,
    minCallCount: exportOpts.minCallCount,
    maxCallCount: exportOpts.maxCallCount,
    lastCalledAfter: exportOpts.lastCalledAfter,
    lastCalledBefore: exportOpts.lastCalledBefore,
    touchStatus: exportOpts.touchStatus,
    columnFilters: exportOpts.columnFilters,
    columnKeys: exportOpts.columnKeys ?? null,
  };

  let headerWritten = false;
  let rowCount = 0;

  for (let i = 0; i < idList.length; i += pageSize) {
    if (typeof cancelCheck === 'function' && (await cancelCheck())) {
      const err = new Error('Cancelled by user');
      err.code = 'JOB_CANCELLED';
      throw err;
    }
    const chunk = idList.slice(i, i + pageSize);
    const csv = await exportContactsCsv(tenantId, user, {
      ...pick,
      exportScope: 'selected',
      selectedIds: chunk,
    });

    if (!headerWritten) {
      await fs.writeFile(outputPath, `${csv}\r\n`, 'utf8');
      headerWritten = true;
      const lines = String(csv).split(/\r?\n/).filter((l) => l.length > 0);
      rowCount += Math.max(0, lines.length - 1);
    } else {
      const lines = String(csv).split(/\r?\n/).filter((l) => l.length > 0);
      const dataOnly = lines.slice(1);
      rowCount += dataOnly.length;
      if (dataOnly.length > 0) {
        await fs.appendFile(outputPath, `${dataOnly.join('\r\n')}\r\n`, 'utf8');
      }
    }

    if (typeof onProgress === 'function') {
      await onProgress({
        processed: Math.min(i + chunk.length, total),
        total,
        step: 'export',
      });
    }
  }

  return { rowCount, path: outputPath };
}

async function validateImportTagIdsForTenant(tenantId, tagIds) {
  const ids = [
    ...new Set(
      (tagIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT id FROM contact_tags
     WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${ph})`,
    [tenantId, ...ids]
  );
  if (rows.length !== ids.length) {
    const err = new Error('One or more tag_ids are invalid for this tenant');
    err.status = 400;
    throw err;
  }
  return ids;
}

async function normalizeImportOwnershipDefaults(
  tenantId,
  user,
  importManagerIdRaw,
  importAssignedUserIdRaw
) {
  let defaultManagerId;
  let defaultAssignedUserId;

  const hasMgr =
    importManagerIdRaw !== undefined &&
    importManagerIdRaw !== null &&
    importManagerIdRaw !== '' &&
    String(importManagerIdRaw).trim() !== '';
  const hasAsg =
    importAssignedUserIdRaw !== undefined &&
    importAssignedUserIdRaw !== null &&
    importAssignedUserIdRaw !== '' &&
    String(importAssignedUserIdRaw).trim() !== '';

  if (user.role === 'agent') {
    return { defaultManagerId, defaultAssignedUserId };
  }

  if (user.role === 'admin') {
    if (hasMgr) {
      const mid = normalizeOptionalUserId(importManagerIdRaw);
      if (mid != null) {
        const [mgr] = await query(
          `SELECT id FROM users
           WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0
           LIMIT 1`,
          [mid, tenantId]
        );
        if (!mgr) {
          const err = new Error('Invalid import_manager_id');
          err.status = 400;
          throw err;
        }
        defaultManagerId = mid;
      }
    }
    if (hasAsg) {
      const aid = normalizeOptionalUserId(importAssignedUserIdRaw);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('import_assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
        defaultAssignedUserId = aid;
      }
    }
    return { defaultManagerId, defaultAssignedUserId };
  }

  if (user.role === 'manager') {
    if (hasMgr) {
      const mid = normalizeOptionalUserId(importManagerIdRaw);
      if (mid != null && mid !== Number(user.id)) {
        const err = new Error('import_manager_id can only be yourself');
        err.status = 403;
        throw err;
      }
      if (mid != null) defaultManagerId = mid;
    }
    if (hasAsg) {
      const aid = normalizeOptionalUserId(importAssignedUserIdRaw);
      if (aid != null) {
        const agent = await fetchUserBrief(tenantId, aid);
        if (!agent || agent.role !== 'agent') {
          const err = new Error('import_assigned_user_id must be an agent');
          err.status = 400;
          throw err;
        }
        if (Number(agent.manager_id) !== Number(user.id)) {
          const err = new Error('import_assigned_user_id must be an agent on your team');
          err.status = 403;
          throw err;
        }
        defaultAssignedUserId = aid;
      }
    }
    return { defaultManagerId, defaultAssignedUserId };
  }

  return { defaultManagerId, defaultAssignedUserId };
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
    tagIds: tagIdsOpt,
    importManagerId: importManagerIdRaw,
    importAssignedUserId: importAssignedUserIdRaw,
    /** When true (background jobs), the 2000-row guard is skipped. */
    skipImportRowLimit = false,
    /** Optional async ({ processed, total }) => void for background job progress. */
    onProgress = null,
    /** Optional async () => boolean — when true, import stops (background job cancelled). */
    cancelCheck = null,
  } = {}
) {
  const { records, headerRowIndex } = parseImportBufferToRecords(buffer, { originalFilename });

  const validatedTagIds = await validateImportTagIdsForTenant(tenantId, tagIdsOpt);
  const { defaultManagerId, defaultAssignedUserId } = await normalizeImportOwnershipDefaults(
    tenantId,
    user,
    importManagerIdRaw,
    importAssignedUserIdRaw
  );

  const allFields = await query(
    `SELECT id, name, label, type
     FROM contact_custom_fields
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const byHeader = new Map();
  const customFieldDefsById = new Map();
  for (const f of allFields) {
    const nid = normalizeContactImportCustomFieldId(f.id);
    if (nid) customFieldDefsById.set(nid, f);
    byHeader.set(normalizeHeader(f.name), f);
    byHeader.set(normalizeHeader(f.label), f);
  }

  // mapping: { [nk]: { target, customFieldId?, importValueType? } | { target:'new_custom', fieldType, fieldLabel?, selectOptions? } }
  const headerMapping = mapping && typeof mapping === 'object' ? mapping : null;

  if (!skipImportRowLimit && records.length > 2000) {
    const err = new Error('CSV import supports up to 2000 rows per upload (use a background job to import larger files)');
    err.status = 400;
    throw err;
  }

  if (typeof onProgress === 'function' && records.length > 0) {
    await onProgress({ processed: 0, total: records.length, step: 'preparing' });
  }

  if (typeof cancelCheck === 'function' && (await cancelCheck())) {
    const err = new Error('Cancelled by user');
    err.code = 'JOB_CANCELLED';
    throw err;
  }

  const statusCache = new Map();
  await warmImportStatusCache(statusCache);
  const cfDefCache = new Map();

  let preloadedAgentManagerId;
  if (user.role === 'agent') {
    const [ur] = await query(
      `SELECT manager_id FROM users WHERE id = ? AND tenant_id = ? AND is_deleted = 0 AND role = 'agent' LIMIT 1`,
      [user.id, tenantId]
    );
    preloadedAgentManagerId = ur?.manager_id ?? null;
  }

  const peekPhones = [];
  for (let ri = 0; ri < records.length; ri++) {
    const prow = records[ri] || {};
    const normalizedPeek = {};
    for (const [k, v] of Object.entries(prow)) {
      normalizedPeek[normalizeHeader(k)] = v;
    }
    peekPhones.push(peekImportPrimaryPhoneE164(normalizedPeek, headerMapping, defaultCountryCode));
  }
  const prefetchMap = await prefetchImportExistingByPhones(tenantId, peekPhones, type);
  const sessionPhoneMap = new Map(prefetchMap);

  /**
   * Row-based progress stride: each tick advances processed_count by ~this many rows (see loop `i % stride`).
   * Larger stride => fewer socket/DB updates and bigger % jumps (e.g. stride 25 on 1000 rows is about +2% per tick).
   * Stride 5-6 keeps the N/total counter easy to track; >2k rows use a larger stride to limit churn.
   */
  const importProgressStride = records.length > 2000 ? 25 : records.length > 500 ? 6 : 5;

  if (typeof onProgress === 'function' && records.length > 0) {
    await onProgress({ processed: 0, total: records.length, step: 'import_rows' });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  const pendingImportCreates = [];
  const pendingPhoneKeys = new Set();
  const pendingTagMergeIds = [];

  const flushPendingTagMerges = async () => {
    if (validatedTagIds.length === 0 || pendingTagMergeIds.length === 0) return;
    while (pendingTagMergeIds.length > 0) {
      const chunk = pendingTagMergeIds.splice(0, IMPORT_TAG_MERGE_CHUNK);
      await contactTagsService.insertTagAssignmentsMerge(tenantId, user, chunk, validatedTagIds);
    }
  };

  const flushPendingCreates = async () => {
    if (pendingImportCreates.length === 0) return;
    const batch = pendingImportCreates.splice(0, pendingImportCreates.length);
    for (const b of batch) {
      if (b.primaryPhone) pendingPhoneKeys.delete(b.primaryPhone);
    }
    await flushImportCreateBuffer(
      tenantId,
      user,
      type,
      batch,
      sessionPhoneMap,
      statusCache,
      validatedTagIds,
      preloadedAgentManagerId
    );
    created += batch.length;
  };

  for (let i = 0; i < records.length; i++) {
    const rowIndex = headerRowIndex + i + 2; // 1-based sheet row (header + data offset)
    const row = records[i] || {};

    if (
      typeof cancelCheck === 'function' &&
      (i % 5 === 0 || i === records.length - 1) &&
      (await cancelCheck())
    ) {
      await flushPendingCreates();
      await flushPendingTagMerges();
      const err = new Error('Cancelled by user');
      err.code = 'JOB_CANCELLED';
      throw err;
    }

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
        statusCache,
        cfDefCache,
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

      if (primaryPhone && pendingPhoneKeys.has(primaryPhone)) {
        await flushPendingCreates();
      }

      let effManagerId = manager_id;
      let effAssignedUserId = assigned_user_id;
      if (effManagerId === undefined && defaultManagerId !== undefined) effManagerId = defaultManagerId;
      if (effAssignedUserId === undefined && defaultAssignedUserId !== undefined) {
        effAssignedUserId = defaultAssignedUserId;
      }

      const coreRowFields = pickDefinedCoreFieldsFromResolved(resolved);

      let existingId = null;
      if (primaryPhone) {
        const ex = sessionPhoneMap.get(primaryPhone);
        if (ex) existingId = ex.id;
      }

      if (existingId && mode === 'skip') {
        skipped++;
      } else if (existingId) {
        await flushPendingCreates();
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
          ...(effManagerId !== undefined ? { manager_id: effManagerId } : {}),
          ...(effAssignedUserId !== undefined ? { assigned_user_id: effAssignedUserId } : {}),
          ...(phones.length > 0 ? { phones } : {}),
          ...(custom_fields_deduped.length > 0 ? { custom_fields: custom_fields_deduped } : {}),
        };

        const snapshot = await fetchContactSnapshotForUpdate(existingId, tenantId, user);
        if (!snapshot) {
          skipped++;
        } else {
          await updateContact(existingId, tenantId, user, payload, {
            skipFetch: true,
            contactSnapshot: snapshot,
            skipActivityLog: true,
          });
          if (primaryPhone) sessionPhoneMap.set(primaryPhone, { id: existingId, type });
          if (validatedTagIds.length > 0) {
            pendingTagMergeIds.push(existingId);
            if (pendingTagMergeIds.length >= IMPORT_TAG_MERGE_CHUNK) await flushPendingTagMerges();
          }
          updated++;
        }
      } else {
        const createPayload = {
          type,
          first_name,
          last_name,
          display_name,
          email,
          source: finalSource,
          ...coreRowFields,
          ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
          ...(campaign_id !== undefined ? { campaign_id } : {}),
          ...(effManagerId !== undefined ? { manager_id: effManagerId } : {}),
          ...(effAssignedUserId !== undefined ? { assigned_user_id: effAssignedUserId } : {}),
          phones,
          custom_fields: custom_fields_deduped,
          created_source,
          ...(validatedTagIds.length > 0 ? { tag_ids: validatedTagIds } : {}),
        };

        pendingImportCreates.push({ primaryPhone, payload: createPayload });
        if (primaryPhone) pendingPhoneKeys.add(primaryPhone);

        if (pendingImportCreates.length >= IMPORT_BULK_CREATE_CHUNK) {
          await flushPendingCreates();
        }
      }
    } catch (e) {
      await flushPendingCreates();
      await flushPendingTagMerges();
      errors.push({
        row: rowIndex,
        error: e?.message || 'Import failed',
      });
    }

    if (
      typeof onProgress === 'function' &&
      (i % importProgressStride === 0 ||
        i === records.length - 1 ||
        records.length <= 10)
    ) {
      await onProgress({ processed: i + 1, total: records.length, step: 'import_rows' });
    }
  }

  await flushPendingCreates();
  await flushPendingTagMerges();

  if (created > 0 || updated > 0) {
    const fnameRaw = String(originalFilename || '').trim();
    const fname = fnameRaw ? fnameRaw.split(/[/\\]/).pop().slice(0, 120) : '';
    const typeLower = String(type || 'lead').toLowerCase();
    const typeLabel = typeLower === 'contact' ? 'contacts' : 'leads';
    const parts = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    const summaryBase = `CSV import (${typeLabel}): ${parts.join(', ')}`;
    const summary = (fname ? `${summaryBase} — ${fname}` : summaryBase).slice(0, 500);
    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'contact',
      event_type: 'contact.import.csv',
      summary,
      payload_json: {
        record_type: typeLower,
        created,
        updated,
        skipped,
        failed: errors.length,
        filename: fname || null,
        created_source: created_source || 'import',
      },
    });
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
  {
    buffer,
    mapping,
    defaultCountryCode = '+91',
    mode = 'skip',
    limit = 12,
    originalFilename = '',
    type: importType = 'lead',
  } = {}
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
  const customFieldDefsById = new Map();
  for (const f of allFields) {
    const nid = normalizeContactImportCustomFieldId(f.id);
    if (nid) customFieldDefsById.set(nid, f);
    byHeader.set(normalizeHeader(f.name), f);
    byHeader.set(normalizeHeader(f.label), f);
  }

  const headerMapping = mapping && typeof mapping === 'object' ? mapping : null;

  const fieldLabelById = new Map();
  for (const f of allFields) {
    const nid = normalizeContactImportCustomFieldId(f.id);
    if (nid) fieldLabelById.set(nid, f.label || f.name);
  }

  const sampleLimit = Math.min(Math.max(1, parseInt(limit, 10) || 12), 50);
  const sampleRows = [];

  const statusCache = new Map();
  const cfDefCache = new Map();
  const previewPeekPhones = [];
  for (let pi = 0; pi < records.length && pi < sampleLimit; pi++) {
    const pr = records[pi] || {};
    const npeek = {};
    for (const [k, v] of Object.entries(pr)) {
      npeek[normalizeHeader(k)] = v;
    }
    previewPeekPhones.push(peekImportPrimaryPhoneE164(npeek, headerMapping, defaultCountryCode));
  }
  const previewPrefetchMap = await prefetchImportExistingByPhones(tenantId, previewPeekPhones, importType);

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
      statusCache,
      cfDefCache,
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
      const ex = previewPrefetchMap.get(resolved.primaryPhone);
      if (ex?.id) {
        duplicate_action = mode === 'skip' ? 'skip' : 'update';
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

