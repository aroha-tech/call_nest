import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { reportsHubAPI } from '../../services/reportsHubAPI';
import { NestInsightsPanel } from './NestInsightsPanel';
import styles from './ReportsHubOverview.module.scss';

const PRESETS = [
  { id: 'last_7_days', label: 'Last 7 days' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_6_months', label: 'Last 6 months' },
  { id: 'this_year', label: 'This year' },
];

function pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function num(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return x.toLocaleString();
}

export function ReportsHubOverview({ canViewTeam, from, to, onApplyPresetDates, onOpenFilters }) {
  const [kpi, setKpi] = useState(null);
  const [insightsBundle, setInsightsBundle] = useState(null);
  const [teams, setTeams] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [comparePeriod, setComparePeriod] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setErr('');
      setLoading(true);
      try {
        const base = { from, to, compare: comparePeriod ? '1' : '0' };
        const [kRes, iRes, tRes, lRes] = await Promise.all([
          reportsHubAPI.getKpiSummary(base),
          reportsHubAPI.getInsights(base),
          canViewTeam ? reportsHubAPI.getTeams(base) : Promise.resolve({ data: { data: null } }),
          reportsHubAPI.getLeaderboard({ ...base, metric: 'avg_score', limit: 8 }),
        ]);
        if (cancelled) return;
        setKpi(kRes?.data?.data || null);
        setInsightsBundle(iRes?.data?.data || null);
        setTeams(tRes?.data?.data || null);
        setLeaderboard(lRes?.data?.data || null);
      } catch (e) {
        if (!cancelled) {
          setErr(e?.response?.data?.error || e?.message || 'Failed to load reports hub');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (from && to) run();
    return () => {
      cancelled = true;
    };
  }, [from, to, comparePeriod, canViewTeam]);

  const cur = kpi?.current || {};

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div>
          <p className={styles.toolbarLabel}>Quick range</p>
          <div className={styles.presetRow}>
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant="secondary"
                disabled={loading}
                onClick={() => onApplyPresetDates?.(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <label className={styles.compareLabel}>
            <input
              type="checkbox"
              checked={comparePeriod}
              onChange={(e) => setComparePeriod(e.target.checked)}
            />
            Compare to previous period (KPI + insights)
          </label>
          {onOpenFilters ? (
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => onOpenFilters()}>
              Custom dates…
            </Button>
          ) : null}
        </div>
      </div>

      <p className={styles.rangeLine}>
        Active range: <strong>{from}</strong> → <strong>{to}</strong>
      </p>

      {err ? <p className={styles.errorBanner}>{err}</p> : null}

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Dial attempts</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.dial_attempts)}</span>
          <span className={styles.kpiHint}>Connected: {loading ? '…' : num(cur.dial_connected)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Connect rate</span>
          <span className={styles.kpiValue}>{loading ? '…' : pct(cur.connect_rate)}</span>
          <span className={styles.kpiHint}>Dialer sessions: {loading ? '…' : num(cur.dialer_sessions)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Meetings (range)</span>
          <span className={styles.kpiValue}>
            {loading ? '…' : num((cur.meetings_scheduled || 0) + (cur.meetings_completed || 0) + (cur.meetings_cancelled || 0))}
          </span>
          <span className={styles.kpiHint}>
            Done {num(cur.meetings_completed)} · Canc. {num(cur.meetings_cancelled)}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Follow-ups</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.follow_ups_pending)}</span>
          <span className={styles.kpiHint}>Completed in range: {num(cur.follow_ups_completed_in_period)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Opportunities</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.opportunities_created)}</span>
          <span className={styles.kpiHint}>Amount (sum): {loading ? '…' : num(cur.opportunities_amount)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Task log score (avg)</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.task_avg_score)}</span>
          <span className={styles.kpiHint}>Achieved deals: {num(cur.task_achieved_deals)}</span>
        </div>
      </div>

      <div className={styles.split}>
        <NestInsightsPanel bundle={insightsBundle} loading={loading} error="" />
        <div className={styles.side}>
          {canViewTeam && teams?.teams?.length ? (
            <div className={styles.sideBlock}>
              <h4 className={styles.sideTitle}>By manager team</h4>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Agents</th>
                    <th>Avg score</th>
                    <th>Revenue Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.teams.map((t) => (
                    <tr key={t.manager_id ?? t.manager_name}>
                      <td>{t.manager_name}</td>
                      <td>{t.agent_count}</td>
                      <td>{num(t.avg_score)}</td>
                      <td>{num(t.crm_opportunities_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {leaderboard?.rows?.length ? (
            <div className={styles.sideBlock}>
              <h4 className={styles.sideTitle}>Top agents (score)</h4>
              <ol className={styles.leaderList}>
                {leaderboard.rows.map((r) => (
                  <li key={r.user_id}>
                    <span className={styles.lbRank}>{r.rank}.</span> {r.user_name}{' '}
                    <span className={styles.lbVal}>{num(r.value)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
