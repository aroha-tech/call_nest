import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { DateTimePickerField } from '../components/ui/DateTimePickerField';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { MultiSelectDropdown } from '../components/ui/MultiSelectDropdown';
import { Alert } from '../components/ui/Alert';
import { SearchInput } from '../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/ui/Table';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { SlidePanel } from '../components/ui/SlidePanel';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { InfoHelpIcon } from '../components/ui/InfoHelpIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { taskManagerAPI } from '../services/taskManagerAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { campaignsAPI } from '../services/campaignsAPI';
import { contactTagsAPI } from '../services/contactTagsAPI';
import { emailAccountsAPI } from '../services/emailAPI';
import { usePermissions } from '../hooks/usePermission';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { PERMISSIONS } from '../utils/permissionUtils';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './TaskManagerPage.module.scss';

const scheduleWindowOptions = [
  { value: 'current', label: 'Current' },
  { value: 'upcoming', label: 'Upcoming' },
];

const duePresetOptions = [
  { value: 'in_1_day', label: 'In 1 day' },
  { value: 'in_2_days', label: 'In 2 days' },
  { value: 'in_3_days', label: 'In 3 days' },
  { value: 'in_1_week', label: 'In 1 week' },
  { value: 'in_1_month', label: 'In 1 month' },
  { value: 'custom', label: 'Custom' },
];

const taskTypeOptions = [
  { value: 'todo', label: 'To-do' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'call', label: 'Call' },
  { value: 'deal', label: 'Deal' },
];

/** How daily meeting targets are counted (must match server `meeting_progress_basis`). */
const MEETING_PROGRESS_CARD_CHOICES = [
  {
    value: 'scheduled_date',
    title: 'Meeting day',
    badge: 'Held / attended',
    description:
      'Counts meetings whose scheduled start falls on the same calendar day as this task. Use this when the goal is for reps to actually run meetings on that day.',
    example: 'Task = Mon → meeting Mon 3pm counts. Booking Mon for Fri counts toward Fri’s task, not Mon’s.',
    icon: 'event',
  },
  {
    value: 'created_date',
    title: 'Booking day',
    badge: 'Created / logged',
    description:
      'Counts meetings saved in the system on the same calendar day as this task, even if the appointment is on another day. Use this when the goal is daily booking activity.',
    example: 'Task = Mon → create a meeting Mon for next week → it counts toward Mon’s task.',
    icon: 'edit_calendar',
  },
];

function meetingProgressBasisFromLog(log) {
  const b = String(log?.meeting_progress_basis || 'scheduled_date').toLowerCase();
  return b === 'created_date' ? 'created_date' : 'scheduled_date';
}

function meetingMetricMaterialName(basis) {
  return basis === 'created_date' ? 'edit_calendar' : 'event';
}

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const reminderPresetOptions = [
  { value: 'none', label: 'None (No reminder)' },
  { value: '10m', label: '10 minutes before due time' },
  { value: '30m', label: '30 minutes before due time' },
  { value: '1h', label: '1 hour before due time' },
  { value: '1d', label: '1 day before due date' },
  { value: 'custom', label: 'Custom' },
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

/** `to` covers the board day, today, and upcoming rows; `from` is `lookbackDays` before `to`. */
function taskMetricsRecomputeRange(todayYmd, boardYmd, lookbackDays) {
  const to = [boardYmd, todayYmd, addDaysYmd(todayYmd, 90)].reduce((mx, y) => (y > mx ? y : mx));
  return { from: addDaysYmd(to, -lookbackDays), to };
}

function addDaysToToday(delta) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
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

function normalizeNonNegativeIntegerInput(raw, fallback = 0) {
  if (raw == null) return fallback;
  const text = String(raw).trim();
  if (!text) return '';
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return '';
  return String(Math.max(0, Number(digits)));
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
  const key = String(status || '').toLowerCase().replace(/-/g, '_');
  const map = {
    achieved: 'Complete',
    in_progress: 'In progress',
    pending: 'Pending',
    missed: 'Missed',
    no_task: 'No targets',
  };
  if (map[key]) return map[key];
  const s = String(status || '').replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

/** Omit when target is 0; cap display when achieved exceeds target (e.g. 110/100 → 100/100 (+10)). */
function formatAchievedTargetPair(achieved, target) {
  const t = Math.max(0, Number(target) || 0);
  const a = Math.max(0, Number(achieved) || 0);
  if (t <= 0) return null;
  if (a <= t) return { text: `${a}/${t}`, overBy: 0 };
  return { text: `${t}/${t}`, overBy: a - t };
}

function formatRoleLabel(role) {
  const text = String(role || '').trim();
  if (!text) return 'User';
  const spaced = text.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function assignmentDisplayStatus(assignment, todayYmd) {
  const base = String(assignment?.status || '').toLowerCase();
  if (base === 'completed') return 'finished';
  if (['paused', 'cancelled'].includes(base)) return base;
  const start = String(assignment?.start_date || '').slice(0, 10);
  const end = String(assignment?.end_date || '').slice(0, 10);
  if (start && todayYmd && start > todayYmd) return 'scheduled';
  if (end && todayYmd && end < todayYmd) return 'finished';
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
    case 'finished':
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
  const { formatDate, formatDateTime } = useDateTimeDisplay();
  const user = useAppSelector(selectUser);
  const canManage = canAny([PERMISSIONS.TASKS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);
  const role = String(user?.role || '').toLowerCase();
  const isAgentRole = role === 'agent';

  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [mainTab, setMainTab] = useState('current');
  const [managerView, setManagerView] = useState('execution');
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [boardDayPreset, setBoardDayPreset] = useState('today');
  const [boardCustomYmd, setBoardCustomYmd] = useState('');
  const [boardSearch, setBoardSearch] = useState('');
  const [boardSort, setBoardSort] = useState('priority');
  const [loadingExecutionBoard, setLoadingExecutionBoard] = useState(false);

  const [todayLogs, setTodayLogs] = useState([]);
  const [upcomingLogs, setUpcomingLogs] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

  const [loadingShell, setLoadingShell] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [notesModalLog, setNotesModalLog] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [commentsModalAssignment, setCommentsModalAssignment] = useState(null);
  const [assignmentComments, setAssignmentComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [noteHistory, setNoteHistory] = useState([]);
  const [noteHistoryLoading, setNoteHistoryLoading] = useState(false);
  const [historyTargetsLog, setHistoryTargetsLog] = useState(null);
  const [taskDetailsLog, setTaskDetailsLog] = useState(null);
  const chatScrollTimersRef = useRef({});

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
    assigned_to_user_id: user?.id ? String(user.id) : '',
    start_date: '',
    end_date: '',
    schedule_window: 'current',
    task_type: 'todo',
    meeting_progress_basis: 'scheduled_date',
    priority: 'medium',
    due_preset: '',
    reminder_preset: 'none',
    reminder_custom_value: 15,
    reminder_custom_unit: 'minutes',
    reminder_at: '',
    notes: '',
    suggestion_campaign_ids: '',
    suggestion_tag_ids: '',
    suggestion_email_account_ids: '',
    target_calls: 150,
    target_meetings: 2,
    target_deals: 2,
  });
  const [notesModalDraft, setNotesModalDraft] = useState({ agent: '', manager: '' });

  /** Calendar “today” in the browser (must match `task_date` rows in DB). Recomputed each render so it rolls over at midnight. */
  const todayStr = toYmd(new Date());
  const todayDisplay = formatDate(todayStr);

  const boardAnchorYmd = useMemo(() => {
    if (boardDayPreset === 'yesterday') return addDaysYmd(todayStr, -1);
    if (boardDayPreset === 'custom' && boardCustomYmd) return ymdFromLocalDatetime(boardCustomYmd) || todayStr;
    return todayStr;
  }, [todayStr, boardDayPreset, boardCustomYmd]);

  const boardDateDisplay = formatDate(boardAnchorYmd);

  const currentUserNameLower = String(user?.name || user?.email || '').trim().toLowerCase();
  const executionSyncKeyRef = useRef('');

  useEffect(
    () => () => {
      Object.values(chatScrollTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      chatScrollTimersRef.current = {};
    },
    []
  );

  const showAgentFilter = canManage && !isAgentRole;
  const showExecutionBoard = !canManage || managerView === 'execution';
  const showAssignmentsBoard = canManage && managerView === 'assignments';
  const historyColSpan = showAgentFilter ? 8 : 7;

  const filteredBoardLogs = useMemo(() => {
    const q = boardSearch.trim().toLowerCase();
    if (!q) return todayLogs;
    return todayLogs.filter((l) =>
      `${l.user_name || ''} ${l.assignment_title || ''}`.toLowerCase().includes(q)
    );
  }, [todayLogs, boardSearch]);

  const effectiveTodayLogs = useMemo(() => {
    const list = [...filteredBoardLogs];
    const pr = { high: 0, medium: 1, low: 2 };
    if (boardSort === 'priority') {
      list.sort(
        (a, b) =>
          (pr[String(a.assignment_priority || '').toLowerCase()] ?? 1) -
          (pr[String(b.assignment_priority || '').toLowerCase()] ?? 1)
      );
    } else if (boardSort === 'score') {
      list.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    } else {
      list.sort((a, b) => String(a.assignment_title || '').localeCompare(String(b.assignment_title || ''), undefined, { sensitivity: 'base' }));
    }
    return list;
  }, [filteredBoardLogs, boardSort]);

  const assignmentsForHints = useMemo(() => {
    if (!agentFilter) return assignments;
    const id = Number(agentFilter);
    if (!Number.isFinite(id) || id <= 0) return assignments;
    return assignments.filter((a) => Number(a.assigned_to_user_id) === id);
  }, [assignments, agentFilter]);

  const todayEmptyHints = useMemo(() => {
    const hints = [];
    const coversDay = assignmentsForHints.filter((a) => assignmentCoversYmd(a, boardAnchorYmd));
    if (assignmentsForHints.length > 0 && coversDay.length === 0) {
      hints.push(
        `Tasks are filtered to ${boardDateDisplay}. None of the listed assignments include that calendar date (check start/end dates — wrong year is a common reason).`
      );
    }
    if (coversDay.length > 0 && todayLogs.length === 0) {
      hints.push(
        'An assignment covers this date, but there are no daily task rows for it. Remove the assignment and publish again, or recreate it so daily logs are generated.'
      );
    }
    if (showAgentFilter && agentFilter) {
      hints.push('Agent filter is set — you only see tasks for that rep.');
    }
    return hints;
  }, [assignmentsForHints, boardAnchorYmd, boardDateDisplay, todayLogs.length, showAgentFilter, agentFilter]);

  const duePresetOptionsWithDate = useMemo(() => {
    const map = {
      in_1_day: 1,
      in_2_days: 2,
      in_3_days: 3,
      in_1_week: 7,
      in_1_month: 30,
    };
    return duePresetOptions.map((opt) => {
      if (opt.value === 'custom') return { ...opt, label: 'Custom (choose due date below)' };
      const d = map[opt.value];
      const target = addDaysToToday(d || 0);
      return { ...opt, label: `${opt.label} (${target} 23:59 local)` };
    });
  }, [todayStr]);

  const agentOptions = useMemo(
    () => {
      const roleNow = String(user?.role || '').toLowerCase();
      const opts = [];
      if (user?.id) {
        opts.push({ value: String(user.id), label: 'Self' });
      }
      const scopedUsers = users.filter((u) => {
        const uRole = String(u.role || '').toLowerCase();
        if (roleNow === 'manager') return ['agent', 'manager'].includes(uRole);
        return ['agent', 'manager'].includes(uRole);
      });
      opts.push(
        ...scopedUsers
          .filter((u) => Number(u.id) !== Number(user?.id))
          .map((u) => ({ value: String(u.id), label: `${u.name || u.email} (${u.role})` }))
      );
      return opts;
    },
    [users, user]
  );

  const campaignOptions = useMemo(
    () => campaigns.map((c) => ({ value: String(c.id), label: c.name || `Campaign #${c.id}` })),
    [campaigns]
  );
  const tagOptions = useMemo(
    () => contactTags.map((t) => ({ value: String(t.id), label: t.name || `Tag #${t.id}` })),
    [contactTags]
  );
  const emailAccountOptions = useMemo(
    () =>
      emailAccounts.map((a) => ({
        value: String(a.id),
        label: a.email || a.email_address || a.display_name || `Account #${a.id}`,
      })),
    [emailAccounts]
  );

  const agentFilterOptions = useMemo(() => {
    const allLabel = role === 'manager' ? 'All assignments' : 'All assignees';
    const options = [{ value: '', label: allLabel }];
    if (user?.id) {
      options.push({ value: String(user.id), label: `Self (${user.name || user.email || 'Me'})` });
    }
    for (const u of users) {
      if (Number(u.id) === Number(user?.id)) continue;
      options.push({ value: String(u.id), label: `${u.name || u.email} (${u.role})` });
    }
    return options;
  }, [users, role, user]);

  const userIdParam = useMemo(() => {
    if (isAgentRole) return undefined;
    if (!agentFilter) return undefined;
    const n = Number(agentFilter);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [isAgentRole, agentFilter]);

  const refreshTabCounts = useCallback(async () => {
    const common = userIdParam ? { userId: userIdParam } : {};
    try {
      const [up, hi] = await Promise.all([
        taskManagerAPI.listDailyLogs({ ...common, view: 'upcoming', limit: 1, sort: 'asc' }),
        taskManagerAPI.listDailyLogs({ ...common, view: 'history', limit: 1, sort: 'desc', page: 1 }),
      ]);
      setUpcomingTotal(Number(up?.data?.pagination?.total ?? 0));
      setHistoryTotal(Number(hi?.data?.pagination?.total ?? 0));
    } catch {
      /* keep previous totals */
    }
  }, [userIdParam]);

  const pageDescription = useMemo(() => {
    if (isAgentRole) {
      return 'Your targets, schedule, and history—notes visible to you and your manager.';
    }
    if (role === 'manager') {
      return 'Targets and execution for your team: assign, review today, and browse history by rep.';
    }
    return 'Templates, assignments, and execution across the tenant (today / upcoming / history).';
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
      const assignParams = { limit: 200 };
      if (agentFilter) {
        const aid = Number(agentFilter);
        if (Number.isFinite(aid) && aid > 0) assignParams.userId = aid;
      }
      const [tRes, uRes, aRes, cRes, tagRes, eaRes] = await Promise.allSettled([
        taskManagerAPI.listTemplates(),
        tenantUsersAPI.getAll({ limit: 200, page: 1 }),
        taskManagerAPI.listAssignments(assignParams),
        campaignsAPI.list({ page: 1, limit: 200 }),
        contactTagsAPI.list(),
        emailAccountsAPI.getAll(false),
      ]);
      if (tRes.status !== 'fulfilled' || uRes.status !== 'fulfilled' || aRes.status !== 'fulfilled') {
        throw new Error('Failed to load task setup data');
      }
      setTemplates(tRes.value?.data?.data || []);
      const raw = uRes.value?.data?.data || [];
      setUsers(raw.filter((u) => ['agent', 'manager'].includes(String(u.role || '').toLowerCase())));
      setAssignments(aRes.value?.data?.data || []);
      setCampaigns(cRes.status === 'fulfilled' ? cRes.value?.data?.data || [] : []);
      setContactTags(tagRes.status === 'fulfilled' ? tagRes.value?.data?.data || [] : []);
      setEmailAccounts(eaRes.status === 'fulfilled' ? eaRes.value?.data?.data || [] : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load catalog');
    } finally {
      setLoadingShell(false);
    }
  }, [canManage, role, agentFilter]);

  useEffect(() => {
    loadManageCatalog();
  }, [loadManageCatalog]);

  useEffect(() => {
    if (!assignModalOpen) return;
    if (assignForm.assigned_to_user_id) return;
    if (!user?.id) return;
    setAssignForm((s) => ({ ...s, assigned_to_user_id: String(user.id) }));
  }, [assignModalOpen, assignForm.assigned_to_user_id, user]);

  /** Recompute when user or calendar day changes; refresh execution board when Current tab is active. */
  useEffect(() => {
    let cancelled = false;
    const syncKey = `${userIdParam ?? ''}|${todayStr}|${boardAnchorYmd}`;
    const shouldRecompute = executionSyncKeyRef.current !== syncKey;

    (async () => {
      try {
        setError('');
        if (shouldRecompute) {
          setSyncing(true);
          const { from: recomputeFrom, to: recomputeTo } = taskMetricsRecomputeRange(todayStr, boardAnchorYmd, 120);
          await taskManagerAPI.recomputeLogs({
            from: recomputeFrom,
            to: recomputeTo,
            ...(userIdParam ? { userId: userIdParam } : {}),
          });
          if (cancelled) return;
          executionSyncKeyRef.current = syncKey;
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to sync task metrics');
      } finally {
        if (!cancelled) setSyncing(false);
      }

      if (!cancelled) {
        await refreshTabCounts();
      }

      if (cancelled || mainTab !== 'current') return;

      try {
        setLoadingExecutionBoard(true);
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          view: 'current',
          as_of: boardAnchorYmd,
          limit: 80,
          sort: 'desc',
        });
        if (!cancelled) setTodayLogs(res?.data?.data || []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load tasks for this day');
      } finally {
        if (!cancelled) setLoadingExecutionBoard(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainTab, userIdParam, todayStr, boardAnchorYmd, refreshTabCounts]);

  useEffect(() => {
    if (mainTab !== 'upcoming') return undefined;
    let cancelled = false;
    (async () => {
      setLoadingTab(true);
      setError('');
      try {
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          view: 'upcoming',
          limit: 150,
          sort: 'asc',
        });
        if (!cancelled) setUpcomingLogs(res?.data?.data || []);
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
          view: 'history',
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
  }, [mainTab, userIdParam, historyPagination.page, historyPagination.limit]);

  const filteredHistoryLogs = useMemo(() => {
    if (!historyQuery.trim()) return historyLogs;
    const q = historyQuery.toLowerCase();
    return historyLogs.filter((l) =>
      `${l.user_name || ''} ${l.assignment_title || ''} ${l.status || ''}`.toLowerCase().includes(q)
    );
  }, [historyLogs, historyQuery]);

  const todayStats = useMemo(() => {
    let n = todayLogs.length;
    let done = 0;
    let risk = 0;
    for (const l of todayLogs) {
      if (l.status === 'achieved') done += 1;
      if (l.status === 'missed') risk += 1;
    }
    return { n, done, risk };
  }, [todayLogs]);

  const currentBuckets = useMemo(() => {
    const pending = [];
    const inProgress = [];
    const complete = [];
    for (const log of effectiveTodayLogs) {
      const s = String(log.status || '').toLowerCase();
      if (s === 'achieved') complete.push(log);
      else if (s === 'in_progress' || s === 'missed') inProgress.push(log);
      else pending.push(log);
    }
    return { pending, inProgress, complete };
  }, [effectiveTodayLogs]);

  const visibleKanbanColumns = useMemo(() => {
    const defs = [
      {
        columnKey: 'pending',
        title: 'Pending',
        dotClass: styles.kanbanDotPending,
        variantClass: styles.kanbanColumnPending,
        logs: currentBuckets.pending,
      },
      {
        columnKey: 'in_progress',
        title: 'In progress',
        dotClass: styles.kanbanDotInProgress,
        variantClass: styles.kanbanColumnProgress,
        logs: currentBuckets.inProgress,
      },
      {
        columnKey: 'complete',
        title: 'Completed',
        dotClass: styles.kanbanDotComplete,
        variantClass: styles.kanbanColumnComplete,
        logs: currentBuckets.complete,
      },
    ];
    return defs.filter((d) => d.logs.length > 0);
  }, [currentBuckets]);

  async function refetchTaskViews() {
    const common = userIdParam ? { userId: userIdParam } : {};
    try {
      const todayRes = await taskManagerAPI.listDailyLogs({
        ...common,
        view: 'current',
        as_of: boardAnchorYmd,
        limit: 80,
        sort: 'desc',
      });
      setTodayLogs(todayRes?.data?.data || []);
      if (mainTab === 'upcoming') {
        const uRes = await taskManagerAPI.listDailyLogs({
          ...common,
          view: 'upcoming',
          limit: 150,
          sort: 'asc',
        });
        setUpcomingLogs(uRes?.data?.data || []);
      }
      if (mainTab === 'history') {
        const hRes = await taskManagerAPI.listDailyLogs({
          ...common,
          view: 'history',
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
    await refreshTabCounts();
  }

  async function onSyncAchievements() {
    setSyncing(true);
    setError('');
    setOk('');
    try {
      const { from, to } = taskMetricsRecomputeRange(todayStr, boardAnchorYmd, 365);
      await taskManagerAPI.recomputeLogs({
        from,
        to,
        ...(userIdParam ? { userId: userIdParam } : {}),
      });
      setOk('Live metrics refreshed.');
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
    const submitAction = e?.nativeEvent?.submitter?.value === 'add-another' ? 'add-another' : 'publish';
    const keepModalOpen = submitAction === 'add-another';
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
    const startDate = assignForm.start_date;
    let computedStartDate = startDate;
    let endDate = assignForm.end_date;
    if (assignForm.schedule_window === 'current') {
      computedStartDate = todayStr;
      if (!assignForm.due_preset) {
        setError('Select due date preset for current tasks.');
        return;
      }
      const map = {
        in_1_day: 1,
        in_2_days: 2,
        in_3_days: 3,
        in_1_week: 7,
        in_1_month: 30,
      };
      const d = map[assignForm.due_preset];
      if (assignForm.due_preset === 'custom') {
        if (!assignForm.end_date) {
          setError('Select a due date for custom option.');
          return;
        }
        endDate = assignForm.end_date;
      } else {
        if (!d) {
          setError('Current tasks require one due date preset.');
          return;
        }
        endDate = addDaysToToday(d);
      }
    }
    if (assignForm.schedule_window === 'upcoming' && !computedStartDate) {
      setError('Select a start date.');
      return;
    }
    if (assignForm.schedule_window === 'upcoming' && !endDate) {
      setError('Select a due date.');
      return;
    }
    if (computedStartDate > endDate) {
      setError('Due date must be on or after start date.');
      return;
    }
    if (computedStartDate < todayStr || endDate < todayStr) {
      setError('Past dates are not allowed.');
      return;
    }
    let targetCalls = Number(assignForm.target_calls || 0);
    let targetMeetings = Number(assignForm.target_meetings || 0);
    let targetDeals = Number(assignForm.target_deals || 0);
    if (assignForm.task_type === 'call') {
      targetMeetings = 0;
      targetDeals = 0;
    } else if (assignForm.task_type === 'meeting') {
      targetCalls = 0;
      targetDeals = 0;
    } else if (assignForm.task_type === 'deal') {
      targetCalls = 0;
      targetMeetings = 0;
    }
    if (assignForm.task_type === 'meeting' && targetMeetings <= 0) {
      setError('Target meetings must be greater than 0 for Meeting tasks.');
      return;
    }
    if (assignForm.task_type === 'call' && targetCalls <= 0) {
      setError('Target calls must be greater than 0 for Call tasks.');
      return;
    }
    if (assignForm.task_type === 'deal' && targetDeals <= 0) {
      setError('Target deals must be greater than 0 for Deal tasks.');
      return;
    }
    if (assignForm.task_type === 'todo' && targetCalls <= 0 && targetMeetings <= 0 && targetDeals <= 0) {
      setError('Add at least one target greater than 0 before publishing this task.');
      return;
    }
    let reminderAt = null;
    if (assignForm.reminder_preset !== 'none') {
      const dueBase = new Date(`${endDate}T23:59:00`);
      const map = { '10m': 10 * 60 * 1000, '30m': 30 * 60 * 1000, '1h': 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000 };
      let delta = map[assignForm.reminder_preset] || 0;
      if (assignForm.reminder_preset === 'custom') {
        const v = Math.max(1, Number(assignForm.reminder_custom_value || 1));
        const unitMs = assignForm.reminder_custom_unit === 'days' ? 86400000 : assignForm.reminder_custom_unit === 'hours' ? 3600000 : 60000;
        delta = v * unitMs;
      }
      reminderAt = new Date(dueBase.getTime() - delta);
    }
    try {
      const payload = {
        ...assignForm,
        template_id: null,
        assigned_to_user_id: assignedToUserId,
        start_date: computedStartDate,
        end_date: endDate,
        start_at: toLocalStartAt(computedStartDate),
        end_at: toLocalEndAt(endDate),
        description: assignForm.notes || assignForm.description || '',
        associated_meeting_id: null,
        reminder_at: reminderAt ? `${toYmd(reminderAt)} ${pad2(reminderAt.getHours())}:${pad2(reminderAt.getMinutes())}:00` : null,
        schedule_type: assignForm.schedule_window === 'upcoming' ? 'date_range' : 'one_time',
        target_calls: targetCalls,
        target_meetings: targetMeetings,
        target_deals: targetDeals,
        suggestion_campaign_ids: ['todo', 'call'].includes(assignForm.task_type) ? assignForm.suggestion_campaign_ids : '',
        suggestion_tag_ids: ['todo', 'call'].includes(assignForm.task_type) ? assignForm.suggestion_tag_ids : '',
        suggestion_email_account_ids:
          ['todo', 'meeting'].includes(assignForm.task_type) ? assignForm.suggestion_email_account_ids : '',
        repeat_enabled: false,
        repeat_interval_days: null,
        recurring_pattern: null,
      };
      await taskManagerAPI.createAssignment(payload);
      setOk('Assignment published. Daily rows were generated for the selected day(s).');
      if (!keepModalOpen) setAssignModalOpen(false);
      setAssignForm((s) => ({
        ...s,
        template_id: '',
        title: '',
        description: '',
        assigned_to_user_id: user?.id ? String(user.id) : '',
        start_date: '',
        end_date: '',
        schedule_window: 'current',
        task_type: 'todo',
        priority: 'medium',
        due_preset: '',
        meeting_progress_basis: 'scheduled_date',
        reminder_preset: 'none',
        reminder_custom_value: 15,
        reminder_custom_unit: 'minutes',
        reminder_at: '',
        notes: '',
        suggestion_campaign_ids: '',
        suggestion_tag_ids: '',
        suggestion_email_account_ids: '',
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
      setNoteHistoryLoading(true);
      const historyRes = await taskManagerAPI.listNoteHistory(notesModalLog.id);
      setNoteHistory(historyRes?.data?.data || []);
      await refetchTaskViews();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save notes');
    } finally {
      setNoteHistoryLoading(false);
    }
  }

  async function openCommentsModal(assignment) {
    setCommentsModalAssignment(assignment);
    setCommentDraft('');
    setCommentsLoading(true);
    try {
      const res = await taskManagerAPI.listAssignmentComments(assignment.id);
      setAssignmentComments(res?.data?.data || []);
      scheduleChatScroll(`modal-${assignment.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load comments');
      setAssignmentComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitAssignmentComment() {
    if (!commentsModalAssignment?.id) return;
    const text = String(commentDraft || '').trim();
    if (!text) return;
    try {
      await taskManagerAPI.addAssignmentComment(commentsModalAssignment.id, text);
      setCommentDraft('');
      const res = await taskManagerAPI.listAssignmentComments(commentsModalAssignment.id);
      setAssignmentComments(res?.data?.data || []);
      scheduleChatScroll(`modal-${commentsModalAssignment.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to post comment');
    }
  }

  function scheduleChatScroll(threadId) {
    if (!threadId) return;
    const key = String(threadId);
    const pending = chatScrollTimersRef.current[key];
    if (pending) clearTimeout(pending);
    chatScrollTimersRef.current[key] = setTimeout(() => {
      const thread = document.querySelector(`[data-chat-thread="${key}"]`);
      if (thread) thread.scrollTop = thread.scrollHeight;
      delete chatScrollTimersRef.current[key];
    }, 30);
  }

  function onCommentKeyDown(e, sendHandler) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    sendHandler();
  }

  function isOwnComment(comment) {
    const currentUserId = Number(user?.id);
    const authorId = Number(comment?.created_by);
    if (Number.isFinite(currentUserId) && currentUserId > 0 && Number.isFinite(authorId) && authorId > 0) {
      return authorId === currentUserId;
    }
    const authorNameLower = String(comment?.author_name || '').trim().toLowerCase();
    if (authorNameLower && currentUserNameLower) {
      return authorNameLower === currentUserNameLower;
    }
    return false;
  }

  function resolveCommentRole(comment) {
    const directRole = String(comment?.author_role || '').trim();
    if (directRole) return directRole;

    const authorId = Number(comment?.created_by);
    if (Number.isFinite(authorId) && authorId > 0) {
      const byId = users.find((u) => Number(u?.id) === authorId);
      if (byId?.role) return String(byId.role);
    }

    const authorNameLower = String(comment?.author_name || '').trim().toLowerCase();
    if (authorNameLower) {
      const byName = users.find((u) => String(u?.name || '').trim().toLowerCase() === authorNameLower);
      if (byName?.role) return String(byName.role);
    }

    if (isOwnComment(comment) && user?.role) return String(user.role);
    return 'user';
  }

  function commentAuthorLabel(comment) {
    const own = isOwnComment(comment);
    const displayName = own ? (user?.name || user?.email || comment?.author_name || 'You') : (comment?.author_name || 'User');
    const roleText = formatRoleLabel(resolveCommentRole(comment));
    return own ? `${displayName} (${roleText}) • You` : `${displayName} (${roleText})`;
  }

  function initialsFromName(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return 'U';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }

  async function openNotesModal(log) {
    setNotesModalLog(log);
    setNotesModalDraft({
      agent: log.agent_note || '',
      manager: log.manager_note || '',
    });
    setNoteHistoryLoading(true);
    try {
      const res = await taskManagerAPI.listNoteHistory(log.id);
      setNoteHistory(res?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load note history');
      setNoteHistory([]);
    } finally {
      setNoteHistoryLoading(false);
    }
  }

  function openTaskDetailsModal(log) {
    setTaskDetailsLog(log);
  }

  function renderTaskCard(log, { showAgent }) {
    const agentLabel = log.user_name || 'Agent';
    const pct = Math.min(100, Math.max(0, Number(log.completion_percent || 0)));
    const callsP = formatAchievedTargetPair(log.achieved_calls, log.target_calls);
    const meetP = formatAchievedTargetPair(log.achieved_meetings, log.target_meetings);
    const dealsP = formatAchievedTargetPair(log.achieved_deals, log.target_deals);
    const meetBasis = meetingProgressBasisFromLog(log);
    const meetIcon = meetingMetricMaterialName(meetBasis);
    const meetTitle =
      meetBasis === 'created_date'
        ? 'Meetings booked on this task date (by created date)'
        : 'Meetings scheduled on this task date (start date)';
    return (
      <article key={`${log.id}-${log.task_date}`} className={styles.taskCard}>
        <div className={styles.taskCardTop}>
          <div className={styles.taskCardTitles}>
            <h3 className={styles.taskCardTitle}>{log.assignment_title || 'Task'}</h3>
            <div className={styles.taskCardMeta}>
              <span className={styles.taskCardDate}>
                <MaterialSymbol name="calendar_today" size="sm" className={styles.taskCardMetaIcon} />
                {formatDate(log.task_date)}
              </span>
              {showAgent ? (
                <span className={styles.taskCardAgent}>
                  <MaterialSymbol name="person" size="sm" className={styles.taskCardMetaIcon} />
                  {agentLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Badge variant={statusBadgeVariant(log.status)} size="md">
            {formatStatusLabel(log.status)}
          </Badge>
        </div>

        <div className={`${styles.taskMetricsIconsRow} ${styles.taskCardMetricsRow}`}>
          {callsP ? (
            <div
              className={`${styles.metricChip} ${styles.metricChipCompact} ${styles.metricChipCalls}`}
              title={callsP.overBy ? `Achieved ${log.achieved_calls} (target ${log.target_calls})` : undefined}
            >
              <MaterialSymbol name="call" className={`${styles.metricChipIcon} ${styles.taskCardMetricGlyph}`} />
              <span className={styles.metricChipText}>
                {callsP.text}
                {callsP.overBy > 0 ? <span className={styles.metricChipExtra}>+{callsP.overBy}</span> : null}
              </span>
            </div>
          ) : null}
          {meetP ? (
            <div
              className={`${styles.metricChip} ${styles.metricChipCompact} ${styles.metricChipMeetings}`}
              title={
                meetP.overBy
                  ? `${meetTitle} — achieved ${log.achieved_meetings} (target ${log.target_meetings})`
                  : meetTitle
              }
            >
              <MaterialSymbol name={meetIcon} className={`${styles.metricChipIcon} ${styles.taskCardMetricGlyph}`} />
              <span className={styles.metricChipText}>
                {meetP.text}
                {meetP.overBy > 0 ? <span className={styles.metricChipExtra}>+{meetP.overBy}</span> : null}
              </span>
            </div>
          ) : null}
          {dealsP ? (
            <div
              className={`${styles.metricChip} ${styles.metricChipCompact} ${styles.metricChipDeals}`}
              title={dealsP.overBy ? `Achieved ${log.achieved_deals} (target ${log.target_deals})` : undefined}
            >
              <MaterialSymbol name="payments" className={`${styles.metricChipIcon} ${styles.taskCardMetricGlyph}`} />
              <span className={styles.metricChipText}>
                {dealsP.text}
                {dealsP.overBy > 0 ? <span className={styles.metricChipExtra}>+{dealsP.overBy}</span> : null}
              </span>
            </div>
          ) : null}
          <div className={`${styles.metricChip} ${styles.metricChipCompact} ${styles.metricChipScore}`}>
            <MaterialSymbol name="target" className={`${styles.metricChipIcon} ${styles.taskCardMetricGlyph}`} />
            <span className={styles.metricChipText}>{Number(log.score || 0).toFixed(0)}</span>
          </div>
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.taskCardActions}>
          <div className={styles.taskCardActionsLeft}>
            <Button
              size="xs"
              variant="ghost"
              className={styles.taskCardIconBtn}
              onClick={() => openNotesModal(log)}
              title="Notes"
              aria-label="Open notes"
            >
              <MaterialSymbol name="sticky_note_2" className={styles.taskCardActionIcon} />
            </Button>
            {log.assignment_id ? (
              <Button
                size="xs"
                variant="ghost"
                className={styles.taskCardIconBtn}
                title="Comments"
                aria-label="Open comments"
                onClick={() =>
                  openCommentsModal({
                    id: log.assignment_id,
                    title: log.assignment_title,
                    task_date: log.task_date,
                    meeting_progress_basis: log.meeting_progress_basis,
                    status: log.status,
                    score: log.score,
                    achieved_calls: log.achieved_calls,
                    target_calls: log.target_calls,
                    achieved_meetings: log.achieved_meetings,
                    target_meetings: log.target_meetings,
                    achieved_deals: log.achieved_deals,
                    target_deals: log.target_deals,
                    notes: log.agent_note || log.manager_note || '',
                  })
                }
              >
                <MaterialSymbol name="chat_bubble" className={styles.taskCardActionIcon} />
              </Button>
            ) : null}
          </div>
          <button type="button" className={styles.viewDetailsLink} onClick={() => openTaskDetailsModal(log)}>
            View details →
          </button>
        </div>
      </article>
    );
  }

  function renderKanbanColumn({ title, dotClass, variantClass, logs }) {
    return (
      <div className={`${styles.kanbanColumn} ${variantClass}`}>
        <header className={styles.kanbanColumnHead}>
          <span className={`${styles.kanbanDot} ${dotClass}`} aria-hidden />
          <h3 className={styles.kanbanColumnTitle}>{title}</h3>
          <span className={styles.kanbanCount}>{logs.length}</span>
        </header>
        <div className={styles.kanbanCards}>{logs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}</div>
      </div>
    );
  }

  function renderEmpty(kind, extraHints = []) {
    const copy = {
      current: 'No tasks are active for today. When an assignment window includes today, it will appear here.',
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

  function renderExecutionBoardSkeleton() {
    return (
      <div className={styles.boardSkeleton} aria-busy="true" aria-label="Loading task board">
        <div
          className={styles.kanbanBoard}
          style={{ '--kanban-cols': 3 }}
        >
          {[0, 1, 2].map((col) => (
            <div key={`board-skel-col-${col}`} className={`${styles.kanbanColumn} ${styles.kanbanColumnSkeleton}`}>
              <div className={styles.boardSkeletonColumnHead}>
                <Skeleton width={10} height={10} circle className={styles.boardSkeletonDot} />
                <Skeleton width="52%" height={14} />
                <Skeleton width={28} height={22} className={styles.boardSkeletonCount} />
              </div>
              <div className={styles.boardSkeletonCard}>
                <Skeleton width="78%" height={16} />
                <Skeleton width="55%" height={12} />
                <div className={styles.boardSkeletonMetrics}>
                  <Skeleton width={56} height={24} className={styles.boardSkeletonPill} />
                  <Skeleton width={52} height={24} className={styles.boardSkeletonPill} />
                  <Skeleton width={40} height={24} className={styles.boardSkeletonPill} />
                </div>
                <Skeleton width="100%" height={6} className={styles.boardSkeletonProgress} />
                <div className={styles.boardSkeletonCardActions}>
                  <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
                  <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
                  <Skeleton width={72} height={14} className={styles.boardSkeletonLink} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderUpcomingSkeleton() {
    return (
      <div className={styles.cardGrid} aria-busy="true" aria-label="Loading upcoming tasks">
        {[0, 1, 2].map((i) => (
          <div key={`up-skel-${i}`} className={styles.upcomingSkeletonCard}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={12} />
            <div className={styles.boardSkeletonMetrics}>
              <Skeleton width={56} height={24} className={styles.boardSkeletonPill} />
              <Skeleton width={52} height={24} className={styles.boardSkeletonPill} />
              <Skeleton width={40} height={24} className={styles.boardSkeletonPill} />
            </div>
            <Skeleton width="100%" height={6} className={styles.boardSkeletonProgress} />
            <div className={styles.boardSkeletonCardActions}>
              <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
              <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
              <Skeleton width={72} height={14} className={styles.boardSkeletonLink} />
            </div>
          </div>
        ))}
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
          <div className={styles.heroBody}>
            <div className={styles.heroLabel}>
              <span>Working day</span>
              <InfoHelpIcon
                title="Working day info"
                modalTitle="Working day"
                message="All today targets use this calendar date."
              />
            </div>
            <div className={styles.heroValue}>{boardDateDisplay}</div>
            <p className={styles.heroSubtext}>
              {boardAnchorYmd === todayStr
                ? 'All today targets use this calendar date.'
                : `Viewing task rows for ${boardDateDisplay}. Switch the board date filter to return to today.`}
            </p>
          </div>
        </div>
        <div className={styles.heroCard}>
          <MaterialSymbol name="target" size="md" className={styles.heroIcon} />
          <div className={styles.heroBody}>
            <div className={styles.heroLabel}>
              <span>{boardAnchorYmd === todayStr ? 'Today at a glance' : 'Day at a glance'}</span>
              <InfoHelpIcon
                title="Day stats"
                modalTitle={boardAnchorYmd === todayStr ? 'Today at a glance' : 'Day at a glance'}
                message={`${boardDateDisplay}: ${todayStats.done} complete${
                  todayStats.risk > 0 ? ` · ${todayStats.risk} missed` : ''
                } · ${Math.max(0, todayStats.n - todayStats.done - todayStats.risk)} in progress or pending (all tasks for this date, not filtered by search).`}
              />
            </div>
            <div className={styles.heroValue}>{todayStats.n}</div>
            <div className={styles.glanceStats}>
              <span className={styles.glanceStatDone}>{todayStats.done} Complete</span>
              {todayStats.risk > 0 ? (
                <span className={styles.glanceStatMissed}>{todayStats.risk} Missed</span>
              ) : null}
              <span className={styles.glanceStatPending}>
                {Math.max(0, todayStats.n - todayStats.done - todayStats.risk)} In progress or pending
              </span>
            </div>
          </div>
        </div>
      </section>

      {canManage ? (
        <section className={styles.managerSwitchSection}>
          <Tabs>
            <TabList>
              <Tab isActive={managerView === 'execution'} onClick={() => setManagerView('execution')}>
                <MaterialSymbol name="dashboard" size="sm" />
                Execution board
              </Tab>
              <Tab isActive={managerView === 'assignments'} onClick={() => setManagerView('assignments')}>
                <MaterialSymbol name="assignment" size="sm" />
                Active assignments
              </Tab>
            </TabList>
          </Tabs>
        </section>
      ) : null}

      {(showExecutionBoard || showAssignmentsBoard) ? (
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {showAgentFilter ? (
              <div className={styles.filterWrap}>
                <Select
                label="Assignee"
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
                {canManage && (showAssignmentsBoard || showExecutionBoard) ? (
                  <Button variant="primary" className={styles.toolbarBtn} onClick={() => setAssignModalOpen(true)} disabled={loadingShell}>
                    <MaterialSymbol name="assignment_add" size="sm" />
                    New assignment
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {showAssignmentsBoard ? (
        <section className={styles.assignmentsSection}>
          <div className={styles.assignmentsSectionHead}>
            <h2 className={styles.assignmentsTitle}>
              <span>Active assignments</span>
              <InfoHelpIcon
                title="Active assignments info"
                modalTitle="Active assignments"
                message="Remove a mistaken schedule here. Multiple assignments can overlap the same dates or the same day for an agent; daily logs and metrics stay tied to each assignment. Delete a row if it was created by mistake."
              />
            </h2>
          </div>
          <div className={listStyles.tableCard}>
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Task</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Priority</TableHeaderCell>
                    <TableHeaderCell>Assign to</TableHeaderCell>
                    <TableHeaderCell>Dates</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Targets</TableHeaderCell>
                    <TableHeaderCell align="right"> </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingShell ? (
                    <TableRow>
                      <TableCell colSpan={8} className={styles.muted}>
                        Loading assignments…
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingShell && !assignments.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className={styles.muted}>
                        No assignments yet. Create one with New assignment.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loadingShell
                    ? assignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.title || '—'}</TableCell>
                          <TableCell>{formatStatusLabel(a.task_type)}</TableCell>
                          <TableCell>{formatStatusLabel(a.priority)}</TableCell>
                          <TableCell>{a.assigned_to_name || '—'}</TableCell>
                          <TableCell>
                            <span className={styles.tableMono}>
                              {formatDate(a.start_date || a.start_at)} → {formatDate(a.end_date || a.end_at)}
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
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openCommentsModal(a)}
                              title="Comments"
                              aria-label="Open comments"
                            >
                              <MaterialSymbol name="chat_bubble" size="sm" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteAssignmentTarget(a)}
                              title="Remove"
                              aria-label="Remove assignment"
                            >
                              <MaterialSymbol name="delete" size="sm" />
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

      {showExecutionBoard ? (
        <Tabs>
          <TabList>
            <Tab isActive={mainTab === 'current'} onClick={() => setMainTab('current')}>
              <MaterialSymbol name="event_available" size="sm" />
              Current
              <span className={styles.tabCount}>{todayLogs.length}</span>
            </Tab>
            <Tab isActive={mainTab === 'upcoming'} onClick={() => setMainTab('upcoming')}>
              <MaterialSymbol name="date_range" size="sm" />
              Upcoming
              <span className={styles.tabCount}>{upcomingTotal}</span>
            </Tab>
            <Tab isActive={mainTab === 'history'} onClick={() => setMainTab('history')}>
              <MaterialSymbol name="history" size="sm" />
              History
              <span className={styles.tabCount}>{historyTotal}</span>
            </Tab>
          </TabList>

          <TabPanel isActive={mainTab === 'current'}>
            <div className={styles.executionBoardShell}>
              <div className={styles.boardToolbar}>
                <div className={styles.boardToolbarSearch}>
                  <SearchInput
                    value={boardSearch}
                    onSearch={(v) => setBoardSearch(v)}
                    placeholder="Search tasks… (press Enter)"
                  />
                </div>
                <div className={styles.boardToolbarFilters}>
                  <Select
                    label="Date"
                    value={boardDayPreset}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBoardDayPreset(v);
                      if (v === 'custom' && !boardCustomYmd) setBoardCustomYmd(todayStr);
                    }}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                      { value: 'custom', label: 'Custom date' },
                    ]}
                  />
                  {boardDayPreset === 'custom' ? (
                    <Input
                      label="Pick date"
                      type="date"
                      value={boardCustomYmd || ''}
                      onChange={(e) => setBoardCustomYmd(e.target.value)}
                      className={styles.boardCustomDate}
                    />
                  ) : null}
                  <Select
                    label="Sort by"
                    value={boardSort}
                    onChange={(e) => setBoardSort(e.target.value)}
                    options={[
                      { value: 'priority', label: 'Priority' },
                      { value: 'score', label: 'Score' },
                      { value: 'title', label: 'Task name' },
                    ]}
                  />
                </div>
              </div>
              {loadingExecutionBoard ? renderExecutionBoardSkeleton() : null}
              {!loadingExecutionBoard && !todayLogs.length ? renderEmpty('current', todayEmptyHints) : null}
              {!loadingExecutionBoard && todayLogs.length && !effectiveTodayLogs.length ? (
                <div className={styles.boardNoSearchHits}>
                  <p>No tasks match your search. Clear the search box or try different keywords.</p>
                </div>
              ) : null}
              {!loadingExecutionBoard && effectiveTodayLogs.length ? (
                <div
                  className={styles.kanbanBoard}
                  style={{ '--kanban-cols': visibleKanbanColumns.length }}
                >
                  {visibleKanbanColumns.map((col) => renderKanbanColumn(col))}
                </div>
              ) : null}
            </div>
          </TabPanel>

          <TabPanel isActive={mainTab === 'upcoming'}>
            {loadingTab ? renderUpcomingSkeleton() : null}
            {!loadingTab && !upcomingLogs.length ? renderEmpty('upcoming') : null}
            {!loadingTab && upcomingLogs.length ? (
              <div className={styles.cardGrid}>{upcomingLogs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}</div>
            ) : null}
          </TabPanel>

          <TabPanel isActive={mainTab === 'history'}>
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
                  {loadingTab
                    ? [0, 1, 2, 3, 4, 5].map((i) => (
                        <TableRow key={`hist-skel-${i}`}>
                          <TableCell>
                            <Skeleton height={14} width={72} />
                          </TableCell>
                          {showAgentFilter ? (
                            <TableCell>
                              <Skeleton height={14} width="80%" />
                            </TableCell>
                          ) : null}
                          <TableCell>
                            <Skeleton height={14} width="70%" />
                          </TableCell>
                          <TableCell>
                            <Skeleton height={24} width={76} />
                          </TableCell>
                          <TableCell>
                            <Skeleton height={14} width={40} />
                          </TableCell>
                          <TableCell>
                            <Skeleton height={14} width={36} />
                          </TableCell>
                          <TableCell>
                            <Skeleton width={26} height={26} circle className={styles.historyTargetsSkeletonIcon} />
                          </TableCell>
                          <TableCell>
                            <div className={styles.historyRowActions}>
                              <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
                              <Skeleton width={26} height={26} className={styles.boardSkeletonIconBtn} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
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
                          <TableCell>{formatDate(log.task_date)}</TableCell>
                          {showAgentFilter ? <TableCell>{log.user_name || '—'}</TableCell> : null}
                          <TableCell>{log.assignment_title || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(log.status)}>{formatStatusLabel(log.status)}</Badge>
                          </TableCell>
                          <TableCell>{Number(log.completion_percent || 0).toFixed(1)}%</TableCell>
                          <TableCell>{Number(log.score || 0).toFixed(1)}</TableCell>
                          <TableCell>
                            <div className={styles.historyTargetsCell}>
                              <Button
                                size="xs"
                                variant="ghost"
                                className={styles.historyTargetsIconBtn}
                                onClick={() => setHistoryTargetsLog(log)}
                                title="View targets"
                                aria-label="View targets"
                              >
                                <MaterialSymbol name="visibility" size="sm" className={styles.historyTargetsIconGlyph} />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={styles.historyRowActions}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openNotesModal(log)}
                                title="Notes"
                                aria-label="Open notes"
                              >
                                <MaterialSymbol name="sticky_note_2" size="sm" />
                              </Button>
                              {log.assignment_id ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Comments"
                                  aria-label="Open comments"
                                  onClick={() =>
                                    openCommentsModal({
                                      id: log.assignment_id,
                                      title: log.assignment_title,
                                      task_date: log.task_date,
                                      meeting_progress_basis: log.meeting_progress_basis,
                                      status: log.status,
                                      score: log.score,
                                      achieved_calls: log.achieved_calls,
                                      target_calls: log.target_calls,
                                      achieved_meetings: log.achieved_meetings,
                                      target_meetings: log.target_meetings,
                                      achieved_deals: log.achieved_deals,
                                      target_deals: log.target_deals,
                                      notes: log.agent_note || log.manager_note || '',
                                    })
                                  }
                                >
                                  <MaterialSymbol name="chat_bubble" size="sm" />
                                </Button>
                              ) : null}
                            </div>
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
      ) : null}

      <SlidePanel
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="New task"
        size="xl"
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
            <Button
              variant="secondary"
              type="submit"
              form="assign-task-form"
              value="add-another"
            >
              Create & add another
            </Button>
          </ModalFooter>
        }
      >
        <form id="assign-task-form" onSubmit={onCreateAssignment} className={styles.modalForm}>
          <p className={styles.modalLead}>
            Create tasks in sequence: who to assign, when it should run, task type, targets, reminders, notes.
          </p>
          <div className={styles.formGrid}>
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>
                <span>1) Assign</span>
                <InfoHelpIcon title="Assign step info" modalTitle="Assign" message="Assign user and add a clear title." />
              </h4>
            </div>
            <Select
              label="Assign to"
              value={assignForm.assigned_to_user_id}
              onChange={(e) => setAssignForm((s) => ({ ...s, assigned_to_user_id: e.target.value }))}
              options={agentOptions}
              required
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
              <h4 className={styles.formSectionTitle}>
                <span>2) Type and priority</span>
                <InfoHelpIcon
                  title="Type and priority info"
                  modalTitle="Type and priority"
                  message="Pick task type first, then set priority."
                />
              </h4>
            </div>
            <Select
              label="Type"
              value={assignForm.task_type}
              onChange={(e) =>
                setAssignForm((s) => ({
                  ...s,
                  task_type: e.target.value,
                  meeting_progress_basis:
                    e.target.value === 'meeting' ? s.meeting_progress_basis : 'scheduled_date',
                }))
              }
              options={taskTypeOptions}
              required
            />
            <Select
              label="Priority"
              value={assignForm.priority}
              onChange={(e) => setAssignForm((s) => ({ ...s, priority: e.target.value }))}
              options={priorityOptions}
              required
            />
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>
                <span>3) Schedule and reminder</span>
                <InfoHelpIcon
                  title="Schedule step info"
                  modalTitle="Schedule and reminder"
                  message="Current uses due-in options, upcoming uses start + due date."
                />
              </h4>
            </div>
            <Select
              label="Task window"
              value={assignForm.schedule_window}
              onChange={(e) => setAssignForm((s) => ({ ...s, schedule_window: e.target.value }))}
              options={scheduleWindowOptions}
              required
            />
            {assignForm.schedule_window === 'current' ? (
              <>
                <Select
                  label="Due in"
                  value={assignForm.due_preset}
                  onChange={(e) => setAssignForm((s) => ({ ...s, due_preset: e.target.value }))}
                  options={duePresetOptionsWithDate}
                  required
                />
                {assignForm.due_preset === 'custom' ? (
                  <DateTimePickerField
                    label="Custom due date"
                    mode="date"
                    value={assignForm.end_date}
                    min={todayStr}
                    onChange={(v) => setAssignForm((s) => ({ ...s, end_date: v }))}
                    required
                  />
                ) : null}
              </>
            ) : (
              <>
                <DateTimePickerField
                  label="Start date"
                  mode="date"
                  value={assignForm.start_date}
                  min={todayStr}
                  onChange={(v) => setAssignForm((s) => ({ ...s, start_date: v }))}
                  required
                />
                <DateTimePickerField
                  label="Due date"
                  mode="date"
                  value={assignForm.end_date}
                  min={assignForm.start_date || todayStr}
                  onChange={(v) => setAssignForm((s) => ({ ...s, end_date: v }))}
                  required
                />
              </>
            )}
            <Select
              label="Reminder"
              value={assignForm.reminder_preset}
              onChange={(e) => setAssignForm((s) => ({ ...s, reminder_preset: e.target.value }))}
              options={reminderPresetOptions}
            />
            {assignForm.reminder_preset === 'custom' ? (
              <>
                <Input
                  label="Remind before"
                  type="number"
                  min={1}
                  value={assignForm.reminder_custom_value}
                  onChange={(e) => setAssignForm((s) => ({ ...s, reminder_custom_value: Number(e.target.value || 1) }))}
                />
                <Select
                  label="Custom unit"
                  value={assignForm.reminder_custom_unit}
                  onChange={(e) => setAssignForm((s) => ({ ...s, reminder_custom_unit: e.target.value }))}
                  options={[
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                  ]}
                />
              </>
            ) : null}
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>
                <span>4) Meeting and targets</span>
                <InfoHelpIcon
                  title="Targets step info"
                  modalTitle="Meeting and targets"
                  message={
                    assignForm.task_type === 'todo'
                      ? 'To-do tracks calls, meetings, and deals. At least one target must be greater than zero (fields without a star are optional individually, but not all three may be zero). When meeting targets are used, choose whether progress counts meetings held on the task date or meetings booked (created) that day.'
                      : assignForm.task_type === 'meeting'
                        ? 'Meeting tasks only track meetings; target meetings is required. Choose meeting day vs booking day so progress matches how your team works.'
                        : assignForm.task_type === 'call'
                          ? 'Call tasks only track calls; target calls is required.'
                          : 'Deal tasks only track deals; target deals is required.'
                  }
                />
              </h4>
            </div>
            {assignForm.task_type === 'todo' || assignForm.task_type === 'meeting' ? (
              <>
                <div className={styles.full}>
                  <MultiSelectDropdown
                    label="Suggested email accounts"
                    options={emailAccountOptions}
                    value={assignForm.suggestion_email_account_ids}
                    onChange={(v) => setAssignForm((s) => ({ ...s, suggestion_email_account_ids: v }))}
                    placeholder="Select one or more email accounts"
                  />
                </div>
              </>
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'call' ? (
              <>
                <div className={styles.full}>
                  <MultiSelectDropdown
                    label="Suggested campaigns"
                    options={campaignOptions}
                    value={assignForm.suggestion_campaign_ids}
                    onChange={(v) => setAssignForm((s) => ({ ...s, suggestion_campaign_ids: v }))}
                    placeholder="Select one or more campaigns"
                  />
                </div>
                <div className={styles.full}>
                  <MultiSelectDropdown
                    label="Suggested tags"
                    options={tagOptions}
                    value={assignForm.suggestion_tag_ids}
                    onChange={(v) => setAssignForm((s) => ({ ...s, suggestion_tag_ids: v }))}
                    placeholder="Select one or more tags"
                  />
                </div>
              </>
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'call' ? (
              <Input
                label="Target calls"
                type="number"
                value={assignForm.target_calls}
                onChange={(e) =>
                  setAssignForm((s) => ({
                    ...s,
                    target_calls: normalizeNonNegativeIntegerInput(e.target.value, s.target_calls),
                  }))
                }
                required={assignForm.task_type === 'call'}
              />
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'meeting' ? (
              <Input
                label="Target meetings"
                type="number"
                value={assignForm.target_meetings}
                onChange={(e) =>
                  setAssignForm((s) => ({
                    ...s,
                    target_meetings: normalizeNonNegativeIntegerInput(e.target.value, s.target_meetings),
                  }))
                }
                required={assignForm.task_type === 'meeting'}
              />
            ) : null}
            {assignForm.task_type === 'meeting' ||
            (assignForm.task_type === 'todo' && Number(assignForm.target_meetings) > 0) ? (
              <div className={styles.full}>
                <div className={styles.meetingBasisField}>
                  <div className={styles.meetingBasisFieldHead}>
                    <span className={styles.meetingBasisFieldLabel}>Meeting targets</span>
                    <InfoHelpIcon
                      title="How meeting counting works"
                      modalTitle="Meeting day vs booking day"
                      message="Both options compare meetings to the task’s calendar date (the day shown on each task row). Meeting day looks at when the meeting is scheduled to start. Booking day looks at when the meeting record was created. Choose the one that matches how you measure rep performance."
                    />
                  </div>
                  <p className={styles.meetingBasisIntro}>
                    Choose what “hitting the meeting target” means for this assignment. The task date is always the row’s
                    calendar day.
                  </p>
                  <div
                    className={styles.meetingBasisChoices}
                    role="radiogroup"
                    aria-label="How meeting targets are counted"
                  >
                    {MEETING_PROGRESS_CARD_CHOICES.map((c) => {
                      const selected = assignForm.meeting_progress_basis === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`${styles.meetingBasisCard} ${selected ? styles.meetingBasisCardSelected : ''}`}
                          onClick={() => setAssignForm((s) => ({ ...s, meeting_progress_basis: c.value }))}
                        >
                          <span className={styles.meetingBasisCardTop}>
                            <span
                              className={`${styles.meetingBasisIconWrap} ${
                                c.value === 'created_date'
                                  ? styles.meetingBasisIconWrapCreated
                                  : styles.meetingBasisIconWrapScheduled
                              }`}
                            >
                              <MaterialSymbol name={c.icon} className={styles.meetingBasisIcon} />
                            </span>
                            <span className={styles.meetingBasisCardTitles}>
                              <span className={styles.meetingBasisCardTitleRow}>
                                <span className={styles.meetingBasisCardTitle}>{c.title}</span>
                                <span className={styles.meetingBasisCardBadge}>{c.badge}</span>
                              </span>
                              <span className={styles.meetingBasisCardTagline}>
                                {c.value === 'scheduled_date'
                                  ? 'By scheduled start time'
                                  : 'By date the meeting was saved'}
                              </span>
                            </span>
                            <span className={`${styles.meetingBasisRadio} ${selected ? styles.meetingBasisRadioOn : ''}`} aria-hidden />
                          </span>
                          <p className={styles.meetingBasisCardDesc}>{c.description}</p>
                          <p className={styles.meetingBasisCardExample}>
                            <MaterialSymbol name="lightbulb" className={styles.meetingBasisExampleIcon} />
                            {c.example}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'deal' ? (
              <Input
                label="Target deals"
                type="number"
                value={assignForm.target_deals}
                onChange={(e) =>
                  setAssignForm((s) => ({
                    ...s,
                    target_deals: normalizeNonNegativeIntegerInput(e.target.value, s.target_deals),
                  }))
                }
                required={assignForm.task_type === 'deal'}
              />
            ) : null}
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>
                <span>5) Notes</span>
                <InfoHelpIcon title="Notes step info" modalTitle="Notes" message="Add context for the assignee." />
              </h4>
            </div>
            <div className={styles.full}>
              <Textarea
                label="Notes"
                value={assignForm.notes}
                onChange={(e) => setAssignForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </SlidePanel>

      <Modal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Template library"
        size="xl"
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
        isOpen={!!taskDetailsLog}
        onClose={() => setTaskDetailsLog(null)}
        title="Task details"
        size="md"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setTaskDetailsLog(null)}>
              Close
            </Button>
            {taskDetailsLog ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const log = taskDetailsLog;
                    setTaskDetailsLog(null);
                    void openNotesModal(log);
                  }}
                >
                  <MaterialSymbol name="sticky_note_2" size="sm" />
                  Notes
                </Button>
                {taskDetailsLog.assignment_id ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const log = taskDetailsLog;
                      if (!log?.assignment_id) return;
                      setTaskDetailsLog(null);
                      openCommentsModal({
                        id: log.assignment_id,
                        title: log.assignment_title,
                        task_date: log.task_date,
                        meeting_progress_basis: log.meeting_progress_basis,
                        status: log.status,
                        score: log.score,
                        achieved_calls: log.achieved_calls,
                        target_calls: log.target_calls,
                        achieved_meetings: log.achieved_meetings,
                        target_meetings: log.target_meetings,
                        achieved_deals: log.achieved_deals,
                        target_deals: log.target_deals,
                        notes: log.agent_note || log.manager_note || '',
                      });
                    }}
                  >
                    <MaterialSymbol name="chat_bubble" size="sm" />
                    Comments
                  </Button>
                ) : null}
              </>
            ) : null}
          </ModalFooter>
        }
      >
        {taskDetailsLog ? (
          <div className={styles.taskDetailsModal}>
            <div className={styles.taskDetailsModalHead}>
              <h3 className={styles.taskDetailsTitle}>{taskDetailsLog.assignment_title || 'Task'}</h3>
              <Badge variant={statusBadgeVariant(taskDetailsLog.status)} size="md">
                {formatStatusLabel(taskDetailsLog.status)}
              </Badge>
            </div>
            <div className={styles.taskDetailsMeta}>
              <span>
                <MaterialSymbol name="calendar_today" size="sm" />
                {formatDate(taskDetailsLog.task_date)}
              </span>
              {taskDetailsLog.user_name ? (
                <span>
                  <MaterialSymbol name="person" size="sm" />
                  {taskDetailsLog.user_name}
                </span>
              ) : null}
              {taskDetailsLog.assignment_priority ? (
                <span>
                  <MaterialSymbol name="flag" size="sm" />
                  {formatStatusLabel(taskDetailsLog.assignment_priority)} priority
                </span>
              ) : null}
            </div>
            {taskDetailsLog.assignment_start_date || taskDetailsLog.assignment_end_date ? (
              <p className={styles.taskDetailsRange}>
                Assignment window:{' '}
                {taskDetailsLog.assignment_start_date
                  ? formatDate(taskDetailsLog.assignment_start_date)
                  : taskDetailsLog.assignment_start_at
                    ? formatDate(taskDetailsLog.assignment_start_at)
                    : '—'}{' '}
                →{' '}
                {taskDetailsLog.assignment_end_date
                  ? formatDate(taskDetailsLog.assignment_end_date)
                  : taskDetailsLog.assignment_end_at
                    ? formatDate(taskDetailsLog.assignment_end_at)
                    : '—'}
              </p>
            ) : null}
            {Number(taskDetailsLog.target_meetings) > 0 ? (
              <p className={styles.formSectionHint}>
                <MaterialSymbol name={meetingMetricMaterialName(meetingProgressBasisFromLog(taskDetailsLog))} size="sm" />{' '}
                Meeting progress:{' '}
                {meetingProgressBasisFromLog(taskDetailsLog) === 'created_date'
                  ? 'counts meetings you booked on this task date (created that day), regardless of when the meeting starts.'
                  : 'counts meetings scheduled to start on this task date.'}
              </p>
            ) : null}
            <div className={styles.taskMetricsIconsRow}>
              {(() => {
                const log = taskDetailsLog;
                const callsP = formatAchievedTargetPair(log.achieved_calls, log.target_calls);
                const meetP = formatAchievedTargetPair(log.achieved_meetings, log.target_meetings);
                const dealsP = formatAchievedTargetPair(log.achieved_deals, log.target_deals);
                const mb = meetingProgressBasisFromLog(log);
                const mi = meetingMetricMaterialName(mb);
                return (
                  <>
                    {callsP ? (
                      <div className={`${styles.metricChip} ${styles.metricChipCalls}`}>
                        <MaterialSymbol name="call" size="sm" className={styles.metricChipIcon} />
                        <span className={styles.metricChipText}>
                          {callsP.text}
                          {callsP.overBy > 0 ? <span className={styles.metricChipExtra}>+{callsP.overBy}</span> : null}
                        </span>
                      </div>
                    ) : null}
                    {meetP ? (
                      <div
                        className={`${styles.metricChip} ${styles.metricChipMeetings}`}
                        title={
                          mb === 'created_date'
                            ? 'Meetings booked on this task date'
                            : 'Meetings held on this task date (scheduled start)'
                        }
                      >
                        <MaterialSymbol name={mi} size="sm" className={styles.metricChipIcon} />
                        <span className={styles.metricChipText}>
                          {meetP.text}
                          {meetP.overBy > 0 ? <span className={styles.metricChipExtra}>+{meetP.overBy}</span> : null}
                        </span>
                      </div>
                    ) : null}
                    {dealsP ? (
                      <div className={`${styles.metricChip} ${styles.metricChipDeals}`}>
                        <MaterialSymbol name="payments" size="sm" className={styles.metricChipIcon} />
                        <span className={styles.metricChipText}>
                          {dealsP.text}
                          {dealsP.overBy > 0 ? <span className={styles.metricChipExtra}>+{dealsP.overBy}</span> : null}
                        </span>
                      </div>
                    ) : null}
                    <div className={`${styles.metricChip} ${styles.metricChipScore}`}>
                      <MaterialSymbol name="target" size="sm" className={styles.metricChipIcon} />
                      <span className={styles.metricChipText}>{Number(log.score || 0).toFixed(0)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${Math.min(100, Math.max(0, Number(taskDetailsLog.completion_percent || 0)))}%`,
                }}
              />
            </div>
            <p className={styles.taskDetailsDonePct}>
              Done {Number(taskDetailsLog.completion_percent || 0).toFixed(1)}% · Daily log
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!historyTargetsLog}
        onClose={() => setHistoryTargetsLog(null)}
        title="Targets"
        size="sm"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setHistoryTargetsLog(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {historyTargetsLog ? (
          <div className={styles.targetsDetailModal}>
            <p className={styles.modalLead}>
              {historyTargetsLog.assignment_title || 'Task'} · {formatDate(historyTargetsLog.task_date)}
            </p>
            <div className={styles.taskMetrics}>
              {(() => {
                const log = historyTargetsLog;
                const c = formatAchievedTargetPair(log.achieved_calls, log.target_calls);
                const m = formatAchievedTargetPair(log.achieved_meetings, log.target_meetings);
                const d = formatAchievedTargetPair(log.achieved_deals, log.target_deals);
                const hb = meetingProgressBasisFromLog(log);
                return (
                  <>
                    {c ? (
                      <div className={styles.taskMetric}>
                        <span className={styles.taskMetricLabel}>Calls</span>
                        <span className={styles.taskMetricVal}>
                          {c.text}
                          {c.overBy > 0 ? ` (+${c.overBy})` : ''}
                        </span>
                      </div>
                    ) : null}
                    {m ? (
                      <div className={styles.taskMetric}>
                        <span className={styles.taskMetricLabel}>
                          Meetings ({hb === 'created_date' ? 'booking day' : 'meeting day'})
                        </span>
                        <span className={styles.taskMetricVal}>
                          {m.text}
                          {m.overBy > 0 ? ` (+${m.overBy})` : ''}
                        </span>
                      </div>
                    ) : null}
                    {d ? (
                      <div className={styles.taskMetric}>
                        <span className={styles.taskMetricLabel}>Deals</span>
                        <span className={styles.taskMetricVal}>
                          {d.text}
                          {d.overBy > 0 ? ` (+${d.overBy})` : ''}
                        </span>
                      </div>
                    ) : null}
                    <div className={styles.taskMetric}>
                      <span className={styles.taskMetricLabel}>Score</span>
                      <span className={styles.taskMetricVal}>{Number(log.score || 0).toFixed(0)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!notesModalLog}
        onClose={() => {
          setNotesModalLog(null);
          setNoteHistory([]);
          setNoteHistoryLoading(false);
        }}
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
              {notesModalLog.assignment_title} · {formatDate(notesModalLog.task_date)}
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
            <div className={styles.noteHistoryPanel}>
              <p className={styles.inlineNoteLabel}>Notes timeline</p>
              {noteHistoryLoading ? <p className={styles.muted}>Loading notes...</p> : null}
              {!noteHistoryLoading && noteHistory.length === 0 ? <p className={styles.muted}>No notes saved yet.</p> : null}
              {!noteHistoryLoading && noteHistory.length > 0 ? (
                <div className={styles.noteHistoryList}>
                  {noteHistory.map((entry) => (
                    <div key={entry.id} className={styles.noteHistoryItem}>
                      <div className={styles.noteHistoryMeta}>
                        <span>{entry.note_type === 'manager' ? 'Manager note' : 'Agent note'}</span>
                        <span>
                          {(entry.author_name || 'User') + (entry.author_role ? ` (${entry.author_role})` : '')} ·{' '}
                          {formatDateTime(entry.created_at)}
                        </span>
                      </div>
                      <div className={styles.noteHistoryText}>{entry.note_text || '—'}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!commentsModalAssignment}
        onClose={() => setCommentsModalAssignment(null)}
        title="Task comments"
        size="xxl"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setCommentsModalAssignment(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {commentsModalAssignment ? (
          <div className={styles.commentsModalLayout}>
            <section className={styles.commentsMain}>
              <div className={styles.commentsMainHead}>
                <div>
                  <p className={styles.modalLead}>Collaborate and keep track of updates</p>
                </div>
                <div className={styles.commentsSortMeta}>Sort by: Oldest</div>
              </div>
              {commentsLoading ? <p className={styles.muted}>Loading comments...</p> : null}
              {!commentsLoading && assignmentComments.length === 0 ? <p className={styles.muted}>No comments yet.</p> : null}
              {!commentsLoading && assignmentComments.length > 0 ? (
                <div className={styles.chatThread} data-chat-thread={`modal-${commentsModalAssignment.id}`}>
                  {[...assignmentComments].reverse().map((c) => {
                    const authorName = isOwnComment(c) ? (user?.name || user?.email || c?.author_name || 'You') : (c?.author_name || 'User');
                    return (
                      <div key={c.id} className={`${styles.chatMessage} ${isOwnComment(c) ? styles.chatMessageOwn : ''}`}>
                        <div className={styles.chatAvatar}>{initialsFromName(authorName)}</div>
                        <div className={styles.chatContent}>
                          <div className={styles.chatSender}>{commentAuthorLabel(c)}</div>
                          <div className={styles.chatBubble}>{c.comment_text}</div>
                          <div className={styles.chatTime}>{formatDateTime(c.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className={styles.chatComposerRow}>
                <Input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => onCommentKeyDown(e, submitAssignmentComment)}
                  placeholder="Write a comment..."
                />
                <Button variant="primary" onClick={submitAssignmentComment} aria-label="Send comment">
                  <MaterialSymbol name="send" size="sm" />
                </Button>
              </div>
            </section>
            <aside className={styles.commentsSide}>
              <div className={styles.commentTaskCard}>
                <p className={styles.commentSideHeading}>Task details</p>
                <h4 className={styles.commentTaskTitle}>{commentsModalAssignment.title || 'Task'}</h4>
                {commentsModalAssignment.task_date ? (
                  <p className={styles.commentTaskDate}>
                    <MaterialSymbol name="calendar_today" size="sm" />
                    {formatDate(commentsModalAssignment.task_date)}
                  </p>
                ) : (
                  <p className={styles.commentTaskDate}>
                    <MaterialSymbol name="date_range" size="sm" />
                    {commentsModalAssignment.start_date || commentsModalAssignment.start_at
                      ? `${formatDate(commentsModalAssignment.start_date || commentsModalAssignment.start_at)} - ${formatDate(
                          commentsModalAssignment.end_date || commentsModalAssignment.end_at
                        )}`
                      : 'Date not available'}
                  </p>
                )}
                <div className={styles.commentMetricGrid}>
                  <div className={styles.commentMetricTile}>
                    <span className={styles.commentMetricLabel}>Calls</span>
                    <span className={styles.commentMetricValue}>
                      {commentsModalAssignment.achieved_calls ?? 0}/{commentsModalAssignment.target_calls ?? 0}
                    </span>
                  </div>
                  <div className={styles.commentMetricTile}>
                    <span className={styles.commentMetricLabel}>
                      Meetings (
                      {meetingProgressBasisFromLog(commentsModalAssignment) === 'created_date'
                        ? 'booking day'
                        : 'meeting day'}
                      )
                    </span>
                    <span className={styles.commentMetricValue}>
                      {commentsModalAssignment.achieved_meetings ?? 0}/{commentsModalAssignment.target_meetings ?? 0}
                    </span>
                  </div>
                  <div className={styles.commentMetricTile}>
                    <span className={styles.commentMetricLabel}>Deals</span>
                    <span className={styles.commentMetricValue}>
                      {commentsModalAssignment.achieved_deals ?? 0}/{commentsModalAssignment.target_deals ?? 0}
                    </span>
                  </div>
                  <div className={styles.commentMetricTile}>
                    <span className={styles.commentMetricLabel}>Score</span>
                    <span className={styles.commentMetricValue}>{Number(commentsModalAssignment.score || 0).toFixed(0)}</span>
                  </div>
                </div>
                {String(commentsModalAssignment.notes || commentsModalAssignment.description || '').trim() ? (
                  <div className={styles.commentNotesBlock}>
                    <p className={styles.commentSideHeading}>Notes</p>
                    <p className={styles.commentNotesText}>
                      {String(commentsModalAssignment.notes || commentsModalAssignment.description || '').trim()}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className={styles.commentParticipantsCard}>
                <p className={styles.commentSideHeading}>Participants</p>
                <div className={styles.commentParticipantList}>
                  {assignmentComments
                    .reduce((acc, c) => {
                      const name = String(c?.author_name || '').trim();
                      if (!name) return acc;
                      if (!acc.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
                        acc.push({ name, role: formatRoleLabel(resolveCommentRole(c)) });
                      }
                      return acc;
                    }, [])
                    .slice(0, 6)
                    .map((p) => (
                      <div key={`${p.name}-${p.role}`} className={styles.commentParticipantRow}>
                        <span className={styles.chatAvatar}>{initialsFromName(p.name)}</span>
                        <span className={styles.commentParticipantName}>{p.name}</span>
                        <span
                          className={`${styles.commentParticipantRole} ${
                            String(p.role).toLowerCase().includes('admin')
                              ? styles.commentParticipantRoleAdmin
                              : String(p.role).toLowerCase().includes('manager')
                                ? styles.commentParticipantRoleManager
                                : styles.commentParticipantRoleDefault
                          }`}
                        >
                          {p.role}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </aside>
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
            ? `Remove "${deleteAssignmentTarget.title || 'Task'}" for ${deleteAssignmentTarget.assigned_to_name || 'agent'} (${formatDateTime(
                deleteAssignmentTarget.start_at || deleteAssignmentTarget.start_date
              )} → ${formatDateTime(deleteAssignmentTarget.end_at || deleteAssignmentTarget.end_date)})? This deletes the assignment and its daily rows.`
            : ''
        }
        confirmText="Remove"
        variant="danger"
        loading={deletingAssignment}
      />
    </div>
  );
}
