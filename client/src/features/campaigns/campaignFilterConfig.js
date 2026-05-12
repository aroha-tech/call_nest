/** UI metadata for dynamic campaign filters (must stay aligned with server campaignFilterSql.js). */

export const OPERATOR_LABELS = {
  eq: 'Equals',
  ne: 'Not equal',
  lt: 'Less than',
  gt: 'Greater than',
  lte: 'Less or equal',
  gte: 'Greater or equal',
  contains: 'Contains',
  not_contains: 'Does not contain',
  is_blank: 'Is blank',
  is_not_blank: 'Is not blank',
  in: 'Is any of',
};

/** @type {Array<{ id: string, label: string, operators: string[], valueType: string }>} */
export const CAMPAIGN_FILTER_PROPERTIES = [
  {
    id: 'tag_id',
    label: 'Tag',
    operators: ['in', 'is_blank', 'is_not_blank'],
    valueType: 'contact_tag',
  },
  { id: 'type', label: 'Record type', operators: ['eq', 'ne', 'in'], valueType: 'enum' },
  { id: 'status_id', label: 'Contact status', operators: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'], valueType: 'status' },
  { id: 'source', label: 'Source', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'email', label: 'Email', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'first_name', label: 'First name', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'last_name', label: 'Last name', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'display_name', label: 'Display name', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'primary_phone', label: 'Primary phone', operators: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank'], valueType: 'text' },
  { id: 'manager_id', label: 'Manager', operators: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'], valueType: 'manager' },
  { id: 'assigned_user_id', label: 'Assigned agent', operators: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'], valueType: 'agent' },
  { id: 'campaign_id', label: 'Static campaign', operators: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'], valueType: 'campaign' },
  { id: 'created_at', label: 'Created date', operators: ['eq', 'ne', 'lt', 'gt', 'lte', 'gte', 'is_blank', 'is_not_blank'], valueType: 'datetime' },
];

const RECORD_TYPE_OPTIONS = [
  { value: 'lead', label: 'lead' },
  { value: 'contact', label: 'contact' },
];

export function getPropertyMeta(propertyId) {
  return CAMPAIGN_FILTER_PROPERTIES.find((p) => p.id === propertyId) || CAMPAIGN_FILTER_PROPERTIES[0];
}

export function defaultRule() {
  return { property: 'type', op: 'eq', value: 'lead' };
}

/** Next rule when adding a row: first unused property, with a blank value (no cross-property carry-over). */
export function additionalRule(existingRules) {
  const used = new Set((existingRules || []).map((r) => r?.property).filter(Boolean));
  const nextProp = CAMPAIGN_FILTER_PROPERTIES.find((p) => !used.has(p.id));
  if (!nextProp) return null;
  const [firstOp] = nextProp.operators;
  return coerceRuleForProperty(nextProp.id, { property: '', op: firstOp, value: undefined });
}

export function coerceRuleForProperty(propertyId, prev) {
  const meta = getPropertyMeta(propertyId);
  const switched = !prev?.property || prev.property !== meta.id;

  let op = prev?.op;
  if (!meta.operators.includes(op)) {
    [op] = meta.operators;
  }

  const prevVal = switched ? undefined : prev?.value;

  let value;
  if (op === 'in') {
    if (meta.valueType === 'enum') {
      value = Array.isArray(prevVal) ? prevVal : prevVal != null && prevVal !== '' ? [prevVal] : [];
    } else if (meta.valueType === 'contact_tag') {
      value = Array.isArray(prevVal) ? prevVal : prevVal != null && prevVal !== '' ? [prevVal] : [];
    } else {
      value = Array.isArray(prevVal) ? prevVal : prevVal != null && prevVal !== '' ? [prevVal] : [];
    }
  } else if (meta.valueType === 'datetime') {
    value = typeof prevVal === 'string' ? prevVal : '';
  } else if (meta.valueType === 'contact_tag') {
    value = null;
  } else {
    value = Array.isArray(prevVal) ? (prevVal[0] != null ? String(prevVal[0]) : '') : prevVal != null ? String(prevVal) : '';
  }
  return { property: meta.id, op, value };
}

export function getEnumOptions(propertyId) {
  if (propertyId === 'type') return RECORD_TYPE_OPTIONS;
  return [];
}

export function ruleNeedsValue(op) {
  return op !== 'is_blank' && op !== 'is_not_blank';
}

/** Strict enough for filter eq/ne; not full RFC parser. */
export function isValidEmailForFilter(str) {
  const s = String(str || '').trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function validateRulesForSave(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return 'Add at least one filter rule.';
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const meta = getPropertyMeta(r.property);
    if (!meta.operators.includes(r.op)) return `Row ${i + 1}: invalid operator for this property.`;
    if (!ruleNeedsValue(r.op)) continue;
    if (r.op === 'in') {
      if (!Array.isArray(r.value) || r.value.length === 0) {
        return `Row ${i + 1}: choose at least one value for "Is any of".`;
      }
    } else if (meta.valueType === 'datetime') {
      if (!String(r.value || '').trim()) return `Row ${i + 1}: date/time is required.`;
    } else if (r.value === undefined || r.value === null || String(r.value).trim() === '') {
      return `Row ${i + 1}: value is required for this operator.`;
    } else if (r.property === 'email' && (r.op === 'eq' || r.op === 'ne') && !isValidEmailForFilter(r.value)) {
      return `Row ${i + 1}: enter a valid email address (e.g. name@example.com).`;
    }
  }
  return null;
}
