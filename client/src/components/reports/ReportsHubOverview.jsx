import React, { useEffect, useState } from 'react';
import { reportsHubAPI } from '../../services/reportsHubAPI';
import { AI_INSIGHTS_DISPLAY_NAME } from '../../config/productBrand';
import { XInsightsPanel } from './XInsightsPanel';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import styles from './ReportsHubOverview.module.scss';

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

export function ReportsHubOverview({
  canViewTeam,
  from,
  to,
  simpleMode = false,
  /** When simple hub is shown but tenant has advanced reports turned on (user picked "Simple" in UI). */
  advancedAvailableForTenant = false,
}) {
  const [kpi, setKpi] = useState(null);
  const [insightsBundle, setInsightsBundle] = useState(null);
  const [teams, setTeams] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [comparePeriod, setComparePeriod] = useState(false);

  useEffect(() => {
    if (simpleMode) {
      setComparePeriod(false);
    }
  }, [simpleMode]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setErr('');
      setLoading(true);
      try {
        const base = { from, to, compare: simpleMode || !comparePeriod ? '0' : '1' };
        if (simpleMode) {
          const kRes = await reportsHubAPI.getKpiSummary(base);
          if (cancelled) return;
          setKpi(kRes?.data?.data || null);
          setInsightsBundle(null);
          setTeams(null);
          setLeaderboard(null);
        } else {
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
        }
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
  }, [from, to, comparePeriod, canViewTeam, simpleMode]);

  const cur = kpi?.current || {};

  return (
    <div className={styles.wrap}>
      {!simpleMode ? (
        <div className={styles.compareRow}>
          <label className={styles.compareLabel}>
            <input
              type="checkbox"
              checked={comparePeriod}
              onChange={(e) => setComparePeriod(e.target.checked)}
            />
            Compare to previous period (KPI + insights)
          </label>
        </div>
      ) : null}

      {err ? <p className={styles.errorBanner}>{err}</p> : null}

      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiCardDial}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconDial}`}>
              <MaterialSymbol name="call" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Dial attempts</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.dial_attempts)}</span>
          <span className={styles.kpiHint}>Connected: {loading ? '…' : num(cur.dial_connected)}</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardRate}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconRate}`}>
              <MaterialSymbol name="percent" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Connect rate</span>
          <span className={styles.kpiValue}>{loading ? '…' : pct(cur.connect_rate)}</span>
          <span className={styles.kpiHint}>Dialer sessions: {loading ? '…' : num(cur.dialer_sessions)}</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardMeetings}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconMeetings}`}>
              <MaterialSymbol name="event" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Meetings (range)</span>
          <span className={styles.kpiValue}>
            {loading
              ? '…'
              : num((cur.meetings_scheduled || 0) + (cur.meetings_completed || 0) + (cur.meetings_cancelled || 0))}
          </span>
          <span className={styles.kpiHint}>
            Done {num(cur.meetings_completed)} · Canc. {num(cur.meetings_cancelled)}
          </span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardFollowups}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconFollowups}`}>
              <MaterialSymbol name="schedule" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Follow-ups</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.follow_ups_pending)}</span>
          <span className={styles.kpiHint}>
            Missed: {num(cur.follow_ups_missed)} · Completed in range: {num(cur.follow_ups_completed_in_period)}
          </span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardDeals}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconDeals}`}>
              <MaterialSymbol name="payments" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Opportunities</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.opportunities_created)}</span>
          <span className={styles.kpiHint}>Amount (sum): {loading ? '…' : num(cur.opportunities_amount)}</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardScore}`}>
          <div className={styles.kpiCardHead}>
            <span className={`${styles.kpiIconWrap} ${styles.kpiIconScore}`}>
              <MaterialSymbol name="analytics" size="md" />
            </span>
          </div>
          <span className={styles.kpiLabel}>Task log score (avg)</span>
          <span className={styles.kpiValue}>{loading ? '…' : num(cur.task_avg_score)}</span>
          <span className={styles.kpiHint}>Achieved deals: {num(cur.task_achieved_deals)}</span>
        </div>
      </div>

      {!simpleMode ? (
        <div className={styles.split}>
          <XInsightsPanel bundle={insightsBundle} loading={loading} error="" />
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
      ) : advancedAvailableForTenant ? (
        <p className={styles.simpleHint}>
          Switch to <strong>Advanced reports</strong> for {AI_INSIGHTS_DISPLAY_NAME} (AI guidance), manager team rollups,
          agent leaderboards, period compare, and the full performance detail workspace.
        </p>
      ) : (
        <p className={styles.simpleHint}>
          Advanced mode adds AI insights ({AI_INSIGHTS_DISPLAY_NAME}), team rollups, leaderboards, and the full
          performance detail
          workspace. Your administrator can enable it for this organization in platform settings.
        </p>
      )}
    </div>
  );
}
