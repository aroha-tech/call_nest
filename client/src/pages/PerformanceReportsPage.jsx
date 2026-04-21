import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
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

export function PerformanceReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [to, setTo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`);
  const [month, setMonth] = useState(ym(now));
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [trend, setTrend] = useState([]);
  const [coaching, setCoaching] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { canAny } = usePermissions();
  const canExport = canAny([PERMISSIONS.REPORTS_PERFORMANCE_EXPORT, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.REPORTS_VIEW]);
  const canManageScore = canAny([PERMISSIONS.TASKS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);

  const userOptions = useMemo(
    () => [{ value: '', label: 'All agents' }, ...users.map((u) => ({ value: String(u.id), label: u.name || u.email }))],
    [users]
  );

  async function load() {
    setError('');
    try {
      const params = { from, to, userId: userId || undefined };
      const [sRes, cRes, tRes, iRes, uRes, cfgRes] = await Promise.all([
        taskManagerAPI.getSummary(params),
        taskManagerAPI.getCalendar({ month, userId: userId || undefined }),
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
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, month, userId]);

  async function exportCsv() {
    setError('');
    try {
      const res = await taskManagerAPI.exportCsv({ from, to, userId: userId || undefined });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-report-${from}-to-${to}.csv`;
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

  return (
    <div className={styles.page}>
      <PageHeader
        title="Performance Reports"
        description="KPIs, calendar performance, trends, export, and coaching."
        actions={canExport ? <Button onClick={exportCsv}>Export CSV</Button> : undefined}
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {ok ? <Alert variant="success">{ok}</Alert> : null}

      <div className={styles.filtersCard}>
        <div className={styles.filtersGrid}>
          <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input type="month" label="Calendar Month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Select label="Agent Filter" value={userId} onChange={(e) => setUserId(e.target.value)} options={userOptions} />
        </div>
      </div>

      <div className={styles.cardsRow}>
        <div className={styles.miniCard}><div className={styles.miniLabel}>Agents in View</div><div className={styles.miniValue}>{rollup.totalAgents}</div></div>
        <div className={styles.miniCard}><div className={styles.miniLabel}>Avg Team Score</div><div className={styles.miniValue}>{rollup.avgScore.toFixed(1)}</div></div>
        <div className={styles.miniCard}><div className={styles.miniLabel}>Avg Consistency</div><div className={styles.miniValue}>{rollup.avgConsistency.toFixed(1)}%</div></div>
        <div className={styles.miniCard}><div className={styles.miniLabel}>Missed Days</div><div className={styles.miniValue}>{rollup.totalMissed}</div></div>
      </div>

      <div className={styles.sectionCard}>
      <h3 className={styles.sectionTitle}>Role-wise KPI Summary</h3>
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
          {summary.map((s) => (
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
          ))}
        </TableBody>
      </Table>
      </div>
      </div>

      <div className={styles.sectionCard}>
      <h3 className={styles.sectionTitle}>Calendar Status Buckets</h3>
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
          {calendar.map((c, i) => (
            <TableRow key={`${c.task_date}-${c.status}-${i}`}>
              <TableCell>{String(c.task_date).slice(0, 10)}</TableCell>
              <TableCell>{c.status}</TableCell>
              <TableCell>{c.logs_count}</TableCell>
              <TableCell>{Number(c.completion_percent || 0).toFixed(2)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      </div>

      <div className={styles.sectionCard}>
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
          {trend.map((t, i) => (
            <TableRow key={`${t.bucket}-${i}`}>
              <TableCell>{t.bucket}</TableCell>
              <TableCell>{Number(t.avg_completion || 0).toFixed(2)}%</TableCell>
              <TableCell>{Number(t.avg_score || 0).toFixed(2)}</TableCell>
              <TableCell>{t.logs_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      </div>

      <div className={styles.sectionCard}>
      <h3 className={styles.sectionTitle}>Coaching Insights</h3>
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
          {coaching.map((c) => (
            <TableRow key={c.user_id}>
              <TableCell>{c.user_name}</TableCell>
              <TableCell>{Number(c.avg_score || 0).toFixed(2)}</TableCell>
              <TableCell>{Number(c.consistency_score || 0).toFixed(2)}%</TableCell>
              <TableCell>{c.missed_days}</TableCell>
              <TableCell>{c.recommendation}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      </div>

      {scoring ? (
        <div className={styles.sectionCard}>
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
        </div>
      ) : null}
    </div>
  );
}
