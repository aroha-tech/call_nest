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

export function coerceRuleForProperty(propertyId, prev) {
  const meta = getPropertyMeta(propertyId);
  let op = prev?.op;
  if (!meta.operators.includes(op)) {
    [op] = meta.operators;
  }
  let value = prev?.value;
  if (op === 'in') {
    if (meta.valueType === 'enum') {
      value = Array.isArray(value) ? value : value ? [value] : ['lead'];
    } else if (meta.valueType === 'contact_tag') {
      value = Array.isArray(value) ? value : value ? [value] : [];
    } else {
      value = Array.isArray(value) ? value : value ? [value] : [];
    }
  } else if (meta.valueType === 'datetime') {
    value = typeof value === 'string' ? value : '';
  } else if (meta.valueType === 'contact_tag') {
    value = null;
  } else {
    value = Array.isArray(value) ? (value[0] != null ? String(value[0]) : '') : value != null ? String(value) : '';
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
    }
  }
  return null;
}
