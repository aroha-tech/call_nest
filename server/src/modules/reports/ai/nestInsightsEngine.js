/**
 * CallXTime — X Insights (on-server intelligence)
 * Deterministic rules + explainable signals. No third-party AI services.
 * Product-facing "AI" guidance lives here; tune rules without touching SQL.
 */

export const X_INSIGHTS_ENGINE_ID = 'x-insights';
export const X_INSIGHTS_VERSION = '1.0.1';

const SEVERITY_RANK = { action: 3, watch: 2, info: 1 };

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Confidence from how far a metric is from a reference band (deterministic).
 */
function confidenceFromRatio(actual, reference, minSamples, samples) {
  if (samples < minSamples) return clamp01(0.35 + samples / (minSamples * 4));
  if (!Number.isFinite(reference) || reference <= 0) return 0.72;
  const delta = Math.abs(actual - reference) / reference;
  return clamp01(0.55 + Math.min(0.4, delta));
}

function median(nums) {
  const arr = nums.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function pushInsight(list, insight) {
  list.push({
    id: insight.id,
    title: insight.title,
    summary: insight.summary,
    severity: insight.severity,
    confidence: Number(insight.confidence.toFixed(2)),
    signals: insight.signals || [],
    suggested_actions: insight.suggested_actions || [],
  });
}

/**
 * @param {object} params
 * @param {string} params.role - admin | manager | agent
 * @param {object} params.kpiCurrent - aggregated KPI object
 * @param {object|null} params.kpiPrevious
 * @param {object} params.thresholds
 * @param {Array<object>} params.summaryRows - getRolewiseSummary rows (agents in scope)
 */
export function buildXInsights({ role, kpiCurrent, kpiPrevious, summaryRows = [], thresholds = {} }) {
  const insights = [];
  const minDialSamples = n(thresholds.min_dial_samples, 40);
  const connectFloor = n(thresholds.connect_rate_floor, 0.12);
  const fuCompleteFloor = n(thresholds.follow_up_completion_floor, 0.35);

  const attempts = n(kpiCurrent?.dial_attempts);
  const connected = n(kpiCurrent?.dial_connected);
  const connectRate = attempts > 0 ? connected / attempts : 0;

  if (attempts >= minDialSamples && connectRate < connectFloor) {
    pushInsight(insights, {
      id: 'low_connect_rate',
      title: 'Connect rate is below your target band',
      summary: `Connect rate is ${(connectRate * 100).toFixed(1)}% on ${attempts} attempts — review timing, list quality, and scripts.`,
      severity: 'action',
      confidence: confidenceFromRatio(connectRate, connectFloor, minDialSamples, attempts),
      signals: [
        { key: 'connect_rate', value: Number(connectRate.toFixed(4)), reference: connectFloor, sample_size: attempts },
        { key: 'dial_attempts', value: attempts },
      ],
      suggested_actions: [
        'Compare dials-by-hour heatmaps and shift calling blocks into the strongest hours.',
        'Audit the last 50 attempts for duplicate or low-quality numbers.',
        'Run a short script refresh focused on the first 20 seconds of the pitch.',
      ],
    });
  }

  if (kpiPrevious && attempts >= minDialSamples) {
    const pa = n(kpiPrevious.dial_attempts);
    const pc = n(kpiPrevious.dial_connected);
    const prevRate = pa > 0 ? pc / pa : 0;
    if (prevRate > 0 && connectRate < prevRate * 0.85 && connectRate < prevRate - 0.02) {
      pushInsight(insights, {
        id: 'connect_rate_vs_prior',
        title: 'Connect rate slipped versus the prior period',
        summary: `Down from ${(prevRate * 100).toFixed(1)}% to ${(connectRate * 100).toFixed(1)}% — isolate whether volume, list, or connect path changed.`,
        severity: 'watch',
        confidence: confidenceFromRatio(connectRate, prevRate, minDialSamples, attempts),
        signals: [
          { key: 'connect_rate_current', value: Number(connectRate.toFixed(4)) },
          { key: 'connect_rate_previous', value: Number(prevRate.toFixed(4)) },
        ],
        suggested_actions: [
          'Check for recent list or dialing-set changes aligned with the drop.',
          'Review dispositions: are “no-answer” outcomes spiking vs busy/failed?',
        ],
      });
    }
  }

  const fuPending = n(kpiCurrent?.follow_ups_pending);
  const fuCompleted = n(kpiCurrent?.follow_ups_completed_in_period);
  const fuDenom = fuPending + fuCompleted;
  const fuRatio = fuDenom > 0 ? fuCompleted / fuDenom : null;

  if (fuRatio != null && fuDenom >= 15 && fuRatio < fuCompleteFloor) {
    pushInsight(insights, {
      id: 'follow_up_completion_gap',
      title: 'Follow-up completion is trailing workload',
      summary: `${(fuRatio * 100).toFixed(0)}% of active follow-ups (pending + completed in range) were completed — backlog risk is elevated.`,
      severity: 'watch',
      confidence: confidenceFromRatio(fuRatio, fuCompleteFloor, 15, fuDenom),
      signals: [
        { key: 'follow_ups_pending', value: fuPending },
        { key: 'follow_ups_completed_in_period', value: fuCompleted },
        { key: 'follow_up_completion_ratio', value: Number(fuRatio.toFixed(4)), reference: fuCompleteFloor },
      ],
      suggested_actions: [
        'Prioritize overdue pending callbacks in Schedule hub.',
        'Set a daily “completion budget” per agent until the ratio recovers.',
      ],
    });
  }

  const mtgScheduled = n(kpiCurrent?.meetings_scheduled);
  const mtgCompleted = n(kpiCurrent?.meetings_completed);
  const mtgCancelled = n(kpiCurrent?.meetings_cancelled);
  const mtgDenom = mtgScheduled + mtgCompleted + mtgCancelled;
  if (mtgDenom >= 10 && mtgCancelled / mtgDenom > 0.35) {
    pushInsight(insights, {
      id: 'meeting_cancellation_rate',
      title: 'Meeting cancellations are elevated',
      summary: `${((mtgCancelled / mtgDenom) * 100).toFixed(0)}% of meetings in range were cancelled — confirm reminders and attendee quality.`,
      severity: 'info',
      confidence: clamp01(0.6 + mtgCancelled / mtgDenom),
      signals: [
        { key: 'meetings_scheduled', value: mtgScheduled },
        { key: 'meetings_completed', value: mtgCompleted },
        { key: 'meetings_cancelled', value: mtgCancelled },
      ],
      suggested_actions: [
        'Verify calendar confirmations and reschedule discipline.',
        'Review no-show vs cancelled breakdown on meetings with attendance tracked.',
      ],
    });
  }

  const scores = summaryRows.map((r) => n(r.avg_score)).filter((x) => x > 0);
  const medScore = median(scores);
  if ((role === 'admin' || role === 'manager') && scores.length >= 4 && medScore != null) {
    const lowAgents = summaryRows.filter((r) => n(r.avg_score) > 0 && n(r.avg_score) < medScore * 0.85);
    if (lowAgents.length >= 2) {
      pushInsight(insights, {
        id: 'team_score_dispersion',
        title: 'Performance is uneven across agents',
        summary: `${lowAgents.length} agents are materially below the team median score — targeted coaching will lift the average faster than blanket goals.`,
        severity: 'info',
        confidence: clamp01(0.58 + lowAgents.length / (scores.length * 3)),
        signals: [
          { key: 'median_avg_score', value: Number(medScore.toFixed(2)) },
          { key: 'agents_below_median_band', value: lowAgents.length },
        ],
        suggested_actions: [
          'Use Individual view on Performance reports for the lowest two scores first.',
          'Pair weaker agents with top performers on live listens or joint meetings.',
        ],
      });
    }
  }

  const agentIssueCandidates = [];
  for (const row of summaryRows) {
    const missed = n(row.missed_days);
    const consistency = n(row.consistency_score);
    const avgScore = n(row.avg_score);
    if (missed >= n(thresholds.coaching_missed_days, 3)) {
      agentIssueCandidates.push({
        sort: missed * 100 + (100 - avgScore),
        insight: {
          id: `agent_missed_days_${row.user_id}`,
          title: `${row.user_name || 'Agent'}: missed-day streak risk`,
          summary: `${missed} missed task days in this range — unblock daily execution before pushing higher targets.`,
          severity: 'action',
          confidence: clamp01(0.62 + Math.min(0.25, missed / 20)),
          signals: [
            { key: 'user_id', value: row.user_id },
            { key: 'missed_days', value: missed },
            { key: 'avg_score', value: avgScore },
          ],
          suggested_actions: [
            'Review blockers in Task Manager notes and reduce simultaneous priorities.',
            'Set one non-negotiable daily outcome until streak breaks.',
          ],
        },
      });
    } else if (consistency > 0 && consistency < n(thresholds.coaching_consistency, 60) && avgScore < n(thresholds.medium_score, 75)) {
      agentIssueCandidates.push({
        sort: 50 + (60 - consistency) + (75 - avgScore),
        insight: {
          id: `agent_consistency_${row.user_id}`,
          title: `${row.user_name || 'Agent'}: consistency below target`,
          summary: `Consistency is ${consistency.toFixed(1)}% with score ${avgScore.toFixed(1)} — stabilize the weekly rhythm before scaling volume.`,
          severity: 'watch',
          confidence: clamp01(0.55 + (60 - consistency) / 200),
          signals: [
            { key: 'user_id', value: row.user_id },
            { key: 'consistency_score', value: consistency },
            { key: 'avg_score', value: avgScore },
          ],
          suggested_actions: [
            'Micro-goals for three consecutive days, then raise targets.',
            'Weekly 15-minute checkpoint with their manager.',
          ],
        },
      });
    }
  }
  const maxAgentCards = role === 'agent' ? 4 : 8;
  agentIssueCandidates.sort((a, b) => b.sort - a.sort);
  for (const c of agentIssueCandidates.slice(0, maxAgentCards)) {
    pushInsight(insights, c.insight);
  }

  insights.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence);

  return {
    engine: X_INSIGHTS_ENGINE_ID,
    version: X_INSIGHTS_VERSION,
    generated_at: new Date().toISOString(),
    role: role || 'agent',
    insights,
  };
}
