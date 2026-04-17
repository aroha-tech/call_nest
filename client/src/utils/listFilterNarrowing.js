/** Legacy sentinel in saved filters and older code — treat like “no narrowing”. */
export const LEGACY_FILTER_ALL = '__all__';

/** True when this list filter is not narrowing results (show everything). */
export function isNoListFilter(v) {
  return v == null || v === '' || v === LEGACY_FILTER_ALL;
}

/** Map legacy / empty values to canonical empty string for “all”. */
export function normalizeListFilterAll(v) {
  return isNoListFilter(v) ? '' : String(v);
}
