/**
 * Provider-agnostic CSV column aliases for Indian lead exports
 * (Meta/Google/IndiaMART/JustDial/99acres/MagicBricks/NoBroker/Sulekha/generic Excel).
 *
 * Headers are matched after normalizeHeader(): lowercase, spaces -> underscores.
 */

export function normalizeImportHeader(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Try each alias key on the normalized row object; return first non-empty value */
export function pickFirstByAliasKeys(normalizedRow, aliasKeys) {
  for (const key of aliasKeys) {
    const nk = normalizeImportHeader(key);
    const v = normalizedRow[nk];
    if (v !== undefined && v !== null && String(v).trim()) return v;
  }
  return null;
}

/**
 * Same as pickFirstByAliasKeys but skips columns the user set to `-- unmapped --` ({ target: 'ignore' }).
 * `headerMapping` keys are normalized column names (same as row keys).
 */
export function pickFirstByAliasKeysRespectingIgnore(normalizedRow, aliasKeys, headerMapping) {
  if (!aliasKeys?.length) return null;
  for (const key of aliasKeys) {
    const nk = normalizeImportHeader(key);
    const v = normalizedRow[nk];
    if (v === undefined || v === null || !String(v).trim()) continue;
    if (headerMapping && headerMapping[nk]?.target === 'ignore') continue;
    return v;
  }
  return null;
}

export function splitFullNameToFirstLast(raw) {
  const s = String(raw || '').trim();
  if (!s) return { first_name: null, last_name: null };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

// --- Normalized header keys (already snake_case) we look for on the row ---

export const FIRST_NAME_KEYS = [
  'first_name',
  'firstname',
  'first',
  'f_name',
  'fname',
  'given_name',
  'customer_first_name',
  'cust_first_name',
  'lead_first_name',
  'applicant_first_name',
];

export const LAST_NAME_KEYS = [
  'last_name',
  'lastname',
  'last',
  'surname',
  'l_name',
  'lname',
  'customer_last_name',
  'cust_last_name',
  'lead_last_name',
  'applicant_last_name',
];

/** Single column with full name (split into first + last when needed) */
export const FULL_NAME_KEYS = [
  'full_name',
  'fullname',
  'name',
  'customer_name',
  'lead_name',
  'contact_name',
  'contact_person',
  'enquiry_by',
  'enquiry_name',
  'enquirer_name',
  'applicant_name',
  'person_name',
  'lead_full_name',
  'buyer_name',
  'client_name',
];

export const DISPLAY_NAME_KEYS = ['display_name', 'displayname', 'lead_display_name', 'title'];

export const EMAIL_KEYS = [
  'email',
  'email_id',
  'email_address',
  'mail_id',
  'e_mail',
  'mail',
  'e_mail_id',
];

/** Primary / mobile / WhatsApp — first match wins for primary phone */
/** Order matters: first match becomes primary when using pickFirstByAliasKeys */
export const PRIMARY_PHONE_KEYS = [
  'primary_phone',
  'phone',
  'mobile',
  'mobile_phone',
  'mobile_no',
  'mobileno',
  'contact_number',
  'contact_no',
  'phone_number',
  'phone_no',
  'cell',
  'cellular',
  'mobile_number',
  'whatsapp',
  'whatsapp_number',
  'wa_number',
  'lead_phone',
  'primary_contact',
  'telephone',
  'tel',
  'alternate_mobile',
  'alt_mobile',
  'alternate_phone',
  'secondary_phone',
  'phone_1',
];

/** Additional phone-like columns (secondary / office) — imported as extra numbers when distinct */
export const EXTRA_PHONE_KEYS = [
  'landline',
  'office_phone',
  'work_phone',
  'phone_2',
  'phone2',
  'alternate_number',
  'alternate_phone_2',
  'secondary_mobile',
  'father_mobile',
  'guardian_phone',
];

/**
 * Build contact_phones[] from a normalized CSV row (Indian portal exports).
 * @param {Record<string,string>} normalized
 * @param {string} defaultCountryCode
 * @param {(raw: string, cc: string) => string | null} toE164PhoneFn
 */
export function buildPhonesFromCsvRow(normalized, defaultCountryCode, toE164PhoneFn) {
  const phones = [];
  const seenDigits = new Set();

  const add = (raw, label, forcePrimary) => {
    const e164 = toE164PhoneFn(raw, defaultCountryCode);
    if (!e164) return;
    if (seenDigits.has(e164)) return;
    seenDigits.add(e164);
    const lab = String(label || 'mobile')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .slice(0, 80);
    phones.push({ phone: e164, label: lab || 'mobile', is_primary: forcePrimary ? 1 : 0 });
  };

  const primaryRaw = pickFirstByAliasKeys(normalized, PRIMARY_PHONE_KEYS);
  if (primaryRaw) add(primaryRaw, 'mobile', true);

  for (const key of EXTRA_PHONE_KEYS) {
    const v = normalized[key];
    if (v !== undefined && v !== null && String(v).trim()) add(v, key, false);
  }

  for (const [k, v] of Object.entries(normalized)) {
    const m = k.match(/^phone[:_](.+)$/i);
    if (!m) continue;
    const label = String(m[1] || '').trim().toLowerCase() || 'mobile';
    add(v, label, false);
  }

  if (phones.length === 0) return [];

  let primaryIdx = phones.findIndex((p) => p.is_primary === 1);
  if (primaryIdx === -1) primaryIdx = 0;
  phones.forEach((p, idx) => {
    p.is_primary = idx === primaryIdx ? 1 : 0;
  });

  const seenLabels = new Set();
  phones.forEach((p, idx) => {
    let base = String(p.label || 'mobile').toLowerCase();
    if (seenLabels.has(base)) {
      p.label = `${base}_${idx + 1}`;
    }
    seenLabels.add(String(p.label).toLowerCase());
  });

  return phones;
}

export const SOURCE_KEYS = [
  'source',
  'lead_source',
  'leadsource',
  'enquiry_source',
  'campaign',
  'campaign_name',
  'utm_source',
  'medium',
  'utm_medium',
  'channel',
  'lead_channel',
  'advertisement',
  'ad_name',
  'adset_name',
  'placement',
];

export const STATUS_KEYS = [
  'lead_status',
  'leadstatus',
  'status',
  'disposition',
  'stage',
  'lead_stage',
  'contact_status',
  'sub_status',
];

export const CITY_KEYS = [
  'city',
  'location',
  'area',
  'locality',
  'preferred_location',
  'city_name',
  'district',
  'town',
];

export const STATE_KEYS = [
  'state',
  'state_name',
  'region',
  'province',
  'st',
];

export const PROPERTY_KEYS = [
  'property',
  'property_type',
  'property_interest',
  'bhk',
  'configuration',
  'product',
  'product_name',
  'unit_type',
  'apartment_type',
  'flat_type',
  'inventory',
];

export const BUDGET_KEYS = [
  'budget',
  'budget_range',
  'price_range',
  'expected_budget',
  'price_budget',
  'price',
];

/** Postal / PIN (Indian + generic exports) */
export const PIN_CODE_KEYS = [
  'pin_code',
  'pincode',
  'postal_code',
  'postcode',
  'zip',
  'zip_code',
  'postal',
];

/** Product or service interest (often JSON-like in vendor exports) */
export const SERVICES_KEYS = [
  'services',
  'service',
  'services_interested',
  'interested_services',
  'product_services',
  'service_type',
];

/** Call / lead notes from dialer or CRM exports */
export const REMARK_KEYS = [
  'remark',
  'remarks',
  'notes',
  'note',
  'comments',
  'comment',
  'call_notes',
  'telephony_notes',
];

/** Separate from lead status — call outcome labels (e.g. "Call Not Answered") */
export const REMARK_STATUS_KEYS = [
  'remark_status',
  'call_status_detail',
  'call_disposition_label',
  'telephony_status',
  'dialer_status',
];

export const ASSIGN_DATE_KEYS = [
  'assign_date',
  'assigned_date',
  'assignment_date',
  'date_assigned',
];

export const LEAD_DATE_KEYS = [
  'lead_date',
  'enquiry_date',
  'inquiry_date',
  'lead_created_date',
  'created_on',
  'enquiry_on',
];

export const LEAD_TIMESTAMP_KEYS = [
  'time_stamp',
  'timestamp',
  'time_stamp_date',
  'last_updated',
  'updated_at',
  'modified_at',
];

/** Assignment flag / owner label from exports (e.g. "Assigned") */
export const ASSIGN_STATUS_KEYS = ['assign', 'assignment', 'lead_assign', 'assigned_to_label', 'allocation'];

export const COUNTRY_KEYS = [
  'country',
  'country_name',
  'nation',
  'country_code',
];

export const ADDRESS_KEYS = [
  'address',
  'street',
  'street_address',
  'address_line_1',
  'address_line1',
  'full_address',
  'residential_address',
  'communication_address',
  'mailing_address',
  'billing_address',
];

export const ADDRESS_LINE2_KEYS = [
  'address_line_2',
  'address_line2',
  'address2',
  'landmark',
  'suite',
  'unit',
  'flat_no',
  'apartment',
  'floor',
];

export const COMPANY_KEYS = [
  'company',
  'company_name',
  'organization',
  'organisation',
  'business_name',
  'employer',
  'firm',
  'org',
];

/** Avoid "title" alone — clashes with display_name / person title in some sheets */
export const JOB_TITLE_KEYS = [
  'job_title',
  'designation',
  'position',
  'role',
  'occupation',
  'job_role',
];

export const WEBSITE_KEYS = [
  'website',
  'web',
  'company_website',
  'web_site',
  'site_url',
  'linkedin',
  'linkedin_url',
];

export const INDUSTRY_KEYS = [
  'industry',
  'sector',
  'vertical',
  'business_type',
  'line_of_business',
];

export const DATE_OF_BIRTH_KEYS = ['date_of_birth', 'dob', 'birth_date', 'birthday'];

/** India / GST-style business id (stored as text) */
export const TAX_ID_KEYS = [
  'gstin',
  'gst',
  'gst_number',
  'tax_id',
  'vat_id',
  'pan',
  'pan_number',
];

/** Map normalized column name -> suggested UI target (matches ContactImportPage) */
const PREVIEW_SUGGEST_MAP = new Map();

function registerSuggestions(target, keys) {
  for (const k of keys) {
    PREVIEW_SUGGEST_MAP.set(k, target);
  }
}

registerSuggestions('first_name', FIRST_NAME_KEYS);
registerSuggestions('last_name', LAST_NAME_KEYS);
registerSuggestions('full_name', FULL_NAME_KEYS);
registerSuggestions('email', EMAIL_KEYS);
registerSuggestions('primary_phone', PRIMARY_PHONE_KEYS);
registerSuggestions('source', SOURCE_KEYS);
registerSuggestions('status', STATUS_KEYS);
registerSuggestions('city', CITY_KEYS);
registerSuggestions('state', STATE_KEYS);
registerSuggestions('property', PROPERTY_KEYS);
registerSuggestions('budget', BUDGET_KEYS);
registerSuggestions('pin_code', PIN_CODE_KEYS);
registerSuggestions('services', SERVICES_KEYS);
registerSuggestions('remark', REMARK_KEYS);
registerSuggestions('remark_status', REMARK_STATUS_KEYS);
registerSuggestions('assign_date', ASSIGN_DATE_KEYS);
registerSuggestions('lead_date', LEAD_DATE_KEYS);
registerSuggestions('lead_timestamp', LEAD_TIMESTAMP_KEYS);
registerSuggestions('assign_status', ASSIGN_STATUS_KEYS);
registerSuggestions('country', COUNTRY_KEYS);
registerSuggestions('address', ADDRESS_KEYS);
registerSuggestions('address_line_2', ADDRESS_LINE2_KEYS);
registerSuggestions('company', COMPANY_KEYS);
registerSuggestions('job_title', JOB_TITLE_KEYS);
registerSuggestions('website', WEBSITE_KEYS);
registerSuggestions('industry', INDUSTRY_KEYS);
registerSuggestions('date_of_birth', DATE_OF_BIRTH_KEYS);
registerSuggestions('tax_id', TAX_ID_KEYS);

/**
 * Legacy import keys that map to auto-created custom fields (see contactsService PROVIDER_COLUMNS_AUTO_CF).
 * These are NOT core `contacts` columns — UI lists tenant custom fields instead; suggestions resolve to
 * `custom:id` when a field with this name exists, else ignore (user creates via "new custom field").
 */
export const LEGACY_PROVIDER_IMPORT_KEYS = new Set([
  'property',
  'budget',
  'services',
  'remark',
  'remark_status',
  'assign_date',
  'lead_date',
  'lead_timestamp',
  'assign_status',
]);

/**
 * Core `contacts` / lead columns the importer can map to (single source for API + UI).
 * Must match handling in contactsService `resolveCsvRowToImportPayload`.
 */
export const IMPORT_CORE_FIELD_OPTIONS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'full_name', label: 'Full name (split to first / last)' },
  { key: 'display_name', label: 'Display name' },
  { key: 'email', label: 'Email' },
  { key: 'primary_phone', label: 'Primary phone' },
  { key: 'source', label: 'Lead source' },
  { key: 'status', label: 'Lead status' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'address', label: 'Address (street)' },
  { key: 'address_line_2', label: 'Address line 2' },
  { key: 'pin_code', label: 'Pin code' },
  { key: 'company', label: 'Company' },
  { key: 'job_title', label: 'Job title' },
  { key: 'website', label: 'Website' },
  { key: 'industry', label: 'Industry' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'tax_id', label: 'Tax ID (GST / PAN / etc.)' },
];

export const IMPORT_CORE_TARGET_KEYS = new Set(IMPORT_CORE_FIELD_OPTIONS.map((o) => o.key));

/**
 * @param {string} normalizedCol - already normalizeImportHeader(columnName)
 * @param {{ id: number, name: string, label: string }[]} customFields
 * 1) Core contact columns win when the file header matches known aliases (city, email, …).
 * 2) Otherwise match tenant custom fields by name/label.
 * 3) Legacy provider keys (property, budget, …) resolve to an existing custom field by canonical name, else ignore.
 */
export function suggestImportColumnTarget(normalizedCol, customFields = []) {
  const fromAlias = PREVIEW_SUGGEST_MAP.get(normalizedCol);

  if (fromAlias && IMPORT_CORE_TARGET_KEYS.has(fromAlias)) {
    return fromAlias;
  }

  const cfByHeader =
    customFields.find((f) => normalizeImportHeader(f.name) === normalizedCol) ||
    customFields.find((f) => normalizeImportHeader(f.label) === normalizedCol);
  if (cfByHeader) return `custom:${cfByHeader.id}`;

  if (fromAlias && LEGACY_PROVIDER_IMPORT_KEYS.has(fromAlias)) {
    const cfByLegacyName = customFields.find((f) => normalizeImportHeader(f.name) === fromAlias);
    if (cfByLegacyName) return `custom:${cfByLegacyName.id}`;
    return 'ignore';
  }

  return 'ignore';
}

/**
 * Best-effort type for a new tenant custom field from normalized header + sample cells.
 * Used by import preview so the UI can default "Value type" near the right choice.
 * @param {string} normalizedCol
 * @param {string[]} samples
 * @returns {'text'|'number'|'date'|'boolean'|'select'|'multiselect'|'multiselect_dropdown'}
 */
export function suggestNewCustomFieldType(normalizedCol, samples = []) {
  const h = String(normalizedCol || '').toLowerCase();

  if (
    /(^|_)(date|dob|birth|birthday|anniversary|created|updated|timestamp|time)(_|$)/.test(h) ||
    /\bdate_of\b/.test(h)
  ) {
    return 'date';
  }
  if (
    /\b(amount|price|salary|revenue|budget|cost|fee|qty|quantity|count|score|percent|rating|weight|distance|age)\b/.test(
      h
    ) ||
    /_(amt|amount|price|qty|count|num|number)$/.test(h)
  ) {
    return 'number';
  }
  if (/\b(is_|has_|active|enabled|verified|subscribe)\b/.test(h) || /^is_/.test(h)) {
    return 'boolean';
  }

  const vals = (samples || []).map((s) => String(s ?? '').trim()).filter((s) => s.length > 0);
  if (vals.length === 0) return 'text';

  const boolRe = /^(yes|no|y|n|true|false|0|1)$/i;
  if (vals.every((s) => boolRe.test(s))) return 'boolean';

  const stripNum = (s) => s.replace(/[,\s₹$€£]/g, '');
  let numLike = 0;
  for (const s of vals.slice(0, 20)) {
    const t = stripNum(s);
    if (t !== '' && !Number.isNaN(Number(t)) && /^-?\d/.test(t)) numLike++;
  }
  if (numLike >= Math.ceil(vals.length * 0.85) && vals.length >= 2) return 'number';

  const dateLike = (s) => {
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s)) return true;
    const d = Date.parse(s);
    return !Number.isNaN(d) && s.length >= 6;
  };
  const dCount = vals.filter(dateLike).length;
  if (dCount >= Math.ceil(vals.length * 0.7) && vals.length >= 2) return 'date';

  return 'text';
}

/**
 * Fill missing lead fields from provider-style columns (when user did not map manually).
 * @returns {{ first_name, last_name, email, display_name, full_name_raw }}
 */
export function extractNamesAndEmailFromNormalizedRow(normalized) {
  let first_name = pickFirstByAliasKeys(normalized, FIRST_NAME_KEYS);
  let last_name = pickFirstByAliasKeys(normalized, LAST_NAME_KEYS);
  const email = pickFirstByAliasKeys(normalized, EMAIL_KEYS);
  const full_raw = pickFirstByAliasKeys(normalized, FULL_NAME_KEYS);

  if ((!first_name || !last_name) && full_raw) {
    const sp = splitFullNameToFirstLast(full_raw);
    if (!first_name) first_name = sp.first_name;
    if (!last_name) last_name = sp.last_name;
  }

  let display_name =
    pickFirstByAliasKeys(normalized, DISPLAY_NAME_KEYS) ||
    [first_name, last_name].filter(Boolean).join(' ').trim() ||
    email ||
    full_raw ||
    null;

  return { first_name, last_name, email, display_name, full_name_raw: full_raw };
}
