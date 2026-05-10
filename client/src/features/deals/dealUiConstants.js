/** Default currency for new pipelines, deals, and display fallbacks. */
export const DEFAULT_DEAL_CURRENCY = 'INR';

/** @type {{ value: string, label: string }[]} */
export const DEAL_CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
];

/**
 * Default pipeline stages matching the product reference UI.
 * Open-stage % values (10 / 25 / 50 / 75) do not sum to 100 — use pipeline probability_mode "custom"
 * when creating with this preset, or switch to "standard" and adjust % so open stages total 100%.
 */
export const WIZARD_DEFAULT_STAGES = () => [
  { key: 's1', name: 'Initial Contact', progression_percent: 10, progressOutcome: '10|open', color_hex: '#3B82F6' },
  { key: 's2', name: 'Qualification', progression_percent: 25, progressOutcome: '25|open', color_hex: '#EAB308' },
  { key: 's3', name: 'Proposal Sent', progression_percent: 50, progressOutcome: '50|open', color_hex: '#F97316' },
  { key: 's4', name: 'Negotiation', progression_percent: 75, progressOutcome: '75|open', color_hex: '#A855F7' },
  {
    key: 's5',
    name: 'Closed Won',
    progression_percent: 100,
    progressOutcome: '100|won',
    color_hex: '#22C55E',
  },
];

export const DEAL_VALUE_TYPE_OPTIONS = [
  { value: '', label: 'Choose value type' },
  { value: 'one_time', label: 'One-time' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'service', label: 'Service' },
  { value: 'subscription', label: 'Subscription' },
];
