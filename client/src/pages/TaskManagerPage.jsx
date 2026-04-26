import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
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
import { taskManagerAPI } from '../services/taskManagerAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { campaignsAPI } from '../services/campaignsAPI';
import { contactTagsAPI } from '../services/contactTagsAPI';
import { emailAccountsAPI } from '../services/emailAPI';
import { usePermissions } from '../hooks/usePermission';
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
  const [campaigns, setCampaigns] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const [commentsModalAssignment, setCommentsModalAssignment] = useState(null);
  const [assignmentComments, setAssignmentComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);

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
  const [noteDraft, setNoteDraft] = useState({});
  const [notesModalDraft, setNotesModalDraft] = useState({ agent: '', manager: '' });

  /** Calendar “today” in the browser (must match `task_date` rows in DB). Recomputed each render so it rolls over at midnight. */
  const todayStr = toYmd(new Date());

  const showAgentFilter = canManage && !isAgentRole;
  const showExecutionBoard = !canManage || managerView === 'execution';
  const showAssignmentsBoard = canManage && managerView === 'assignments';
  const historyColSpan = showAgentFilter ? 8 : 7;

  // Product rule: if a row exists for today's task_date, show it in Current.
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
    const allLabel = role === 'manager' ? 'All assignees (my team + me)' : 'All assignees';
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

  /** Keep “today” in sync for the hero and Today tab without blocking other tabs. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await taskManagerAPI.listDailyLogs({
          ...(userIdParam ? { userId: userIdParam } : {}),
          view: 'current',
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
        view: 'current',
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
      if (!saveAndAddAnother) setAssignModalOpen(false);
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
    } finally {
      setSaveAndAddAnother(false);
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

  async function openCommentsModal(assignment) {
    setCommentsModalAssignment(assignment);
    setCommentDraft('');
    setCommentsLoading(true);
    try {
      const res = await taskManagerAPI.listAssignmentComments(assignment.id);
      setAssignmentComments(res?.data?.data || []);
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
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to post comment');
    }
  }

  function openNotesModal(log) {
    setNotesModalLog(log);
    setNotesModalDraft({
      agent: log.agent_note || '',
      manager: log.manager_note || '',
    });
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
                {canManage && showAssignmentsBoard ? (
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
                            <Button size="sm" variant="ghost" onClick={() => openCommentsModal(a)}>
                              Comments
                            </Button>
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

      {showExecutionBoard ? (
        <Tabs>
          <TabList>
            <Tab isActive={mainTab === 'current'} onClick={() => setMainTab('current')}>
              <MaterialSymbol name="event_available" size="sm" />
              Current
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

          <TabPanel isActive={mainTab === 'current'}>
            <p className={styles.tabHint}>Tasks in the active window for today ({todayStr}).</p>
            {!effectiveTodayLogs.length ? renderEmpty('current', todayEmptyHints) : null}
            {effectiveTodayLogs.length ? (
              <div className={styles.cardGrid}>
                {effectiveTodayLogs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}
              </div>
            ) : null}
          </TabPanel>

          <TabPanel isActive={mainTab === 'upcoming'}>
            <p className={styles.tabHint}>Tasks with a start date after today are shown here.</p>
            {loadingTab ? <p className={styles.muted}>Loading upcoming…</p> : null}
            {!loadingTab && !upcomingLogs.length ? renderEmpty('upcoming') : null}
            {!loadingTab && upcomingLogs.length ? (
              <div className={styles.cardGrid}>{upcomingLogs.map((log) => renderTaskCard(log, { showAgent: showAgentFilter }))}</div>
            ) : null}
          </TabPanel>

          <TabPanel isActive={mainTab === 'history'}>
            <p className={styles.tabHint}>Finished task days (end date before today) appear here.</p>
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
              onClick={() => setSaveAndAddAnother(true)}
            >
              Create & add another
            </Button>
          </ModalFooter>
        }
      >
        <form id="assign-task-form" onSubmit={onCreateAssignment} className={styles.modalForm}>
          <p className={styles.modalLead}>Create tasks in sequence: who to assign, when it should run, task type, targets, reminders, notes.</p>
          <div className={styles.formGrid}>
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>1) Assign</h4>
              <p className={styles.formSectionHint}>Assign user and add a clear title.</p>
            </div>
            <Select
              label="Assign to"
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
              <h4 className={styles.formSectionTitle}>2) Type and priority</h4>
              <p className={styles.formSectionHint}>Pick task type first, then set priority.</p>
            </div>
            <Select
              label="Type"
              value={assignForm.task_type}
              onChange={(e) => setAssignForm((s) => ({ ...s, task_type: e.target.value }))}
              options={taskTypeOptions}
            />
            <Select
              label="Priority"
              value={assignForm.priority}
              onChange={(e) => setAssignForm((s) => ({ ...s, priority: e.target.value }))}
              options={priorityOptions}
            />
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>3) Schedule and reminder</h4>
              <p className={styles.formSectionHint}>Current uses due-in options, upcoming uses start + due date.</p>
            </div>
            <Select
              label="Task window"
              value={assignForm.schedule_window}
              onChange={(e) => setAssignForm((s) => ({ ...s, schedule_window: e.target.value }))}
              options={scheduleWindowOptions}
            />
            {assignForm.schedule_window === 'current' ? (
              <>
                <Select
                  label="Due in"
                  value={assignForm.due_preset}
                  onChange={(e) => setAssignForm((s) => ({ ...s, due_preset: e.target.value }))}
                  options={duePresetOptionsWithDate}
                />
                {assignForm.due_preset === 'custom' ? (
                  <Input
                    label="Custom due date"
                    type="date"
                    value={assignForm.end_date}
                    min={todayStr}
                    onChange={(e) => setAssignForm((s) => ({ ...s, end_date: e.target.value }))}
                    required
                  />
                ) : null}
              </>
            ) : (
              <>
                <Input
                  label="Start date"
                  type="date"
                  value={assignForm.start_date}
                  min={todayStr}
                  onChange={(e) => setAssignForm((s) => ({ ...s, start_date: e.target.value }))}
                  required
                />
                <Input
                  label="Due date"
                  type="date"
                  value={assignForm.end_date}
                  min={assignForm.start_date || todayStr}
                  onChange={(e) => setAssignForm((s) => ({ ...s, end_date: e.target.value }))}
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
              <h4 className={styles.formSectionTitle}>4) Meeting and targets</h4>
              <p className={styles.formSectionHint}>
                {assignForm.task_type === 'todo'
                  ? 'To-do tracks calls, meetings, and deals.'
                  : assignForm.task_type === 'meeting'
                    ? 'Meeting tasks only track meetings.'
                    : assignForm.task_type === 'call'
                      ? 'Call tasks only track calls.'
                      : 'Deal tasks only track deals.'}
              </p>
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
                onChange={(e) => setAssignForm((s) => ({ ...s, target_calls: Number(e.target.value || 0) }))}
              />
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'meeting' ? (
              <Input
                label="Target meetings"
                type="number"
                value={assignForm.target_meetings}
                onChange={(e) => setAssignForm((s) => ({ ...s, target_meetings: Number(e.target.value || 0) }))}
              />
            ) : null}
            {assignForm.task_type === 'todo' || assignForm.task_type === 'deal' ? (
              <Input
                label="Target deals"
                type="number"
                value={assignForm.target_deals}
                onChange={(e) => setAssignForm((s) => ({ ...s, target_deals: Number(e.target.value || 0) }))}
              />
            ) : null}
            <div className={styles.full}>
              <h4 className={styles.formSectionTitle}>5) Notes</h4>
              <p className={styles.formSectionHint}>Add context for the assignee.</p>
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

      <Modal
        isOpen={!!commentsModalAssignment}
        onClose={() => setCommentsModalAssignment(null)}
        title="Task comments"
        size="md"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setCommentsModalAssignment(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={submitAssignmentComment}>
              Add comment
            </Button>
          </ModalFooter>
        }
      >
        {commentsModalAssignment ? (
          <div className={styles.modalForm}>
            <p className={styles.modalLead}>{commentsModalAssignment.title || 'Task'}</p>
            <Textarea
              label="New comment"
              rows={3}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Write your update..."
            />
            {commentsLoading ? <p className={styles.muted}>Loading comments...</p> : null}
            {!commentsLoading && assignmentComments.length === 0 ? <p className={styles.muted}>No comments yet.</p> : null}
            {!commentsLoading && assignmentComments.length > 0 ? (
              <div>
                {assignmentComments.map((c) => (
                  <div key={c.id} className={styles.inlineNoteBlock}>
                    <div className={styles.inlineNoteLabel}>
                      {c.author_name || 'User'} · {String(c.created_at || '').replace('T', ' ').slice(0, 16)}
                    </div>
                    <div>{c.comment_text}</div>
                  </div>
                ))}
              </div>
            ) : null}
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
