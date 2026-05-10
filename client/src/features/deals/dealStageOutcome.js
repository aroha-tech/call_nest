/**
 * Combined value: `${percent}|open|won|lost`.
 * Won/Lost only exist at 100% (closed). Below 100% is always open pipeline weight.
 */
export function buildStageProgressOutcomeOptions() {
  const opts = [];
  for (let pct = 5; pct <= 95; pct += 5) {
    opts.push({
      value: `${pct}|open`,
      label: `${pct}%`,
    });
  }
  opts.push({ value: '100|open', label: '100% · Open' });
  opts.push({ value: '100|won', label: '100% · Won' });
  opts.push({ value: '100|lost', label: '100% · Lost' });
  return opts;
}

export const STAGE_PROGRESS_OUTCOME_OPTIONS = buildStageProgressOutcomeOptions();

export function progressOutcomeFromStage(s) {
  let won = Number(s?.is_closed_won) === 1 || s?.is_closed_won === true;
  let lost = Number(s?.is_closed_lost) === 1 || s?.is_closed_lost === true;
  if (won && lost) lost = false;
  if (won) return '100|won';
  if (lost) return '100|lost';

  const raw = Number(s?.progression_percent);
  const rounded = Number.isFinite(raw) ? Math.round(raw) : 10;
  const pct = Math.min(100, Math.max(5, rounded));
  if (pct >= 100) return '100|open';
  return `${pct}|open`;
}

export function parseProgressOutcome(v) {
  const str = String(v || '');
  const [a, b] = str.split('|');
  const parsedPct = Math.min(100, Math.max(5, Number(a) || 10));
  const kind = b === 'won' || b === 'lost' ? b : 'open';
  const progression_percent = kind === 'won' || kind === 'lost' ? 100 : parsedPct;
  return {
    progression_percent,
    is_closed_won: kind === 'won',
    is_closed_lost: kind === 'lost',
  };
}
