/** Persisted section order + optional full-width flags for the contact/lead form. */

export const CONTACT_FORM_SECTION_IDS = {
  RECORD: 'record',
  IDENTITY: 'identity',
  LOCATION: 'location',
  /** Tags, contact notes, and status in one card (replaces legacy `tags` / `notes` / `status` sections). */
  TAGS_NOTES_STATUS: 'tags_notes_status',
  PHONES: 'phones',
  ASSIGNMENT: 'assignment',
  INDUSTRY: 'industry',
  CUSTOM: 'custom',
};

const LEGACY_TAGS_NOTES_STATUS = new Set(['tags', 'notes', 'status']);

/** Normalize persisted order: collapse legacy trio into one section at the earliest of their positions. */
export function normalizeContactFormSectionOrder(order) {
  if (!Array.isArray(order)) return [];
  const COMBINED = CONTACT_FORM_SECTION_IDS.TAGS_NOTES_STATUS;
  let minI = -1;
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (id === COMBINED || LEGACY_TAGS_NOTES_STATUS.has(id)) {
      minI = minI === -1 ? i : Math.min(minI, i);
    }
  }
  const filtered = order.filter((id) => id !== COMBINED && !LEGACY_TAGS_NOTES_STATUS.has(id));
  if (minI === -1) return filtered;
  const before = order.slice(0, minI).filter((id) => id !== COMBINED && !LEGACY_TAGS_NOTES_STATUS.has(id)).length;
  const next = [...filtered];
  next.splice(before, 0, COMBINED);
  return next;
}

export function normalizeContactFormFullWidth(fullWidth) {
  const fw = fullWidth && typeof fullWidth === 'object' ? { ...fullWidth } : {};
  const COMBINED = CONTACT_FORM_SECTION_IDS.TAGS_NOTES_STATUS;
  if ('notes' in fw || 'status' in fw || 'tags' in fw) {
    fw[COMBINED] = !!(fw[COMBINED] || fw.notes || fw.status || fw.tags);
    delete fw.notes;
    delete fw.status;
    delete fw.tags;
  }
  return fw;
}

const ALL_ORDER = [
  CONTACT_FORM_SECTION_IDS.IDENTITY,
  CONTACT_FORM_SECTION_IDS.PHONES,
  CONTACT_FORM_SECTION_IDS.RECORD,
  CONTACT_FORM_SECTION_IDS.TAGS_NOTES_STATUS,
  CONTACT_FORM_SECTION_IDS.LOCATION,
  CONTACT_FORM_SECTION_IDS.ASSIGNMENT,
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
  return { order: normalizeContactFormSectionOrder(uniq), fullWidth: {} };
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
          order: normalizeContactFormSectionOrder(parsed.order.map(String)),
          fullWidth: normalizeContactFormFullWidth(
            parsed.fullWidth && typeof parsed.fullWidth === 'object' ? parsed.fullWidth : {}
          ),
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

  const normalizedOrder = normalizeContactFormSectionOrder(Array.isArray(prev?.order) ? prev.order : []);
  const normalizedFw = normalizeContactFormFullWidth(prev?.fullWidth);
  const orderIn = normalizedOrder.filter((id) => allowed.has(id) && visibleSet.has(id));
  const seen = new Set(orderIn);
  const missing = ALL_ORDER.filter((id) => visibleSet.has(id) && allowed.has(id) && !seen.has(id));
  const order = [...orderIn, ...missing];

  const fullWidth = { ...normalizedFw };
  for (const id of Object.keys(fullWidth)) {
    if (!visibleSet.has(id) || !allowed.has(id)) delete fullWidth[id];
  }

  return { order, fullWidth };
}
