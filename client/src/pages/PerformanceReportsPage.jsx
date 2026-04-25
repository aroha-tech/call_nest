import React, { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { taskManagerAPI } from '../services/taskManagerAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { usePermissions } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './PerformanceReportsPage.module.scss';

function ym(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const ROLE_LABEL = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

export function PerformanceReportsPage() {
  const now = new Date();
  const user = useAppSelector(selectUser);
  const currentRole = String(user?.role || 'agent').toLowerCase();
  const currentUserId = user?.id != null ? String(user.id) : '';
  const isAgent = currentRole === 'agent';
  const canViewTeam = !isAgent;
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [to, setTo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`);
  const [month, setMonth] = useState(ym(now));
  const [viewMode, setViewMode] = useState(isAgent ? 'self' : 'team');
  const [activeTab, setActiveTab] = useState('overview');
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [trend, setTrend] = useState([]);
  const [coaching, setCoaching] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { canAny } = usePermissions();
  const canExport = canAny([PERMISSIONS.REPORTS_PERFORMANCE_EXPORT, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.REPORTS_VIEW]);
  const canManageScore = canAny([PERMISSIONS.TASKS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);

  const userOptions = useMemo(
    () => [{ value: '', label: 'All agents' }, ...users.map((u) => ({ value: String(u.id), label: u.name || u.email }))],
    [users]
  );

  const selectedUserLabel = useMemo(() => {
    if (!userId) return 'All agents';
    const found = users.find((u) => String(u.id) === String(userId));
    return found?.name || found?.email || 'Selected agent';
  }, [users, userId]);

  const effectiveUserId = useMemo(() => {
    if (isAgent) return currentUserId || undefined;
    if (viewMode === 'individual') return userId || undefined;
    return undefined;
  }, [isAgent, currentUserId, viewMode, userId]);

  const reportPerspective = useMemo(() => {
    if (isAgent) return 'My performance';
    if (viewMode === 'individual') return `Individual view - ${selectedUserLabel}`;
    return 'Team overview';
  }, [isAgent, viewMode, selectedUserLabel]);

  const reportSubtitle = useMemo(() => {
    if (isAgent) return 'Track your own goals, consistency, trend, and coaching recommendations.';
    if (viewMode === 'individual') return 'Deep dive into one agent for coaching and one-on-one reviews.';
    return 'Monitor your team, compare agents, and identify coaching priorities.';
  }, [isAgent, viewMode]);

  useEffect(() => {
    if (isAgent && viewMode !== 'self') setViewMode('self');
  }, [isAgent, viewMode]);

  useEffect(() => {
    if (viewMode !== 'individual' && userId) setUserId('');
  }, [viewMode, userId]);

  async function load() {
    setError('');
    setLoading(true);
    try {
      const params = { from, to, userId: effectiveUserId };
      const [sRes, cRes, tRes, iRes, uRes, cfgRes] = await Promise.all([
        taskManagerAPI.getSummary(params),
        taskManagerAPI.getCalendar({ month, userId: effectiveUserId }),
        taskManagerAPI.getTrend({ ...params, groupBy: 'week' }),
        taskManagerAPI.getCoachingInsights(params),
        tenantUsersAPI.getAll({ role: 'agent', limit: 300 }),
        taskManagerAPI.getScoringConfig(),
      ]);
      setSummary(sRes?.data?.data || []);
      setCalendar(cRes?.data?.data || []);
      setTrend(tRes?.data?.data || []);
      setCoaching(iRes?.data?.data || []);
      setUsers((uRes?.data?.data || []).filter((u) => String(u.role || '').toLowerCase() === 'agent'));
      setScoring(cfgRes?.data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, month, effectiveUserId]);

  async function exportCsv() {
    setError('');
    try {
      const res = await taskManagerAPI.exportCsv({ from, to, userId: effectiveUserId });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-report-${isAgent ? 'self' : viewMode}-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Export failed');
    }
  }

  async function saveScoring() {
    if (!scoring) return;
    setError('');
    setOk('');
    try {
      await taskManagerAPI.updateScoringConfig(scoring);
      setOk('Scoring configuration updated');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to save scoring');
    }
  }

  const rollup = useMemo(() => {
    const totalAgents = summary.length;
    const avgScore = totalAgents
      ? summary.reduce((acc, r) => acc + Number(r.avg_score || 0), 0) / totalAgents
      : 0;
    const avgConsistency = totalAgents
      ? summary.reduce((acc, r) => acc + Number(r.consistency_score || 0), 0) / totalAgents
      : 0;
    const totalMissed = summary.reduce((acc, r) => acc + Number(r.missed_days || 0), 0);
    return { totalAgents, avgScore, avgConsistency, totalMissed };
  }, [summary]);

  const reportCards = useMemo(
    () => [
      { label: isAgent ? 'My Score' : 'Avg Team Score', value: rollup.avgScore.toFixed(1), hint: 'Weighted quality score' },
      { label: isAgent ? 'My Consistency' : 'Avg Consistency', value: `${rollup.avgConsistency.toFixed(1)}%`, hint: 'Days delivered as expected' },
      { label: isAgent ? 'My Missed Days' : 'Missed Days', value: String(rollup.totalMissed), hint: 'Days below expected completion' },
      { label: canViewTeam ? 'Agents in View' : 'Rows in View', value: String(rollup.totalAgents), hint: canViewTeam ? 'Contributors in selected scope' : 'Performance records in selected period' },
    ],
    [isAgent, canViewTeam, rollup]
  );

  const topPerformer = useMemo(() => {
    if (!summary.length) return null;
    return [...summary].sort((a, b) => Number(b.avg_score || 0) - Number(a.avg_score || 0))[0];
  }, [summary]);

  const attentionAgent = useMemo(() => {
    if (!coaching.length) return null;
    return [...coaching].sort((a, b) => Number(b.missed_days || 0) - Number(a.missed_days || 0))[0];
  }, [coaching]);

  const calendarHighlights = useMemo(() => {
    const map = calendar.reduce((acc, row) => {
      const key = String(row.status || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return [
      { label: 'On Track Days', value: map.completed || 0 },
      { label: 'Partial Days', value: map.partial || 0 },
      { label: 'Missed Days', value: map.missed || 0 },
    ];
  }, [calendar]);

  function renderEmptyState(colSpan, message) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan}>
          <div className={styles.emptyState}>{message}</div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Performance Reports"
        description={isAgent ? 'Personal KPI tracking, trend, consistency, and coaching guidance.' : 'Team and individual KPI tracking with trend, consistency, and coaching guidance.'}
        actions={canExport ? <Button onClick={exportCsv} disabled={loading}>Export CSV</Button> : undefined}
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {ok ? <Alert variant="success">{ok}</Alert> : null}

      <div className={styles.scopeCard}>
        <div>
          <p className={styles.scopeLabel}>Report Perspective</p>
          <h3 className={styles.scopeTitle}>{reportPerspective}</h3>
          <p className={styles.scopeHint}>{reportSubtitle}</p>
        </div>
        {!isAgent ? (
          <div className={styles.viewToggleGroup}>
            <Button
              variant={viewMode === 'team' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setViewMode('team')}
              disabled={loading}
            >
              Team
            </Button>
            <Button
              variant={viewMode === 'individual' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setViewMode('individual')}
              disabled={loading}
            >
              Individual
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.filtersCard}>
        <div className={styles.filtersGrid}>
          <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input type="month" label="Calendar Month" value={month} onChange={(e) => setMonth(e.target.value)} />
          {canViewTeam ? (
            <Select
              label={viewMode === 'individual' ? 'Select Agent' : 'Agent Filter'}
              value={viewMode === 'individual' ? userId : ''}
              onChange={(e) => setUserId(e.target.value)}
              options={userOptions}
              disabled={viewMode !== 'individual'}
            />
          ) : (
            <Input type="text" label="Role" value={ROLE_LABEL[currentRole] || 'Agent'} disabled />
          )}
        </div>
      </div>

      <div className={styles.cardsRow}>
        {reportCards.map((card) => (
          <div key={card.label} className={styles.miniCard}>
            <div className={styles.miniLabel}>{card.label}</div>
            <div className={styles.miniValue}>{card.value}</div>
            <div className={styles.miniHint}>{card.hint}</div>
          </div>
        ))}
      </div>

      <div className={styles.quickInsights}>
        <div className={styles.highlightCard}>
          <p className={styles.highlightLabel}>Top Performer</p>
          <h4 className={styles.highlightTitle}>{topPerformer?.user_name || 'No data yet'}</h4>
          <p className={styles.highlightMeta}>
            Score: {topPerformer ? Number(topPerformer.avg_score || 0).toFixed(2) : '0.00'} | Completion:{' '}
            {topPerformer ? Number(topPerformer.avg_completion_percent || 0).toFixed(2) : '0.00'}%
          </p>
        </div>
        <div className={styles.highlightCard}>
          <p className={styles.highlightLabel}>Needs Attention</p>
          <h4 className={styles.highlightTitle}>{attentionAgent?.user_name || 'No alerts'}</h4>
          <p className={styles.highlightMeta}>
            Missed days: {attentionAgent ? Number(attentionAgent.missed_days || 0) : 0} | Consistency:{' '}
            {attentionAgent ? Number(attentionAgent.consistency_score || 0).toFixed(2) : '0.00'}%
          </p>
        </div>
        <div className={styles.highlightCard}>
          <p className={styles.highlightLabel}>Calendar Health</p>
          <h4 className={styles.highlightTitle}>{month}</h4>
          <div className={styles.healthChips}>
            {calendarHighlights.map((h) => (
              <span key={h.label} className={styles.healthChip}>{h.label}: {h.value}</span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.sectionCard}>
        <Tabs>
          <TabList>
            <Tab isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</Tab>
            <Tab isActive={activeTab === 'kpi'} onClick={() => setActiveTab('kpi')}>{isAgent ? 'My KPI' : 'Team KPI'}</Tab>
            <Tab isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>Calendar & Trend</Tab>
            <Tab isActive={activeTab === 'coaching'} onClick={() => setActiveTab('coaching')}>Coaching</Tab>
            {scoring ? (
              <Tab isActive={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</Tab>
            ) : null}
          </TabList>

          <TabPanel isActive={activeTab === 'overview'}>
            <div className={styles.overviewGrid}>
              <div className={styles.innerCard}>
                <h3 className={styles.sectionTitle}>{isAgent ? 'My KPI Snapshot' : 'Top KPI Snapshot'}</h3>
                <div className={listStyles.tableCardBody}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>User</TableHeaderCell>
                        <TableHeaderCell>Role</TableHeaderCell>
                        <TableHeaderCell>Completion %</TableHeaderCell>
                        <TableHeaderCell>Avg Score</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.length ? summary.slice(0, 5).map((s) => (
                        <TableRow key={s.user_id}>
                          <TableCell>{s.user_name}</TableCell>
                          <TableCell>{s.role}</TableCell>
                          <TableCell>{Number(s.avg_completion_percent || 0).toFixed(2)}%</TableCell>
                          <TableCell>{Number(s.avg_score || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      )) : renderEmptyState(4, 'No snapshot rows available.')}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className={styles.innerCard}>
                <h3 className={styles.sectionTitle}>Weekly Momentum</h3>
                <div className={styles.momentumList}>
                  {trend.length ? trend.slice(0, 6).map((t, i) => {
                    const completion = Math.max(0, Math.min(100, Number(t.avg_completion || 0)));
                    return (
                      <div key={`${t.bucket}-${i}`} className={styles.momentumRow}>
                        <div className={styles.momentumHeader}>
                          <span>{t.bucket}</span>
                          <span>{completion.toFixed(1)}%</span>
                        </div>
                        <div className={styles.progressTrack}>
                          <span className={styles.progressFill} style={{ width: `${completion}%` }} />
                        </div>
                      </div>
                    );
                  }) : <div className={styles.emptyState}>No weekly momentum data yet.</div>}
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'kpi'}>
            <h3 className={styles.sectionTitle}>{isAgent ? 'My KPI Summary' : 'Role-wise KPI Summary'}</h3>
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>User</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell>Assigned</TableHeaderCell>
                    <TableHeaderCell>Achieved</TableHeaderCell>
                    <TableHeaderCell>Missed</TableHeaderCell>
                    <TableHeaderCell>Completion %</TableHeaderCell>
                    <TableHeaderCell>Consistency %</TableHeaderCell>
                    <TableHeaderCell>Avg Score</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.length ? summary.map((s) => (
                    <TableRow key={s.user_id}>
                      <TableCell>{s.user_name}</TableCell>
                      <TableCell>{s.role}</TableCell>
                      <TableCell>{s.assigned_days}</TableCell>
                      <TableCell>{s.achieved_days}</TableCell>
                      <TableCell>{s.missed_days}</TableCell>
                      <TableCell>{Number(s.avg_completion_percent || 0).toFixed(2)}%</TableCell>
                      <TableCell>{Number(s.consistency_score || 0).toFixed(2)}%</TableCell>
                      <TableCell>{Number(s.avg_score || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  )) : renderEmptyState(8, 'No KPI summary found for the selected filters.')}
                </TableBody>
              </Table>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'calendar'}>
            <div className={styles.overviewGrid}>
              <div className={styles.innerCard}>
                <h3 className={styles.sectionTitle}>Calendar Status Buckets ({month})</h3>
                <div className={listStyles.tableCardBody}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Logs</TableHeaderCell>
                        <TableHeaderCell>Avg Completion %</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {calendar.length ? calendar.map((c, i) => (
                        <TableRow key={`${c.task_date}-${c.status}-${i}`}>
                          <TableCell>{String(c.task_date).slice(0, 10)}</TableCell>
                          <TableCell>{c.status}</TableCell>
                          <TableCell>{c.logs_count}</TableCell>
                          <TableCell>{Number(c.completion_percent || 0).toFixed(2)}%</TableCell>
                        </TableRow>
                      )) : renderEmptyState(4, 'No calendar report rows for this month.')}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className={styles.innerCard}>
                <h3 className={styles.sectionTitle}>Trend (Weekly)</h3>
                <div className={listStyles.tableCardBody}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Week Bucket</TableHeaderCell>
                        <TableHeaderCell>Avg Completion %</TableHeaderCell>
                        <TableHeaderCell>Avg Score</TableHeaderCell>
                        <TableHeaderCell>Logs</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trend.length ? trend.map((t, i) => (
                        <TableRow key={`${t.bucket}-${i}`}>
                          <TableCell>{t.bucket}</TableCell>
                          <TableCell>{Number(t.avg_completion || 0).toFixed(2)}%</TableCell>
                          <TableCell>{Number(t.avg_score || 0).toFixed(2)}</TableCell>
                          <TableCell>{t.logs_count}</TableCell>
                        </TableRow>
                      )) : renderEmptyState(4, 'No trend data found for this date range.')}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'coaching'}>
            <h3 className={styles.sectionTitle}>{isAgent ? 'My Coaching Insights' : 'Coaching Insights'}</h3>
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Agent</TableHeaderCell>
                    <TableHeaderCell>Avg Score</TableHeaderCell>
                    <TableHeaderCell>Consistency %</TableHeaderCell>
                    <TableHeaderCell>Missed Days</TableHeaderCell>
                    <TableHeaderCell>Recommendation</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {coaching.length ? coaching.map((c) => (
                    <TableRow key={c.user_id}>
                      <TableCell>{c.user_name}</TableCell>
                      <TableCell>{Number(c.avg_score || 0).toFixed(2)}</TableCell>
                      <TableCell>{Number(c.consistency_score || 0).toFixed(2)}%</TableCell>
                      <TableCell>{c.missed_days}</TableCell>
                      <TableCell>{c.recommendation}</TableCell>
                    </TableRow>
                  )) : renderEmptyState(5, 'No coaching recommendations for this scope yet.')}
                </TableBody>
              </Table>
            </div>
          </TabPanel>

          {scoring ? (
            <TabPanel isActive={activeTab === 'scoring'}>
              <h3 className={styles.sectionTitle}>Weighted Scoring Configuration</h3>
              <div className={styles.scoreGrid}>
                <Input type="number" label="Calls Weight" value={scoring.calls_weight} onChange={(e) => setScoring((s) => ({ ...s, calls_weight: Number(e.target.value || 0) }))} disabled={!canManageScore} />
                <Input type="number" label="Meetings Weight" value={scoring.meetings_weight} onChange={(e) => setScoring((s) => ({ ...s, meetings_weight: Number(e.target.value || 0) }))} disabled={!canManageScore} />
                <Input type="number" label="Deals Weight" value={scoring.deals_weight} onChange={(e) => setScoring((s) => ({ ...s, deals_weight: Number(e.target.value || 0) }))} disabled={!canManageScore} />
                <Input type="number" label="Medium Threshold" value={scoring.medium_performance_threshold} onChange={(e) => setScoring((s) => ({ ...s, medium_performance_threshold: Number(e.target.value || 0) }))} disabled={!canManageScore} />
                <Input type="number" label="Coaching Missed Days" value={scoring.coaching_missed_days_threshold} onChange={(e) => setScoring((s) => ({ ...s, coaching_missed_days_threshold: Number(e.target.value || 0) }))} disabled={!canManageScore} />
                <Input type="number" label="Coaching Consistency %" value={scoring.coaching_consistency_threshold} onChange={(e) => setScoring((s) => ({ ...s, coaching_consistency_threshold: Number(e.target.value || 0) }))} disabled={!canManageScore} />
              </div>
              {canManageScore ? (
                <div className={styles.actions}>
                  <Button onClick={saveScoring}>Save Scoring</Button>
                </div>
              ) : null}
            </TabPanel>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
