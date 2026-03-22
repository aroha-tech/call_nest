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

/**
 * @param {string} normalizedCol - already normalizeImportHeader(columnName)
 * @param {{ id: number, name: string, label: string }[]} customFields
 */
export function suggestImportColumnTarget(normalizedCol, customFields = []) {
  const cf =
    customFields.find((f) => normalizeImportHeader(f.name) === normalizedCol) ||
    customFields.find((f) => normalizeImportHeader(f.label) === normalizedCol);
  if (cf) return `custom:${cf.id}`;

  const direct = PREVIEW_SUGGEST_MAP.get(normalizedCol);
  if (direct) return direct;

  return 'ignore';
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
