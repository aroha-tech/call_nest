/** Shared column / property filter operators (contacts, call history, dial sessions, etc.). */

export const FILTER_VALUE_TYPE = {
  TEXT: 'text',
  DATE: 'date',
  NUMBER: 'number',
};

export const TEXT_FILTER_OPS = ['contains', 'not_contains', 'starts_with', 'ends_with', 'empty', 'not_empty'];

export const COMPARABLE_FILTER_OPS = ['eq', 'lt', 'lte', 'gt', 'gte', 'between', 'empty', 'not_empty'];

export const OPERATOR_LABELS = {
  eq: 'Equals',
  lt: 'Less than',
  lte: 'Less than or equal',
  gt: 'Greater than',
  gte: 'Greater than or equal',
  between: 'Between',
  empty: 'Is blank',
  not_empty: 'Is not blank',
  contains: 'Contains',
  not_contains: 'Does not contain',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  none: 'No filter on this column',
};

/** Short symbols shown before labels in operator dropdowns (matches product spec). */
export const OPERATOR_SYMBOLS = {
  eq: '=',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  between: '↔',
  empty: '○',
  not_empty: '●',
  contains: '~',
  not_contains: '≁',
  starts_with: 'A…',
  ends_with: '…Z',
};

export function formatOperatorLabel(op) {
  const sym = OPERATOR_SYMBOLS[op];
  const text = OPERATOR_LABELS[op] || op;
  return sym ? `${sym}  ${text}` : text;
}

export function getOperatorOptionsForValueType(valueType) {
  const ops = valueType === FILTER_VALUE_TYPE.TEXT ? TEXT_FILTER_OPS : COMPARABLE_FILTER_OPS;
  return ops.map((value) => ({ value, label: formatOperatorLabel(value) }));
}

export function defaultOperatorForValueType(valueType) {
  return valueType === FILTER_VALUE_TYPE.TEXT ? 'contains' : 'eq';
}

export function ruleNeedsFilterValue(op) {
  return op && op !== 'empty' && op !== 'not_empty' && op !== 'none';
}

export function ruleNeedsSecondFilterValue(op) {
  return op === 'between';
}

/**
 * @param {string} fieldKey
 * @param {{ industryFieldType?: string, customFieldType?: string }} [meta]
 */
export function getColumnFilterValueType(fieldKey, meta = {}) {
  const ind = meta.industryFieldType || meta.customFieldType;
  if (ind === 'date') return FILTER_VALUE_TYPE.DATE;
  if (ind === 'number') return FILTER_VALUE_TYPE.NUMBER;

  const key = String(fieldKey || '').toLowerCase();
  if (key === 'date_of_birth' || key.endsWith('_at') || key.endsWith('_date')) {
    return FILTER_VALUE_TYPE.DATE;
  }
  if (
    key === 'duration_sec' ||
    key.endsWith('_count') ||
    key.startsWith('num_') ||
    key.includes('_number') ||
    key === 'call_count_total'
  ) {
    return FILTER_VALUE_TYPE.NUMBER;
  }
  return FILTER_VALUE_TYPE.TEXT;
}

/** Coerce operator when field type changes (e.g. text → date). */
export function coerceOperatorForValueType(op, valueType) {
  const allowed =
    valueType === FILTER_VALUE_TYPE.TEXT ? TEXT_FILTER_OPS : COMPARABLE_FILTER_OPS;
  if (allowed.includes(op)) return op;
  return defaultOperatorForValueType(valueType);
}
