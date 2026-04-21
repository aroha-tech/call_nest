import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Alert } from '../components/ui/Alert';
import { SearchInput } from '../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { taskManagerAPI } from '../services/taskManagerAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { usePermissions } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './TaskManagerPage.module.scss';

const scheduleOptions = [
  { value: 'one_time', label: 'Single day' },
  { value: 'date_range', label: 'Date range' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toYmd(d);
}

function ymdFromLocalDatetime(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function toLocalStartAt(ymd) {
  if (!ymd) return '';
  return `${ymd}T00:00`;
}

function toLocalEndAt(ymd) {
  if (!ymd) return '';
  return `${ymd}T23:59`;
}

function toMillis(v) {
  if (!v) return NaN;
  const ms = new Date(String(v).replace(' ', 'T')).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function statusBadgeVariant(status) {
  switch (String(status || '').toLowerCase()) {
    case 'achieved':
      return 'success';
    case 'missed':
      return 'danger';
    case 'in_progress':
      return 'warning';
    case 'pending':
      return 'primary';
    case 'no_task':
      return 'muted';
    default:
      return 'default';
  }
}

function formatStatusLabel(status) {
  const s = String(status || '').replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

function assignmentDisplayStatus(assignment, todayYmd) {
  const base = String(assignment?.status || '').toLowerCase();
  if (['paused', 'cancelled', 'completed'].includes(base)) return base;
  const start = String(assignment?.start_date || '').slice(0, 10);
  const end = String(assignment?.end_date || '').slice(0, 10);
  if (start && todayYmd && start > todayYmd) return 'scheduled';
  if (end && todayYmd && end < todayYmd) return 'ended';
  return base || 'active';
}

function assignmentStatusVariant(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return 'success';
    case 'paused':
      return 'warning';
    case 'cancelled':
      return 'danger';
    case 'scheduled':
      return 'primary';
    case 'ended':
      return 'muted';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}

function assignmentCoversYmd(a, ymd) {
  const sd = String(a?.start_date || '').slice(0, 10);
  const ed = String(a?.end_date || '').slice(0, 10);
  if (!sd || !ed || !ymd) return false;
  return ymd >= sd && ymd <= ed;
}

export function TaskManagerPage() {
  const { canAny } = usePermissions();
  const user = useAppSelector(selectUser);
  const canManage = canAny([PERMISSIONS.TASKS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);
  const role = String(user?.role || '').toLowerCase();
  const isAgentRole = role === 'agent';

  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [mainTab, setMainTab] = useState('today');
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');

  const [todayLogs, setTodayLogs] = useState([]);
  const [upcomingLogs, setUpcomingLogs] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const [loadingShell, setLoadingShell] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [notesModalLog, setNotesModalLog] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    target_calls: 150,
    target_meetings: 2,
    target_deals: 2,
  });
  const [assignForm, setAssignForm] = useState({
    template_id: '',
    title: '',
    description: '',
    assigned_to_user_id: '',
    start_date: '',
    end_date: '',
    schedule_type: 'one_time',
    target_calls: 150,
    target_meetings: 2,
    target_deals: 2,
  });
  const [noteDraft, setNoteDraft] = useState({});
  const [notesModalDraft, setNotesModalDraft] = useState({ agent: '', manager: '' });

  /** Calendar “today” in the browser (must match `task_date` rows in DB). Recomputed each render so it rolls over at midnight. */
  const todayStr = toYmd(new Date());
  const yesterdayStr = addDaysYmd(todayStr, -1);
  const historyFromStr = addDaysYmd(todayStr, -120);

  const showAgentFilter = canManage && !isAgentRole;
  const historyColSpan = showAgentFilter ? 8 : 7;

  // Product rule: if a row exists for today's task_date, show it in Today.
  const effectiveTodayLogs = useMemo(() => todayLogs, [todayLogs]);

  const assignmentsForHints = useMemo(() => {
    if (!agentFilter) return assignments;
    const id = Number(agentFilter);
    if (!Number.isFinite(id) || id <= 0) return assignments;
    return assignments.filter((a) => Number(a.assigned_to_user_id) === id);
  }, [assignments, agentFilter]);

  const todayEmptyHints = useMemo(() => {
    const hints = [];
    const coversToday = assignmentsForHints.filter((a) => assignmentCoversYmd(a, todayStr));
    if (assignmentsForHints.length > 0 && coversToday.length === 0) {
      hints.push(
        `The app is showing today as ${todayStr}. None of the listed assignments include that calendar date (check start/end dates — wrong year is a common reason).`
      );
    }
    if (coversToday.length > 0 && todayLogs.length === 0) {
      hints.push(
        'An assignment covers today, but there are no daily task rows for this date. Remove the assignment and publish again, or recreate it so daily logs are generated.'
      );
    }
    if (showAgentFilter && agentFilter) {
      hints.push('Agent filter is set — you only see tasks for that rep.');
    }
    return hints;
  }, [
    assignmentsForHints,
    todayStr,
    todayLogs.length,
    effectiveTodayLogs.length,
    showAgentFilter,
    agentFilter,
  ]);

  const templateOptions = useMemo(
    () => [{ value: '', label: 'No template (custom)' }, ...templates.map((t) => ({ value: String(t.id), label: t.name }))],
    [templates]
  );

  const agentOptions = useMemo(
    () => [{ value: '', label: 'Select agent' }, ...users.map((u) => ({ value: String(u.id), label: u.name || u.email }))],
    [users]
  );

  const agentFilterOptions = useMemo(() => {
    const allLabel = role === 'manager' ? 'All agents in my team' : 'All agents';
    return [{ value: '', label: allLabel }, ...users.map((u) => ({ value: String(u.id), label: u.name || u.email }))];
  }, [users, role]);

  const userIdParam = useMemo(() => {
    if (isAgentRole) return undefined;
    if (!agentFilter) return undefined;
    const n = Number(agentFilter);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [isAgentRole, agentFilter]);

  const pageDescription = useMemo(() => {
    if (isAgentRole) {
      return 'Your daily targets, upcoming schedule, and past performance in one place. Notes stay visible to you and your manager.';
    }
    if (role === 'manager') {
      return 'Run your team like a CRM workspace: assign targets only to agents who report to you, review today’s execution, and scan history by rep.';
    }
    return 'Create templates, assign work across the tenant, and monitor execution with a clear today / upcoming / history flow.';
  }, [isAgentRole, role]);

  const loadManageCatalog = useCallback(async () => {
    if (!canManage) {
      setUsers([]);
      setTemplates([]);
      setAssignments([]);
      return;
    }
    setLoadingShell(true);
    setError('');
    try {
      const adminAgentParam = role === 'admin' ? { role: 'agent' } : {};
      const assignParams = { limit: 200 };
      if (agentFilter) {
        const aid = Number(agentFilter);
        if (Number.isFinite(aid) && aid > 0) assignParams.userId = aid;
      }
      const [tRes, uRes, aRes] = await Promise.all([
        taskManagerAPI.listTemplates(),
        tenantUsersAPI.getAll({ ...adminAgentParam, limit: 200, page: 1 }),
        taskManagerAPI.listAssignments(assignParams),
      ]);
      setTemplates(tRes?.data?.data || []);
      const raw = uRes?.data?.data || [];
      setUsers(raw.filter((u) => String(u.role || '').toLowerCase() === 'agent'));
      setAssignments(aRes?.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load catalog');
    } finally {
      setLoadingShell(false);
    }
  }, [canManage, role, agentFilter]);

  useEffect(() => {
    loadManageCatalog();
  }, [loadManageCatalog]);

  /** Keep “today” in sync for the hero and Today tab without blocking other tabs. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          from: todayStr,
          to: todayStr,
          limit: 80,
          sort: 'desc',
        });
        if (!cancelled) setTodayLogs(res?.data?.data || []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load today’s tasks');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userIdParam, todayStr]);

  useEffect(() => {
    if (mainTab !== 'upcoming') return undefined;
    let cancelled = false;
    (async () => {
      setLoadingTab(true);
      setError('');
      try {
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          from: todayStr,
          to: addDaysYmd(todayStr, 365),
          limit: 150,
          sort: 'asc',
        });
        if (!cancelled) {
          const rows = res?.data?.data || [];
          const filtered = rows.filter((l) => {
            const day = String(l.task_date || '').slice(0, 10);
            return day > todayStr;
          });
          setUpcomingLogs(filtered);
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load upcoming tasks');
      } finally {
        if (!cancelled) setLoadingTab(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainTab, userIdParam, todayStr]);

  useEffect(() => {
    if (mainTab !== 'history') return undefined;
    let cancelled = false;
    (async () => {
      setLoadingTab(true);
      setError('');
      try {
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          from: historyFromStr,
          to: yesterdayStr,
          page: historyPagination.page,
          limit: historyPagination.limit,
          sort: 'desc',
        });
        if (!cancelled) {
          setHistoryLogs(res?.data?.data || []);
          const pg = res?.data?.pagination;
          if (pg) {
            setHistoryPagination((p) => ({
              ...p,
              total: pg.total ?? p.total,
              page: pg.page ?? p.page,
              totalPages: pg.totalPages ?? p.totalPages,
              limit: pg.limit ?? p.limit,
            }));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load history');
      } finally {
        if (!cancelled) setLoadingTab(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainTab, userIdParam, historyFromStr, yesterdayStr, historyPagination.page, historyPagination.limit]);

  const filteredHistoryLogs = useMemo(() => {
    if (!historyQuery.trim()) return historyLogs;
    const q = historyQuery.toLowerCase();
    return historyLogs.filter((l) =>
      `${l.user_name || ''} ${l.assignment_title || ''} ${l.status || ''}`.toLowerCase().includes(q)
    );
  }, [historyLogs, historyQuery]);

  const todayStats = useMemo(() => {
    let n = effectiveTodayLogs.length;
    let done = 0;
    let risk = 0;
    for (const l of effectiveTodayLogs) {
      if (l.status === 'achieved') done += 1;
      if (l.status === 'missed') risk += 1;
    }
    return { n, done, risk };
  }, [effectiveTodayLogs]);

  async function refetchTaskViews() {
    const common = userIdParam ? { userId: userIdParam } : {};
    try {
      const todayRes = await taskManagerAPI.listDailyLogs({
        ...common,
        from: todayStr,
        to: todayStr,
        limit: 80,
        sort: 'desc',
      });
      setTodayLogs(todayRes?.data?.data || []);
      if (mainTab === 'upcoming') {
        const uRes = await taskManagerAPI.listDailyLogs({
          ...common,
          from: todayStr,
          to: addDaysYmd(todayStr, 365),
          limit: 150,
          sort: 'asc',
        });
        const rows = uRes?.data?.data || [];
        const filtered = rows.filter((l) => {
          const day = String(l.task_date || '').slice(0, 10);
          return day > todayStr;
        });
        setUpcomingLogs(filtered);
      }
      if (mainTab === 'history') {
        const hRes = await taskManagerAPI.listDailyLogs({
          ...common,
          from: historyFromStr,
          to: yesterdayStr,
          page: historyPagination.page,
          limit: historyPagination.limit,
          sort: 'desc',
        });
        setHistoryLogs(hRes?.data?.data || []);
        const pg = hRes?.data?.pagination;
        if (pg) {
          setHistoryPagination((p) => ({
            ...p,
            total: pg.total ?? p.total,
            page: pg.page ?? p.page,
            totalPages: pg.totalPages ?? p.totalPages,
            limit: pg.limit ?? p.limit,
          }));
        }
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to refresh tasks');
    }
  }

  async function onSyncAchievements() {
    setSyncing(true);
    setError('');
    setOk('');
    try {
      await taskManagerAPI.recomputeLogs({
        from: todayStr,
        to: todayStr,
        ...(userIdParam ? { userId: userIdParam } : {}),
      });
      setOk('Live metrics refreshed. Previous pending days were marked missed where applicable.');
      await refetchTaskViews();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  }

  async function onCreateTemplate(e) {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      await taskManagerAPI.createTemplate(templateForm);
      setOk('Template saved to library.');
      setTemplateForm({ name: '', description: '', target_calls: 150, target_meetings: 2, target_deals: 2 });
      setTemplateModalOpen(false);
      await loadManageCatalog();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create template');
    }
  }

  async function onCreateAssignment(e) {
    e.preventDefault();
    setError('');
    setOk('');
    const assignedToUserId = Number(assignForm.assigned_to_user_id);
    if (!Number.isFinite(assignedToUserId) || assignedToUserId <= 0) {
      setError('Select an agent for this assignment.');
      return;
    }
    if (!String(assignForm.title || '').trim()) {
      setError('Task title is required.');
      return;
    }
    if (!assignForm.start_date) {
      setError('Select a date for this task.');
      return;
    }
    if (assignForm.schedule_type === 'date_range' && !assignForm.end_date) {
      setError('Select an end date for the range.');
      return;
    }
    const startDate = assignForm.start_date;
    const endDate = assignForm.schedule_type === 'date_range' ? assignForm.end_date : assignForm.start_date;
    if (startDate > endDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    try {
      const payload = {
        ...assignForm,
        template_id: assignForm.template_id ? Number(assignForm.template_id) : null,
        assigned_to_user_id: assignedToUserId,
        start_date: startDate,
        end_date: endDate,
        start_at: toLocalStartAt(startDate),
        end_at: toLocalEndAt(endDate),
        recurring_pattern: null,
      };
      await taskManagerAPI.createAssignment(payload);
      setOk('Assignment published. Daily rows were generated for the selected day(s).');
      setAssignModalOpen(false);
      setAssignForm((s) => ({
        ...s,
        template_id: '',
        title: '',
        description: '',
        assigned_to_user_id: '',
        start_date: '',
        end_date: '',
        schedule_type: 'one_time',
      }));
      await loadManageCatalog();
      await refetchTaskViews();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create assignment';
      setError(msg);
    }
  }

  async function confirmDeleteAssignment() {
    if (!deleteAssignmentTarget?.id) return;
    setDeletingAssignment(true);
    setError('');
    setOk('');
    try {
      await taskManagerAPI.deleteAssignment(deleteAssignmentTarget.id);
      setOk('Assignment removed. Related daily rows were cleared.');
      setDeleteAssignmentTarget(null);
      await loadManageCatalog();
      await refetchTaskViews();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete assignment');
    } finally {
      setDeletingAssignment(false);
    }
  }

  async function saveNote(log, type) {
    try {
      const text = noteDraft[`${type}-${log.id}`] ?? '';
      if (type === 'agent') await taskManagerAPI.updateAgentNote(log.id, text);
      else await taskManagerAPI.updateManagerNote(log.id, text);
      setOk(type === 'agent' ? 'Agent note saved' : 'Manager note saved');
      await refetchTaskViews();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save note');
    }
  }

  async function saveNotesModal() {
    if (!notesModalLog) return;
    try {
      const ownLog = Number(notesModalLog.user_id) === Number(user?.id);
      if (isAgentRole && ownLog) {
        await taskManagerAPI.updateAgentNote(notesModalLog.id, notesModalDraft.agent || '');
      }
      if (canManage) {
        await taskManagerAPI.updateManagerNote(notesModalLog.id, notesModalDraft.manager || '');
      }
      setOk('Notes updated');
      setNotesModalLog(null);
      await refetchTaskViews();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save notes');
    }
  }

  function openNotesModal(log) {
    setNotesModalLog(log);
    setNotesModalDraft({
      agent: log.agent_note || '',
      manager: log.manager_note || '',
    });
  }

  function applyTemplateSelection(id) {
    const t = templates.find((x) => Number(x.id) === Number(id));
    if (!t) {
      setAssignForm((s) => ({ ...s, template_id: id }));
      return;
    }
    setAssignForm((s) => ({
      ...s,
      template_id: id,
      title: t.name || s.title,
      description: t.description || '',
      target_calls: t.target_calls ?? s.target_calls,
      target_meetings: t.target_meetings ?? s.target_meetings,
      target_deals: t.target_deals ?? s.target_deals,
    }));
  }

  function renderTaskCard(log, { showAgent }) {
    const canEditAgent = isAgentRole && Number(log.user_id) === Number(user?.id);
    const canEditManager = canManage;
    const pct = Math.min(100, Math.max(0, Number(log.completion_percent || 0)));
    const agentLabel = log.user_name || 'Agent';
    return (
      <article key={`${log.id}-${log.task_date}`} className={styles.taskCard}>
        <div className={styles.taskCardTop}>
          <div className={styles.taskCardTitles}>
            <h3 className={styles.taskCardTitle}>{log.assignment_title || 'Task'}</h3>
            <div className={styles.taskCardMeta}>
              <span className={styles.taskCardDate}>
                <MaterialSymbol name="calendar_today" size="sm" />
                {String(log.task_date || '').slice(0, 10)}
              </span>
              {showAgent ? (
                <span className={styles.taskCardAgent}>
                  <MaterialSymbol name="person" size="sm" />
                  {agentLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Badge variant={statusBadgeVariant(log.status)} size="md">
            {formatStatusLabel(log.status)}
          </Badge>
        </div>

        <div className={styles.taskMetrics}>
          <div className={styles.taskMetric}>
            <span className={styles.taskMetricLabel}>Calls</span>
            <span className={styles.taskMetricVal}>
              {log.achieved_calls ?? 0}/{log.target_calls ?? 0}
            </span>
          </div>
          <div className={styles.taskMetric}>
            <span className={styles.taskMetricLabel}>Meetings</span>
            <span className={styles.taskMetricVal}>
              {log.achieved_meetings ?? 0}/{log.target_meetings ?? 0}
            </span>
          </div>
          <div className={styles.taskMetric}>
            <span className={styles.taskMetricLabel}>Deals</span>
            <span className={styles.taskMetricVal}>
              {log.achieved_deals ?? 0}/{log.target_deals ?? 0}
            </span>
          </div>
          <div className={styles.taskMetric}>
            <span className={styles.taskMetricLabel}>Score</span>
            <span className={styles.taskMetricVal}>{Number(log.score || 0).toFixed(0)}</span>
          </div>
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>

        {(canEditAgent || canEditManager) && mainTab !== 'upcoming' ? (
          <div className={styles.inlineNotes}>
            {canEditAgent ? (
              <div className={styles.inlineNoteBlock}>
                <span className={styles.inlineNoteLabel}>Your note</span>
                <Textarea
                  rows={2}
                  value={noteDraft[`agent-${log.id}`] ?? log.agent_note ?? ''}
                  onChange={(e) => setNoteDraft((s) => ({ ...s, [`agent-${log.id}`]: e.target.value }))}
                  placeholder="What moved the needle today?"
                />
                <Button size="sm" variant="secondary" onClick={() => saveNote(log, 'agent')}>
                  Save
                </Button>
              </div>
            ) : null}
            {canEditManager ? (
              <div className={styles.inlineNoteBlock}>
                <span className={styles.inlineNoteLabel}>Manager note</span>
                <Textarea
                  rows={2}
                  value={noteDraft[`manager-${log.id}`] ?? log.manager_note ?? ''}
                  onChange={(e) => setNoteDraft((s) => ({ ...s, [`manager-${log.id}`]: e.target.value }))}
                  placeholder="Coaching context for this day"
                />
                <Button size="sm" variant="secondary" onClick={() => saveNote(log, 'manager')}>
                  Save
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  function renderEmpty(kind, extraHints = []) {
    const copy = {
      today: 'No targets for this day. When a manager assigns you work covering today, it will appear here.',
      upcoming: 'No future scheduled days in the current window. Assignments with later dates show up automatically.',
      history: 'No completed days in this range yet.',
    };
    return (
      <div className={styles.emptyState}>
        <MaterialSymbol name="task_alt" size="lg" className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>Nothing to show</p>
        <p className={styles.emptyText}>{copy[kind]}</p>
        {extraHints.length ? (
          <ul className={styles.emptyHints}>
            {extraHints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Task Manager" description={pageDescription} />

      <div className={styles.alerts}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {ok ? <Alert variant="success">{ok}</Alert> : null}
      </div>

      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <MaterialSymbol name="wb_sunny" size="md" className={styles.heroIcon} />
          <div>
            <div className={styles.heroLabel}>Working day</div>
            <div className={styles.heroValue}>{todayStr}</div>
            <div className={styles.heroHint}>All “today” targets use this calendar date.</div>
          </div>
        </div>
        <div className={styles.heroCard}>
          <MaterialSymbol name="target" size="md" className={styles.heroIcon} />
          <div>
            <div className={styles.heroLabel}>Today at a glance</div>
            <div className={styles.heroValue}>{todayStats.n}</div>
            <div className={styles.heroHint}>
              {todayStats.done} achieved · {todayStats.risk} missed ·{' '}
              {Math.max(0, todayStats.n - todayStats.done - todayStats.risk)} in progress or pending
            </div>
          </div>
        </div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {showAgentFilter ? (
            <div className={styles.filterWrap}>
              <Select
                label="Agent"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                options={agentFilterOptions}
              />
            </div>
          ) : null}
        </div>
        <div className={styles.toolbarRight}>
          {(canManage || isAgentRole) ? (
            <>
              <Button
                variant="secondary"
                className={styles.toolbarBtn}
                onClick={onSyncAchievements}
                loading={syncing}
                disabled={loadingTab}
              >
                <MaterialSymbol name="sync" size="sm" />
                Sync live metrics
              </Button>
              {canManage ? (
                <>
                  <Button variant="secondary" onClick={() => setTemplateModalOpen(true)} disabled={loadingShell}>
                    Template library
                  </Button>
                  <Button variant="primary" className={styles.toolbarBtn} onClick={() => setAssignModalOpen(true)} disabled={loadingShell}>
                    <MaterialSymbol name="assignment_add" size="sm" />
                    New assignment
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <section className={styles.assignmentsSection}>
          <div className={styles.assignmentsSectionHead}>
            <h2 className={styles.assignmentsTitle}>Active assignments</h2>
            <p className={styles.assignmentsSub}>
              Remove a mistaken schedule here. Each agent can have only one active task window at a time (overlapping dates
              are blocked). Call activity still counts the same for any open tasks on the same day.
            </p>
          </div>
          <div className={listStyles.tableCard}>
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Task</TableHeaderCell>
                    <TableHeaderCell>Agent</TableHeaderCell>
                    <TableHeaderCell>Dates</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Targets</TableHeaderCell>
                    <TableHeaderCell align="right"> </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingShell ? (
                    <TableRow>
                      <TableCell colSpan={6} className={styles.muted}>
                        Loading assignments…
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingShell && !assignments.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className={styles.muted}>
                        No assignments yet. Create one with New assignment.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingShell
                    ? assignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.title || '—'}</TableCell>
                          <TableCell>{a.assigned_to_name || '—'}</TableCell>
                          <TableCell>
                            <span className={styles.tableMono}>
                              {String(a.start_date || a.start_at || '').slice(0, 10)} → {String(a.end_date || a.end_at || '').slice(0, 10)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const displayStatus = assignmentDisplayStatus(a, todayStr);
                              return <Badge variant={assignmentStatusVariant(displayStatus)}>{formatStatusLabel(displayStatus)}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell>
                            <span className={styles.tableMono}>
                              {a.target_calls}/{a.target_meetings}/{a.target_deals}
                            </span>
                          </TableCell>
                          <TableCell align="right">
                            <Button size="sm" variant="ghost" onClick={() => setDeleteAssignmentTarget(a)}>
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      ) : null}

      <Tabs>
        <TabList>
          <Tab isActive={mainTab === 'today'} onClick={() => setMainTab('today')}>
            <MaterialSymbol name="today" size="sm" />
            Today
            {effectiveTodayLogs.length ? <span className={styles.tabCount}>{effectiveTodayLogs.length}</span> : null}
          </Tab>
          <Tab isActive={mainTab === 'upcoming'} onClick={() => setMainTab('upcoming')}>
            <MaterialSymbol name="date_range" size="sm" />
            Upcoming
            {upcomingLogs.length ? <span className={styles.tabCount}>{upcomingLogs.length}</span> : null}
          </Tab>
          <Tab isActive={mainTab === 'history'} onClick={() => setMainTab('history')}>
            <MaterialSymbol name="history" size="sm" />
            History
            {historyPagination.total ? <span className={styles.tabCount}>{historyPagination.total}</span> : null}
          </Tab>
        </TabList>

        <TabPanel isActive={mainTab === 'today'}>
          {!effectiveTodayLogs.length ? renderEmpty('today', todayEmptyHints) : null}
          {effectiveTodayLogs.length ? (
            <div className={styles.cardGrid}>
              {effectiveTodayLogs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}
            </div>
          ) : null}
        </TabPanel>

        <TabPanel isActive={mainTab === 'upcoming'}>
          <p className={styles.tabHint}>Scheduled future days from active assignments (nearest dates first).</p>
          {loadingTab ? <p className={styles.muted}>Loading upcoming…</p> : null}
          {!loadingTab && !upcomingLogs.length ? renderEmpty('upcoming') : null}
          {!loadingTab && upcomingLogs.length ? (
            <div className={styles.cardGrid}>{upcomingLogs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}</div>
          ) : null}
        </TabPanel>

        <TabPanel isActive={mainTab === 'history'}>
          <p className={styles.tabHint}>Past working days up to yesterday. Search and paginate like a CRM activity list.</p>
          <div className={listStyles.tableCard}>
            <div className={listStyles.tableCardToolbarTop}>
              <div className={styles.search}>
                <SearchInput
                  value={historyQuery}
                  onSearch={(v) => setHistoryQuery(v)}
                  placeholder="Search history (press Enter)"
                />
              </div>
              <PaginationPageSize
                limit={historyPagination.limit}
                onLimitChange={(n) =>
                  setHistoryPagination((p) => ({
                    ...p,
                    limit: n,
                    page: 1,
                  }))
                }
              />
            </div>
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    {showAgentFilter ? <TableHeaderCell>Agent</TableHeaderCell> : null}
                    <TableHeaderCell>Task</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Done %</TableHeaderCell>
                    <TableHeaderCell>Score</TableHeaderCell>
                    <TableHeaderCell>Targets</TableHeaderCell>
                    <TableHeaderCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingTab ? (
                    <TableRow>
                      <TableCell colSpan={historyColSpan}>Loading…</TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingTab && !filteredHistoryLogs.length ? (
                    <TableRow>
                      <TableCell colSpan={historyColSpan}>
                        <div className={styles.tableEmpty}>{renderEmpty('history')}</div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingTab
                    ? filteredHistoryLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{String(log.task_date || '').slice(0, 10)}</TableCell>
                          {showAgentFilter ? <TableCell>{log.user_name || '—'}</TableCell> : null}
                          <TableCell>{log.assignment_title || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(log.status)}>{formatStatusLabel(log.status)}</Badge>
                          </TableCell>
                          <TableCell>{Number(log.completion_percent || 0).toFixed(1)}%</TableCell>
                          <TableCell>{Number(log.score || 0).toFixed(1)}</TableCell>
                          <TableCell>
                            <span className={styles.tableMono}>
                              {log.achieved_calls}/{log.target_calls} · {log.achieved_meetings}/{log.target_meetings} ·{' '}
                              {log.achieved_deals}/{log.target_deals}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => openNotesModal(log)}>
                              Notes
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>
            <div className={listStyles.tableCardFooterPagination}>
              <Pagination
                page={historyPagination.page}
                totalPages={Math.max(1, historyPagination.totalPages || 1)}
                total={historyPagination.total || 0}
                limit={historyPagination.limit || 20}
                onPageChange={(p) => setHistoryPagination((x) => ({ ...x, page: p }))}
                hidePageSize
              />
            </div>
          </div>
        </TabPanel>
      </Tabs>

      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="New assignment"
        size="lg"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="assign-task-form">
              Publish assignment
            </Button>
          </ModalFooter>
        }
      >
        <form id="assign-task-form" onSubmit={onCreateAssignment} className={styles.modalForm}>
          <p className={styles.modalLead}>
            Choose a single day or a date range. Targets roll into daily rows for each day. Managers may only pick agents on their team.
            Only one task can be assigned to an agent per day — if any day in the selected range already has a task, the save will be blocked.
          </p>
          <div className={styles.formGrid}>
            <Select
              label="Template"
              value={assignForm.template_id}
              onChange={(e) => applyTemplateSelection(e.target.value)}
              options={templateOptions}
            />
            <Select
              label="Agent"
              value={assignForm.assigned_to_user_id}
              onChange={(e) => setAssignForm((s) => ({ ...s, assigned_to_user_id: e.target.value }))}
              options={agentOptions}
            />
            <div className={styles.full}>
              <Input
                label="Task title"
                value={assignForm.title}
                onChange={(e) => setAssignForm((s) => ({ ...s, title: e.target.value }))}
                required
              />
            </div>
            <div className={styles.full}>
              <Textarea
                label="Description"
                value={assignForm.description}
                onChange={(e) => setAssignForm((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <Select
              label="Schedule type"
              value={assignForm.schedule_type}
              onChange={(e) =>
                setAssignForm((s) => ({
                  ...s,
                  schedule_type: e.target.value,
                  end_date: e.target.value === 'one_time' ? s.start_date : s.end_date,
                }))
              }
              options={scheduleOptions}
            />
            <div />
            <Input
              label={assignForm.schedule_type === 'date_range' ? 'Start date' : 'Date'}
              type="date"
              value={assignForm.start_date}
              onChange={(e) =>
                setAssignForm((s) => ({
                  ...s,
                  start_date: e.target.value,
                  end_date: s.schedule_type === 'one_time' ? e.target.value : s.end_date,
                }))
              }
              required
            />
            <Input
              label="End date"
              type="date"
              value={assignForm.end_date}
              onChange={(e) => setAssignForm((s) => ({ ...s, end_date: e.target.value }))}
              required={assignForm.schedule_type === 'date_range'}
              disabled={assignForm.schedule_type !== 'date_range'}
            />
            <Input
              label="Target calls"
              type="number"
              value={assignForm.target_calls}
              onChange={(e) => setAssignForm((s) => ({ ...s, target_calls: Number(e.target.value || 0) }))}
            />
            <Input
              label="Target meetings"
              type="number"
              value={assignForm.target_meetings}
              onChange={(e) => setAssignForm((s) => ({ ...s, target_meetings: Number(e.target.value || 0) }))}
            />
            <Input
              label="Target deals"
              type="number"
              value={assignForm.target_deals}
              onChange={(e) => setAssignForm((s) => ({ ...s, target_deals: Number(e.target.value || 0) }))}
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Template library"
        size="md"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setTemplateModalOpen(false)}>
              Close
            </Button>
            <Button variant="primary" type="submit" form="template-form">
              Save template
            </Button>
          </ModalFooter>
        }
      >
        <form id="template-form" onSubmit={onCreateTemplate} className={styles.modalForm}>
          <p className={styles.modalLead}>Reusable target packs for fast assignment.</p>
          <div className={styles.formGrid}>
            <div className={styles.full}>
              <Input
                label="Template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
                required
              />
            </div>
            <div className={styles.full}>
              <Textarea
                label="Description"
                value={templateForm.description}
                onChange={(e) => setTemplateForm((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <Input
              label="Target calls"
              type="number"
              value={templateForm.target_calls}
              onChange={(e) => setTemplateForm((s) => ({ ...s, target_calls: Number(e.target.value || 0) }))}
            />
            <Input
              label="Target meetings"
              type="number"
              value={templateForm.target_meetings}
              onChange={(e) => setTemplateForm((s) => ({ ...s, target_meetings: Number(e.target.value || 0) }))}
            />
            <Input
              label="Target deals"
              type="number"
              value={templateForm.target_deals}
              onChange={(e) => setTemplateForm((s) => ({ ...s, target_deals: Number(e.target.value || 0) }))}
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!notesModalLog}
        onClose={() => setNotesModalLog(null)}
        title="Day notes"
        size="md"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setNotesModalLog(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveNotesModal}>
              Save notes
            </Button>
          </ModalFooter>
        }
      >
        {notesModalLog ? (
          <div className={styles.modalForm}>
            <p className={styles.modalLead}>
              {notesModalLog.assignment_title} · {String(notesModalLog.task_date || '').slice(0, 10)}
            </p>
            {isAgentRole && Number(notesModalLog.user_id) === Number(user?.id) ? (
              <Textarea
                label="Agent note"
                rows={4}
                value={notesModalDraft.agent}
                onChange={(e) => setNotesModalDraft((s) => ({ ...s, agent: e.target.value }))}
              />
            ) : null}
            {canManage ? (
              <Textarea
                label="Manager note"
                rows={4}
                value={notesModalDraft.manager}
                onChange={(e) => setNotesModalDraft((s) => ({ ...s, manager: e.target.value }))}
              />
            ) : null}
            {!isAgentRole && !canManage ? <p className={styles.muted}>You do not have access to edit these notes.</p> : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteAssignmentTarget}
        onClose={() => {
          if (!deletingAssignment) setDeleteAssignmentTarget(null);
        }}
        onConfirm={confirmDeleteAssignment}
        title="Remove assignment"
        message={
          deleteAssignmentTarget
            ? `Remove "${deleteAssignmentTarget.title || 'Task'}" for ${deleteAssignmentTarget.assigned_to_name || 'agent'} (${String(
                deleteAssignmentTarget.start_at || deleteAssignmentTarget.start_date || ''
              )
                .replace('T', ' ')
                .slice(0, 16)} → ${String(deleteAssignmentTarget.end_at || deleteAssignmentTarget.end_date || '')
                .replace('T', ' ')
                .slice(0, 16)})? This deletes the assignment and its daily rows.`
            : ''
        }
        confirmText="Remove"
        variant="danger"
        loading={deletingAssignment}
      />
    </div>
  );
}
