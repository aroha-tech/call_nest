/**
 * Next Action options for dispositions.
 * Determines what happens after a disposition is selected.
 */
export const NEXT_ACTION_OPTIONS = [
  { value: 'next_number', label: 'Next Number' },
  { value: 'next_contact', label: 'Next Contact' },
  { value: 'stop', label: 'Stop' },
  { value: 'end_session', label: 'End Session' },
  { value: 'pause', label: 'Pause' },
  { value: 'stay', label: 'Stay' },
];

/**
 * Get display label for a next action value
 */
export function getNextActionLabel(value) {
  const option = NEXT_ACTION_OPTIONS.find(opt => opt.value === value);
  return option?.label || value || '-';
}
