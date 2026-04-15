/**
 * Legacy dialer sessions stored an internal marker in `contact_call_attempts.notes`.
 * Strip it for agent-facing UI (textarea, history lines).
 */
const DIALER_SESSION_NOTE_LINE = /^\s*dialer_session:\d+\s*$/i;
const NOTE_ENTRY_LINE = /^\s*\[([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)\]\s*(.*)\s*$/;

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

function safeIsoToMs(iso) {
  if (!iso) return null;
  try {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Parse the attempt `notes` TEXT into individual timestamped note entries.
 * We store each entry on a new paragraph as: `[ISO] text`.
 *
 * @returns {{ whenIso: string|null, text: string }[]}
 */
export function parseAttemptNoteEntries(raw) {
  const clean = sanitizeAttemptNotesForDisplay(raw);
  if (!clean) return [];
  const blocks = clean.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
    const m = b.match(NOTE_ENTRY_LINE);
    if (m) {
      const whenIso = m[1];
      const text = String(m[2] || '').trim();
      if (text) out.push({ whenIso, text });
    } else {
      // Back-compat: notes that weren't stored with the `[ISO]` prefix.
      out.push({ whenIso: null, text: b });
    }
  }
  return out;
}

/**
 * Build display entries for history UI:
 * - each saved note becomes its own line
 * - the disposition (if any) becomes its own line
 *
 * @returns {{ key: string, whenIso: string|null, kind: 'note'|'disposition', text: string }[]}
 */
export function buildAttemptHistoryEntries(row) {
  if (!row) return [];
  const entries = [];
  const notes = parseAttemptNoteEntries(row.notes != null ? String(row.notes) : '');
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    entries.push({
      key: `${row.id}-n-${i}`,
      whenIso: n.whenIso,
      kind: 'note',
      text: n.text,
    });
  }

  const dispo = row.disposition_name != null ? String(row.disposition_name).trim() : '';
  if (dispo) {
    const attemptWhen = row.ended_at || row.started_at || row.created_at || null;
    entries.push({
      key: `${row.id}-d`,
      whenIso: attemptWhen,
      kind: 'disposition',
      text: dispo,
    });
  }

  // Order by time ascending (older first within the attempt) so it reads like a timeline.
  entries.sort((a, b) => {
    const ta = safeIsoToMs(a.whenIso) ?? -1;
    const tb = safeIsoToMs(b.whenIso) ?? -1;
    if (ta !== tb) return ta - tb;
    // Ensure notes appear before disposition if same timestamp.
    if (a.kind !== b.kind) return a.kind === 'note' ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return entries;
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
