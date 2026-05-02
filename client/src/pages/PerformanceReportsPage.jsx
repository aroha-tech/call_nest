import React, { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { DateTimePickerField } from '../components/ui/DateTimePickerField';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { InfoHelpIcon } from '../components/ui/InfoHelpIcon';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { PerformanceReportsCharts } from './PerformanceReportsCharts';
import { PerformanceReportsGuide } from './PerformanceReportsGuide';
import { taskManagerAPI } from '../services/taskManagerAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { usePermissions } from '../hooks/usePermission';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
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

function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return x.toLocaleString();
}

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function scoreTier(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'low';
  if (s >= 75) return 'high';
  if (s >= 50) return 'mid';
  return 'low';
}

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
  const [dialsByHour, setDialsByHour] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftMonth, setDraftMonth] = useState(month);
  const [draftUserId, setDraftUserId] = useState(userId);
  const { canAny } = usePermissions();
  const { formatDate } = useDateTimeDisplay();
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

  useEffect(() => {
    if (viewMode !== 'team' && activeTab === 'managers') setActiveTab('overview');
  }, [viewMode, activeTab]);

  function openFilterModal() {
    setDraftFrom(from);
    setDraftTo(to);
    setDraftMonth(month);
    setDraftUserId(userId);
    setFilterOpen(true);
  }

  function applyFilters() {
    setFrom(draftFrom);
    setTo(draftTo);
    setMonth(draftMonth);
    setUserId(draftUserId);
    setFilterOpen(false);
  }

  const filterSummaryLine = useMemo(() => {
    const parts = [`${from} → ${to}`, `Calendar month ${month}`];
    if (canViewTeam && viewMode === 'individual' && userId) {
      parts.push(selectedUserLabel);
    } else if (canViewTeam && viewMode === 'team') {
      parts.push('All agents in scope');
    }
    return parts.join(' · ');
  }, [from, to, month, canViewTeam, viewMode, userId, selectedUserLabel]);

  async function load() {
    setError('');
    setLoading(true);
    try {
      const params = { from, to, userId: effectiveUserId };
      const [sRes, cRes, tRes, dhRes, iRes, uRes, cfgRes] = await Promise.all([
        taskManagerAPI.getSummary(params),
        taskManagerAPI.getCalendar({ month, userId: effectiveUserId }),
        taskManagerAPI.getTrend({ ...params, groupBy: 'week' }),
        taskManagerAPI.getDialsByHour(params),
        taskManagerAPI.getCoachingInsights(params),
        tenantUsersAPI.getAll({ role: 'agent', limit: 300 }),
        taskManagerAPI.getScoringConfig(),
      ]);
      setSummary(sRes?.data?.data || []);
      setCalendar(cRes?.data?.data || []);
      setTrend(tRes?.data?.data || []);
      setDialsByHour(dhRes?.data?.data || []);
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

  const activityTotals = useMemo(() => {
    return summary.reduce(
      (acc, s) => ({
        crmCalls: acc.crmCalls + Number(s.crm_total_calls || 0),
        scheduledFollowUps: acc.scheduledFollowUps + Number(s.crm_scheduled_follow_ups || 0),
        fuCall: acc.fuCall + Number(s.crm_follow_up_phone || 0),
        fuEmail: acc.fuEmail + Number(s.crm_follow_up_email || 0),
        fuMtg: acc.fuMtg + Number(s.crm_follow_up_meeting || 0),
        fuOther: acc.fuOther + Number(s.crm_follow_up_other || 0),
        calMeetings: acc.calMeetings + Number(s.crm_calendar_meetings || 0),
        dealAmt: acc.dealAmt + Number(s.crm_opportunities_amount || 0),
        opps: acc.opps + Number(s.crm_opportunities_count || 0),
        taskCalls: acc.taskCalls + Number(s.achieved_calls || 0),
        taskMeetings: acc.taskMeetings + Number(s.achieved_meetings || 0),
        taskDeals: acc.taskDeals + Number(s.achieved_deals || 0),
      }),
      {
        crmCalls: 0,
        scheduledFollowUps: 0,
        fuCall: 0,
        fuEmail: 0,
        fuMtg: 0,
        fuOther: 0,
        calMeetings: 0,
        dealAmt: 0,
        opps: 0,
        taskCalls: 0,
        taskMeetings: 0,
        taskDeals: 0,
      }
    );
  }, [summary]);

  const rowsByManager = useMemo(() => {
    const map = new Map();
    for (const s of summary) {
      const label = (s.manager_name && String(s.manager_name).trim()) || 'No manager assigned';
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
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

  const chartProps = useMemo(
    () => ({
      summary,
      trend,
      calendarSlices: calendarHighlights,
      dialsByHour,
      formatInt,
      formatMoney,
    }),
    [summary, trend, calendarHighlights, dialsByHour]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Performance Reports"
        description={isAgent ? 'Personal KPI tracking, trend, consistency, and coaching guidance.' : 'Team and individual KPI tracking with trend, consistency, and coaching guidance.'}
        actions={
          canExport ? (
            <Button type="button" onClick={exportCsv} disabled={loading}>
              Export CSV
            </Button>
          ) : undefined
        }
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {ok ? <Alert variant="success">{ok}</Alert> : null}

      <div className={styles.scopeCard}>
        <div>
          <p className={styles.scopeLabel}>Report Perspective</p>
          <h3 className={styles.scopeTitle}>
            <span>{reportPerspective}</span>
            <InfoHelpIcon
              title="Report perspective info"
              modalTitle={reportPerspective}
              message={reportSubtitle}
            />
          </h3>
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

      <div className={styles.filterToolbar}>
        <div className={styles.filterToolbarMeta}>
          <p className={styles.filterToolbarLabel}>Active filters</p>
          <p className={styles.filterToolbarRange}>{filterSummaryLine}</p>
        </div>
        <div className={styles.filterToolbarActions}>
          <Button type="button" variant="primary" size="sm" onClick={openFilterModal} disabled={loading}>
            Filters
          </Button>
        </div>
      </div>

      <Modal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Report filters"
        size="lg"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setFilterOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyFilters}>
              Apply
            </Button>
          </ModalFooter>
        }
      >
        <div className={styles.filtersModalGrid}>
          <DateTimePickerField mode="date" label="From" value={draftFrom} onChange={setDraftFrom} />
          <DateTimePickerField mode="date" label="To" value={draftTo} onChange={setDraftTo} />
          <div className={styles.filtersModalFull}>
            <Input type="month" label="Calendar Month" value={draftMonth} onChange={(e) => setDraftMonth(e.target.value)} />
          </div>
          {canViewTeam ? (
            <div className={styles.filtersModalFull}>
              <Select
                label={viewMode === 'individual' ? 'Agent' : 'Agent (switch to Individual to choose)'}
                value={viewMode === 'individual' ? draftUserId : ''}
                onChange={(e) => setDraftUserId(e.target.value)}
                options={userOptions}
                disabled={viewMode !== 'individual'}
              />
            </div>
          ) : (
            <div className={styles.filtersModalFull}>
              <Input type="text" label="Role" value={ROLE_LABEL[currentRole] || 'Agent'} disabled />
            </div>
          )}
        </div>
        <p className={styles.filterHint}>
          Task scores use daily task logs. CRM metrics (dials, scheduled follow-ups by type, meetings, new opportunities) use the same From/To range. The calendar month controls the status mix chart and calendar table.
        </p>
      </Modal>

      <PerformanceReportsGuide isAgent={isAgent} canViewTeam={canViewTeam} viewMode={viewMode} />

      <div className={styles.cardsRow}>
        {reportCards.map((card) => (
          <div key={card.label} className={styles.miniCard}>
            <div className={styles.miniLabel}>
              <span>{card.label}</span>
              <InfoHelpIcon
                title={`${card.label} info`}
                modalTitle={card.label}
                message={card.hint}
              />
            </div>
            <div className={styles.miniValue}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.activityBand}>
        <div className={styles.activityBandTitle}>
          <span>Activity &amp; pipeline (same date range)</span>
          <InfoHelpIcon
            title="Activity metrics"
            modalTitle="How these numbers are counted"
            message="Dial attempts: outbound/inbound attempts logged on the dialer for the agent. Follow-ups: schedule hub items (phone, email, meeting, other) assigned to the agent (pending or completed) with a scheduled time in range. Meetings: calendar meetings where the agent is owner or assignee. Opportunities: deals created in range, attributed to opportunity owner (or creator if owner is blank); amount is the sum of Amount or Expected revenue."
          />
        </div>
        <div className={styles.activityCardsRow}>
          <div className={styles.activityMini}>
            <div className={styles.activityMiniLabel}>Dial attempts</div>
            <div className={styles.activityMiniValue}>{formatInt(activityTotals.crmCalls)}</div>
            <div className={styles.activityMiniSub}>Task log calls: {formatInt(activityTotals.taskCalls)}</div>
          </div>
          <div className={styles.activityMini}>
            <div className={styles.activityMiniLabel}>Calendar meetings</div>
            <div className={styles.activityMiniValue}>{formatInt(activityTotals.calMeetings)}</div>
            <div className={styles.activityMiniSub}>Logged in tasks: {formatInt(activityTotals.taskMeetings)}</div>
          </div>
          <div className={styles.activityMini}>
            <div className={styles.activityMiniLabel}>Scheduled follow-ups</div>
            <div className={styles.activityMiniValue}>{formatInt(activityTotals.scheduledFollowUps)}</div>
            <div className={styles.activityMiniSub}>
              Phone {formatInt(activityTotals.fuCall)} · Email {formatInt(activityTotals.fuEmail)} · Meeting{' '}
              {formatInt(activityTotals.fuMtg)} · Other {formatInt(activityTotals.fuOther)}
            </div>
          </div>
          <div className={styles.activityMini}>
            <div className={styles.activityMiniLabel}>New deals &amp; value</div>
            <div className={styles.activityMiniValue}>{formatInt(activityTotals.opps)} opps</div>
            <div className={styles.activityMiniSub}>Total amount: {formatMoney(activityTotals.dealAmt)} · Task &quot;deals&quot; achieved: {formatInt(activityTotals.taskDeals)}</div>
          </div>
        </div>
      </div>

      <div className={styles.quickInsights}>
        <div className={styles.highlightCard}>
          <p className={styles.highlightLabel}>Top Performer</p>
          <h4 className={styles.highlightTitle}>{topPerformer?.user_name || 'No data yet'}</h4>
          <p className={styles.highlightMeta}>
            Score: {topPerformer ? Number(topPerformer.avg_score || 0).toFixed(2) : '0.00'} | Completion:{' '}
            {topPerformer ? Number(topPerformer.avg_completion_percent || 0).toFixed(2) : '0.00'}%
          </p>
          {topPerformer ? (
            <p className={styles.highlightMeta}>
              Dials {formatInt(topPerformer.crm_total_calls)} · Follow-ups {formatInt(topPerformer.crm_scheduled_follow_ups)} ·
              Meetings {formatInt(topPerformer.crm_calendar_meetings)} · Deal value {formatMoney(topPerformer.crm_opportunities_amount)}
            </p>
          ) : null}
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
            {canViewTeam && viewMode === 'team' ? (
              <Tab isActive={activeTab === 'managers'} onClick={() => setActiveTab('managers')}>By manager</Tab>
            ) : null}
            <Tab isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>Calendar & Trend</Tab>
            <Tab isActive={activeTab === 'coaching'} onClick={() => setActiveTab('coaching')}>Coaching</Tab>
            {scoring ? (
              <Tab isActive={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</Tab>
            ) : null}
          </TabList>

          <TabPanel isActive={activeTab === 'overview'}>
            <p className={styles.chartsSectionTitle}>Visual dashboard</p>
            <PerformanceReportsCharts {...chartProps} mode="full" />
            <div className={styles.innerCard}>
              <h3 className={styles.sectionTitle}>
                {isAgent ? 'My performance at a glance' : 'Team performance at a glance'}
                <InfoHelpIcon
                  title="Snapshot columns"
                  modalTitle="Reading this table"
                  message="Task columns come from daily task assignments. Dials, scheduled follow-ups (with type breakdown), and meetings are pulled from the dialer, schedule hub, and calendar. Deal value sums new opportunities created in the period (amount or expected revenue)."
                />
              </h3>
              <div className={`${listStyles.tableCardBody} ${styles.tableScroll} ${styles.wideTable}`}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>User</TableHeaderCell>
                        <TableHeaderCell>Manager</TableHeaderCell>
                        <TableHeaderCell>Role</TableHeaderCell>
                        <TableHeaderCell>Completion %</TableHeaderCell>
                        <TableHeaderCell>Avg score</TableHeaderCell>
                        <TableHeaderCell>Task calls</TableHeaderCell>
                        <TableHeaderCell>Task meetings</TableHeaderCell>
                        <TableHeaderCell>Task deals</TableHeaderCell>
                        <TableHeaderCell>Dials</TableHeaderCell>
                        <TableHeaderCell>Follow-ups</TableHeaderCell>
                        <TableHeaderCell>FU phone</TableHeaderCell>
                        <TableHeaderCell>FU email</TableHeaderCell>
                        <TableHeaderCell>FU mtg</TableHeaderCell>
                        <TableHeaderCell>FU other</TableHeaderCell>
                        <TableHeaderCell>Cal. meetings</TableHeaderCell>
                        <TableHeaderCell>New opps</TableHeaderCell>
                        <TableHeaderCell>Deal value</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.length ? summary.map((s) => {
                        const tier = scoreTier(s.avg_score);
                        const pillClass =
                          tier === 'high' ? styles.scorePillHigh : tier === 'mid' ? styles.scorePillMid : styles.scorePillLow;
                        return (
                          <TableRow key={s.user_id}>
                            <TableCell>{s.user_name}</TableCell>
                            <TableCell>{s.manager_name || '—'}</TableCell>
                            <TableCell>{ROLE_LABEL[String(s.role || '').toLowerCase()] || s.role}</TableCell>
                            <TableCell>{Number(s.avg_completion_percent || 0).toFixed(1)}%</TableCell>
                            <TableCell>
                              <span className={`${styles.scorePill} ${pillClass}`}>
                                {Number(s.avg_score || 0).toFixed(1)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {formatInt(s.achieved_calls)}
                              {Number(s.target_calls) > 0 ? ` / ${formatInt(s.target_calls)}` : ''}
                            </TableCell>
                            <TableCell>
                              {formatInt(s.achieved_meetings)}
                              {Number(s.target_meetings) > 0 ? ` / ${formatInt(s.target_meetings)}` : ''}
                            </TableCell>
                            <TableCell>
                              {formatInt(s.achieved_deals)}
                              {Number(s.target_deals) > 0 ? ` / ${formatInt(s.target_deals)}` : ''}
                            </TableCell>
                            <TableCell>{formatInt(s.crm_total_calls)}</TableCell>
                            <TableCell>{formatInt(s.crm_scheduled_follow_ups)}</TableCell>
                            <TableCell>{formatInt(s.crm_follow_up_phone)}</TableCell>
                            <TableCell>{formatInt(s.crm_follow_up_email)}</TableCell>
                            <TableCell>{formatInt(s.crm_follow_up_meeting)}</TableCell>
                            <TableCell>{formatInt(s.crm_follow_up_other)}</TableCell>
                            <TableCell>{formatInt(s.crm_calendar_meetings)}</TableCell>
                            <TableCell>{formatInt(s.crm_opportunities_count)}</TableCell>
                            <TableCell>{formatMoney(s.crm_opportunities_amount)}</TableCell>
                          </TableRow>
                        );
                      }) : renderEmptyState(17, 'No snapshot rows available.')}
                    </TableBody>
                  </Table>
                </div>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'kpi'}>
            <p className={styles.chartsSectionTitle}>Visual dashboard</p>
            <PerformanceReportsCharts {...chartProps} mode="full" />
            <h3 className={styles.sectionTitle}>{isAgent ? 'My KPI Summary' : 'Role-wise KPI Summary'}</h3>
            <div className={`${listStyles.tableCardBody} ${styles.tableScroll} ${styles.wideTable}`}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>User</TableHeaderCell>
                    <TableHeaderCell>Manager</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell>Assigned days</TableHeaderCell>
                    <TableHeaderCell>Achieved</TableHeaderCell>
                    <TableHeaderCell>Missed</TableHeaderCell>
                    <TableHeaderCell>Completion %</TableHeaderCell>
                    <TableHeaderCell>Consistency %</TableHeaderCell>
                    <TableHeaderCell>Avg score</TableHeaderCell>
                    <TableHeaderCell>Calls ach. / target</TableHeaderCell>
                    <TableHeaderCell>Mtgs ach. / target</TableHeaderCell>
                    <TableHeaderCell>Deals ach. / target</TableHeaderCell>
                    <TableHeaderCell>Conv. call→mtg %</TableHeaderCell>
                    <TableHeaderCell>Conv. mtg→deal %</TableHeaderCell>
                    <TableHeaderCell>Dials</TableHeaderCell>
                    <TableHeaderCell>Follow-ups</TableHeaderCell>
                    <TableHeaderCell>FU phone</TableHeaderCell>
                    <TableHeaderCell>FU email</TableHeaderCell>
                    <TableHeaderCell>FU mtg</TableHeaderCell>
                    <TableHeaderCell>FU other</TableHeaderCell>
                    <TableHeaderCell>Cal. mtgs</TableHeaderCell>
                    <TableHeaderCell>New opps</TableHeaderCell>
                    <TableHeaderCell>Deal value</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.length ? summary.map((s) => (
                    <TableRow key={s.user_id}>
                      <TableCell>{s.user_name}</TableCell>
                      <TableCell>{s.manager_name || '—'}</TableCell>
                      <TableCell>{ROLE_LABEL[String(s.role || '').toLowerCase()] || s.role}</TableCell>
                      <TableCell>{s.assigned_days}</TableCell>
                      <TableCell>{s.achieved_days}</TableCell>
                      <TableCell>{s.missed_days}</TableCell>
                      <TableCell>{Number(s.avg_completion_percent || 0).toFixed(2)}%</TableCell>
                      <TableCell>{Number(s.consistency_score || 0).toFixed(2)}%</TableCell>
                      <TableCell>{Number(s.avg_score || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {formatInt(s.achieved_calls)} / {formatInt(s.target_calls)}
                      </TableCell>
                      <TableCell>
                        {formatInt(s.achieved_meetings)} / {formatInt(s.target_meetings)}
                      </TableCell>
                      <TableCell>
                        {formatInt(s.achieved_deals)} / {formatInt(s.target_deals)}
                      </TableCell>
                      <TableCell>{Number(s.calls_to_meeting_conversion || 0).toFixed(1)}%</TableCell>
                      <TableCell>{Number(s.meeting_to_deal_conversion || 0).toFixed(1)}%</TableCell>
                      <TableCell>{formatInt(s.crm_total_calls)}</TableCell>
                      <TableCell>{formatInt(s.crm_scheduled_follow_ups)}</TableCell>
                      <TableCell>{formatInt(s.crm_follow_up_phone)}</TableCell>
                      <TableCell>{formatInt(s.crm_follow_up_email)}</TableCell>
                      <TableCell>{formatInt(s.crm_follow_up_meeting)}</TableCell>
                      <TableCell>{formatInt(s.crm_follow_up_other)}</TableCell>
                      <TableCell>{formatInt(s.crm_calendar_meetings)}</TableCell>
                      <TableCell>{formatInt(s.crm_opportunities_count)}</TableCell>
                      <TableCell>{formatMoney(s.crm_opportunities_amount)}</TableCell>
                    </TableRow>
                  )) : renderEmptyState(23, 'No KPI summary found for the selected filters.')}
                </TableBody>
              </Table>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'managers'}>
            <h3 className={styles.sectionTitle}>
              Team rollup by manager
              <InfoHelpIcon
                title="Manager groups"
                modalTitle="Organizing by manager"
                message="Agents are grouped using the Manager field on their user profile. Use this view in 1:1s with team leads to review everyone reporting to the same manager."
              />
            </h3>
            {rowsByManager.length ? rowsByManager.map(([mgrLabel, rows]) => (
              <div key={mgrLabel} className={styles.managerGroup}>
                <p className={styles.managerGroupTitle}>{mgrLabel} · {rows.length} agent{rows.length === 1 ? '' : 's'}</p>
                <div className={`${listStyles.tableCardBody} ${styles.tableScroll} ${styles.wideTable}`}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>User</TableHeaderCell>
                        <TableHeaderCell>Role</TableHeaderCell>
                        <TableHeaderCell>Score</TableHeaderCell>
                        <TableHeaderCell>Completion %</TableHeaderCell>
                        <TableHeaderCell>Task calls / mtgs / deals</TableHeaderCell>
                        <TableHeaderCell>Dials</TableHeaderCell>
                        <TableHeaderCell>Follow-ups</TableHeaderCell>
                        <TableHeaderCell>FU · phone / email / mtg / oth</TableHeaderCell>
                        <TableHeaderCell>Meetings</TableHeaderCell>
                        <TableHeaderCell>Deal value</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((s) => (
                        <TableRow key={s.user_id}>
                          <TableCell>{s.user_name}</TableCell>
                          <TableCell>{ROLE_LABEL[String(s.role || '').toLowerCase()] || s.role}</TableCell>
                          <TableCell>{Number(s.avg_score || 0).toFixed(1)}</TableCell>
                          <TableCell>{Number(s.avg_completion_percent || 0).toFixed(1)}%</TableCell>
                          <TableCell>
                            {formatInt(s.achieved_calls)} / {formatInt(s.achieved_meetings)} / {formatInt(s.achieved_deals)}
                          </TableCell>
                          <TableCell>{formatInt(s.crm_total_calls)}</TableCell>
                          <TableCell>{formatInt(s.crm_scheduled_follow_ups)}</TableCell>
                          <TableCell>
                            {formatInt(s.crm_follow_up_phone)} / {formatInt(s.crm_follow_up_email)} /{' '}
                            {formatInt(s.crm_follow_up_meeting)} / {formatInt(s.crm_follow_up_other)}
                          </TableCell>
                          <TableCell>{formatInt(s.crm_calendar_meetings)}</TableCell>
                          <TableCell>{formatMoney(s.crm_opportunities_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )) : (
              <div className={styles.emptyState}>No rows for this scope.</div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'calendar'}>
            <p className={styles.chartsSectionTitle}>Trend &amp; calendar visuals</p>
            <PerformanceReportsCharts {...chartProps} mode="trendCalendar" />
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
                          <TableCell>{formatDate(c.task_date)}</TableCell>
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
            <p className={styles.chartsSectionTitle}>Visual queue</p>
            <PerformanceReportsCharts {...chartProps} mode="coachingBars" coaching={coaching} />
            <h3 className={styles.sectionTitle}>{isAgent ? 'My Coaching Insights' : 'Coaching Insights'}</h3>
            <div className={`${listStyles.tableCardBody} ${styles.tableScroll}`}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Agent</TableHeaderCell>
                    {!isAgent ? <TableHeaderCell>Manager</TableHeaderCell> : null}
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
                      {!isAgent ? <TableCell>{c.manager_name || '—'}</TableCell> : null}
                      <TableCell>{Number(c.avg_score || 0).toFixed(2)}</TableCell>
                      <TableCell>{Number(c.consistency_score || 0).toFixed(2)}%</TableCell>
                      <TableCell>{c.missed_days}</TableCell>
                      <TableCell>{c.recommendation}</TableCell>
                    </TableRow>
                  )) : renderEmptyState(isAgent ? 5 : 6, 'No coaching recommendations for this scope yet.')}
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
