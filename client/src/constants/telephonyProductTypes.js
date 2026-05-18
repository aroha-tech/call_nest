/** Three separate telephony commercial products (plan_category in API/DB). */

export const PLAN_CATEGORY = {
  SUBSCRIPTION: 'tenant_billing',
  CREDIT_TOP_UP: 'credit_purchase',
  SEAT_ADD_ON: 'seat_purchase',
};

export const PLAN_SEGMENT = {
  [PLAN_CATEGORY.SUBSCRIPTION]: 'subscription',
  [PLAN_CATEGORY.CREDIT_TOP_UP]: 'top-up',
  [PLAN_CATEGORY.SEAT_ADD_ON]: 'seat-plans',
};

export const SEGMENT_TO_CATEGORY = {
  subscription: PLAN_CATEGORY.SUBSCRIPTION,
  'top-up': PLAN_CATEGORY.CREDIT_TOP_UP,
  'seat-plans': PLAN_CATEGORY.SEAT_ADD_ON,
};

export const CATEGORY_TO_SEGMENT = Object.fromEntries(
  Object.entries(SEGMENT_TO_CATEGORY).map(([seg, cat]) => [cat, seg])
);

export const PRODUCT_COPY = {
  [PLAN_CATEGORY.SUBSCRIPTION]: {
    title: 'Subscription plans',
    shortTitle: 'Subscription',
    description:
      'Main workspace plan: CRM + telephony + role access (admins, managers, agents) + optional unlimited-calling channels. Billed monthly, quarterly, 6-month, or yearly.',
  },
  [PLAN_CATEGORY.CREDIT_TOP_UP]: {
    title: 'Credit top-up packs',
    shortTitle: 'Credit top-up',
    description:
      'One-time wallet credit purchase only. No subscription period — tenants buy extra call credits when they need more balance.',
  },
  [PLAN_CATEGORY.SEAT_ADD_ON]: {
    title: 'Seat & channel add-ons',
    shortTitle: 'Seat add-ons',
    description:
      'Per-seat purchases when tenants need more admins, managers, or agents. Optional unlimited-calling channel per seat at a different price.',
  },
};

const REORDER_HELP =
  'Drag rows by the handle to set display order on the website and tenant billing page. Clear search first. Reorder works when every plan for the current filters is visible in the table (up to 100 plans, first page).';

/** Shown via the info ( ! ) icon beside each plan-type section title. */
export const PLAN_SECTION_HELP = {
  [PLAN_CATEGORY.SUBSCRIPTION]: `${PRODUCT_COPY[PLAN_CATEGORY.SUBSCRIPTION].description}\n\n${REORDER_HELP} You can reorder within a billing-type filter when all matching plans are shown.`,
  [PLAN_CATEGORY.CREDIT_TOP_UP]: `${PRODUCT_COPY[PLAN_CATEGORY.CREDIT_TOP_UP].description}\n\n${REORDER_HELP}`,
  [PLAN_CATEGORY.SEAT_ADD_ON]: `${PRODUCT_COPY[PLAN_CATEGORY.SEAT_ADD_ON].description}\n\n${REORDER_HELP}`,
};

export const TENANT_PREVIEW_SECTION_HELP =
  'Shows how tenants see plans on Plans & billing. Turn on the preview toggle below to load the live catalog. Each tab’s preview shows only that product type; use the Tenant preview tab for the full combined catalog.';

export const PLAN_PREVIEW_TAB_HELP = {
  [PLAN_CATEGORY.SUBSCRIPTION]: `${TENANT_PREVIEW_SECTION_HELP} This preview lists subscription plans only (display order matches the table above).`,
  [PLAN_CATEGORY.CREDIT_TOP_UP]: `${TENANT_PREVIEW_SECTION_HELP} This preview lists credit top-up packs only.`,
  [PLAN_CATEGORY.SEAT_ADD_ON]: `${TENANT_PREVIEW_SECTION_HELP} This preview lists seat and channel add-ons only.`,
};

export const TENANT_CATALOG_PREVIEW_HELP =
  'Complete view as tenants see on Plans & billing: subscription bundles, credit top-up packs, and seat add-ons together. Turn on the preview toggle to load all active plans.';

export const SEAT_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
];
