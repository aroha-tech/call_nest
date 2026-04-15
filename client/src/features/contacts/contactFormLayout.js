/** Persisted section order + optional full-width flags for the contact/lead form. */

export const CONTACT_FORM_SECTION_IDS = {
  RECORD: 'record',
  IDENTITY: 'identity',
  LOCATION: 'location',
  NOTES: 'notes',
  STATUS: 'status',
  PHONES: 'phones',
  TAGS: 'tags',
  ASSIGNMENT: 'assignment',
  INDUSTRY: 'industry',
  CUSTOM: 'custom',
};

const ALL_ORDER = [
  CONTACT_FORM_SECTION_IDS.IDENTITY,
  CONTACT_FORM_SECTION_IDS.PHONES,
  CONTACT_FORM_SECTION_IDS.RECORD,
  CONTACT_FORM_SECTION_IDS.TAGS,
  CONTACT_FORM_SECTION_IDS.LOCATION,
  CONTACT_FORM_SECTION_IDS.NOTES,
  CONTACT_FORM_SECTION_IDS.ASSIGNMENT,
  CONTACT_FORM_SECTION_IDS.STATUS,
  CONTACT_FORM_SECTION_IDS.INDUSTRY,
  CONTACT_FORM_SECTION_IDS.CUSTOM,
];

/**
 * Default visual order (row-major in a 2-column grid: left cell, right cell, next row…).
 */
export const DEFAULT_CONTACT_FORM_ORDER = {
  lead: [...ALL_ORDER],
  contact: [...ALL_ORDER],
};

export function createDefaultContactFormLayout(recordType) {
  const order = [...(DEFAULT_CONTACT_FORM_ORDER[recordType] || DEFAULT_CONTACT_FORM_ORDER.lead)];
  return { order, fullWidth: {} };
}

function migrateV1ColumnsToLayout(parsed) {
  const left = Array.isArray(parsed.left) ? parsed.left.map(String) : [];
  const right = Array.isArray(parsed.right) ? parsed.right.map(String) : [];
  const order = [];
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    if (left[i]) order.push(left[i]);
    if (right[i]) order.push(right[i]);
  }
  const seen = new Set();
  const uniq = order.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { order: uniq, fullWidth: {} };
}

function storageKeyV2(recordType) {
  return `callnest.contactForm.sectionLayout.v2.${recordType === 'contact' ? 'contact' : 'lead'}`;
}

/** Legacy key from canvas / left-right layout. */
function storageKeyV1(recordType) {
  return `callnest.contactForm.sectionColumns.v1.${recordType === 'contact' ? 'contact' : 'lead'}`;
}

export function loadContactFormColumns(recordType) {
  const defaults = createDefaultContactFormLayout(recordType);
  try {
    if (typeof localStorage === 'undefined') return defaults;
    const v2 = localStorage.getItem(storageKeyV2(recordType));
    if (v2) {
      const parsed = JSON.parse(v2);
      if (Array.isArray(parsed.order) && parsed.order.length) {
        return {
          order: parsed.order.map(String),
          fullWidth:
            parsed.fullWidth && typeof parsed.fullWidth === 'object' ? { ...parsed.fullWidth } : {},
        };
      }
    }
    const v1 = localStorage.getItem(storageKeyV1(recordType));
    if (v1) {
      const parsed = JSON.parse(v1);
      if (Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
        return migrateV1ColumnsToLayout(parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

export function saveContactFormColumns(recordType, layout) {
  try {
    if (typeof localStorage === 'undefined') return;
    const order = Array.isArray(layout.order) ? layout.order : [];
    const fullWidth = layout.fullWidth && typeof layout.fullWidth === 'object' ? layout.fullWidth : {};
    localStorage.setItem(storageKeyV2(recordType), JSON.stringify({ order, fullWidth }));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Drop unknown ids; remove invisible ids; append newly visible ids in canonical order.
 */
export function reconcileContactFormColumns(prev, visibleSet, recordType) {
  const allowed = new Set(ALL_ORDER);

  const orderIn = Array.isArray(prev?.order) ? prev.order.filter((id) => allowed.has(id) && visibleSet.has(id)) : [];
  const seen = new Set(orderIn);
  const missing = ALL_ORDER.filter((id) => visibleSet.has(id) && allowed.has(id) && !seen.has(id));
  const order = [...orderIn, ...missing];

  const fullWidth = { ...(prev?.fullWidth && typeof prev.fullWidth === 'object' ? prev.fullWidth : {}) };
  for (const id of Object.keys(fullWidth)) {
    if (!visibleSet.has(id) || !allowed.has(id)) delete fullWidth[id];
  }

  return { order, fullWidth };
}
