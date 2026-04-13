/** Persisted left/right column order for contact & lead create/edit (and view) layouts. */

export const CONTACT_FORM_SECTION_IDS = {
  RECORD: 'record',
  IDENTITY: 'identity',
  LOCATION: 'location',
  STATUS: 'status',
  PHONES: 'phones',
  TAGS: 'tags',
  ASSIGNMENT: 'assignment',
  INDUSTRY: 'industry',
  CUSTOM: 'custom',
};

const ALL_ORDER = [
  CONTACT_FORM_SECTION_IDS.RECORD,
  CONTACT_FORM_SECTION_IDS.IDENTITY,
  CONTACT_FORM_SECTION_IDS.LOCATION,
  CONTACT_FORM_SECTION_IDS.STATUS,
  CONTACT_FORM_SECTION_IDS.PHONES,
  CONTACT_FORM_SECTION_IDS.TAGS,
  CONTACT_FORM_SECTION_IDS.ASSIGNMENT,
  CONTACT_FORM_SECTION_IDS.INDUSTRY,
  CONTACT_FORM_SECTION_IDS.CUSTOM,
];

export const DEFAULT_CONTACT_FORM_COLUMNS = {
  lead: {
    left: [
      CONTACT_FORM_SECTION_IDS.RECORD,
      CONTACT_FORM_SECTION_IDS.IDENTITY,
      CONTACT_FORM_SECTION_IDS.LOCATION,
      CONTACT_FORM_SECTION_IDS.STATUS,
    ],
    right: [
      CONTACT_FORM_SECTION_IDS.PHONES,
      CONTACT_FORM_SECTION_IDS.TAGS,
      CONTACT_FORM_SECTION_IDS.ASSIGNMENT,
      CONTACT_FORM_SECTION_IDS.INDUSTRY,
      CONTACT_FORM_SECTION_IDS.CUSTOM,
    ],
  },
  contact: {
    left: [
      CONTACT_FORM_SECTION_IDS.RECORD,
      CONTACT_FORM_SECTION_IDS.IDENTITY,
      CONTACT_FORM_SECTION_IDS.LOCATION,
      CONTACT_FORM_SECTION_IDS.STATUS,
    ],
    right: [
      CONTACT_FORM_SECTION_IDS.PHONES,
      CONTACT_FORM_SECTION_IDS.TAGS,
      CONTACT_FORM_SECTION_IDS.ASSIGNMENT,
      CONTACT_FORM_SECTION_IDS.INDUSTRY,
      CONTACT_FORM_SECTION_IDS.CUSTOM,
    ],
  },
};

function storageKey(recordType) {
  return `callnest.contactForm.sectionColumns.v1.${recordType === 'contact' ? 'contact' : 'lead'}`;
}

export function loadContactFormColumns(recordType) {
  const key = storageKey(recordType);
  const defaults = DEFAULT_CONTACT_FORM_COLUMNS[recordType] || DEFAULT_CONTACT_FORM_COLUMNS.lead;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!raw) {
      return { left: [...defaults.left], right: [...defaults.right] };
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.left) || !Array.isArray(parsed.right)) {
      return { left: [...defaults.left], right: [...defaults.right] };
    }
    return { left: parsed.left.map(String), right: parsed.right.map(String) };
  } catch {
    return { left: [...defaults.left], right: [...defaults.right] };
  }
}

export function saveContactFormColumns(recordType, columns) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      storageKey(recordType),
      JSON.stringify({
        left: columns.left,
        right: columns.right,
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Drop unknown ids; remove invisible ids; append newly visible ids using default column placement.
 */
export function reconcileContactFormColumns(prev, visibleSet, recordType) {
  const def = DEFAULT_CONTACT_FORM_COLUMNS[recordType] || DEFAULT_CONTACT_FORM_COLUMNS.lead;
  const allowed = new Set(ALL_ORDER);

  let left = (prev.left || []).filter((id) => allowed.has(id) && visibleSet.has(id));
  let right = (prev.right || []).filter((id) => allowed.has(id) && visibleSet.has(id));
  const seen = new Set([...left, ...right]);
  const missing = ALL_ORDER.filter((id) => visibleSet.has(id) && !seen.has(id));

  for (const id of missing) {
    if (def.left.includes(id)) left.push(id);
    else right.push(id);
  }

  const uniq = (arr) => {
    const s = new Set();
    return arr.filter((id) => {
      if (s.has(id)) return false;
      s.add(id);
      return true;
    });
  };
  left = uniq(left);
  right = uniq(right);
  return { left, right };
}
