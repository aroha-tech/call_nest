/**
 * Legacy dialer sessions stored an internal marker in `contact_call_attempts.notes`.
 * Strip it for agent-facing UI (textarea, history lines).
 */
const DIALER_SESSION_NOTE_LINE = /^\s*dialer_session:\d+\s*$/i;

export function sanitizeAttemptNotesForDisplay(raw) {
  if (raw == null || raw === '') return '';
  const lines = String(raw).split(/\r?\n/);
  const kept = lines.filter((line) => !DIALER_SESSION_NOTE_LINE.test(line));
  return kept.join('\n').trim();
}

/** disposition_id is UUID string (or legacy numeric); empty dial stubs have NULL. */
export function hasAttemptDispositionSet(dispositionId) {
  if (dispositionId == null || dispositionId === '') return false;
  const s = String(dispositionId).trim();
  return s !== '' && s !== '0';
}

/**
 * Dialer "Previous call notes" should not list empty attempts created only when a dial starts.
 * Show a row once the agent set a disposition and/or saved visible call notes.
 */
export function attemptHasDialerVisibleHistory(row) {
  if (!row) return false;
  if (hasAttemptDispositionSet(row.disposition_id)) return true;
  return sanitizeAttemptNotesForDisplay(row.notes != null ? String(row.notes) : '').length > 0;
}
