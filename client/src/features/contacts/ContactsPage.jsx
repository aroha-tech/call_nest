import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { usePermission, useAnyPermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactsAPI } from '../../services/contactsAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { getMe as getMeAPI } from '../auth/authAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { ConfirmModal, Modal, ModalFooter } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { FilterBar } from '../../components/admin/FilterBar';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { AssignContactsBulkModal } from './AssignContactsBulkModal';
import { LeadDataTable } from './LeadDataTable';
import { LeadColumnCustomizeModal } from './LeadColumnCustomizeModal';
import { LeadColumnSortFilterModal } from './LeadColumnSortFilterModal';
import {
  getApplicableLeadColumns,
  leadCustomFieldColumnId,
  loadLeadVisibleColumnIds,
  mergeApplicableLeadColumnsWithCustomFields,
  saveLeadVisibleColumnIds,
} from './leadTableConfig';
import {
  getApplicableContactColumns,
  getDefaultVisibleContactColumnIds,
  loadContactVisibleColumnIds,
  mergeApplicableContactColumnsWithCustomFields,
  saveContactVisibleColumnIds,
} from './contactTableConfig';
import listStyles from '../../components/admin/adminDataList.module.scss';
import pageStyles from './ContactsPage.module.scss';
import { dialerSessionsAPI } from '../../services/dialerSessionsAPI';
import { dialingSetsAPI, callScriptsAPI } from '../../services/dispositionAPI';
import { dialerPreferencesAPI } from '../../services/dialerPreferencesAPI';

const FILTER_ALL = '__all__';

function BulkActionsMenu({
  disabled,
  canBulkAssign,
  canBulkDelete,
  onAssign,
  onUnassign,
  onBulkDelete,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasAny = canBulkAssign || canBulkDelete;
  if (!hasAny) return null;

  return (
    <div className={pageStyles.bulkActionsWrap} ref={wrapRef}>
      <button
        type="button"
        className={pageStyles.bulkActionsBtn}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        Actions ▾
      </button>
      {open ? (
        <div className={pageStyles.bulkActionsMenu} role="menu">
          {canBulkAssign ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={pageStyles.bulkActionsItem}
                onClick={() => {
                  setOpen(false);
                  onAssign();
                }}
              >
                Assign…
              </button>
              <button
                type="button"
                role="menuitem"
                className={pageStyles.bulkActionsItem}
                onClick={() => {
                  setOpen(false);
                  onUnassign();
                }}
              >
                Unassign agent
              </button>
            </>
          ) : null}
          {canBulkDelete ? (
            <button
              type="button"
              role="menuitem"
              className={pageStyles.bulkActionsItemDanger}
              onClick={() => {
                setOpen(false);
                onBulkDelete();
              }}
            >
              Delete selected
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ContactsPage({ type, mode = 'crm' }) {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';
  const isDialer = mode === 'dialer';

  const canRead = usePermission(type === 'lead' ? 'leads.read' : 'contacts.read');
  const canCreate = usePermission(type === 'lead' ? 'leads.create' : 'contacts.create');
  /** API allows PUT with contacts.update OR leads.update; managers/agents often have only leads.update. */
  const canUpdate = useAnyPermission(
    type === 'lead' ? ['leads.update'] : ['contacts.update', 'leads.update']
  );
  const canDeleteRBAC = usePermission(type === 'lead' ? 'leads.delete' : 'contacts.delete');

  const [agentDeleteFlags, setAgentDeleteFlags] = useState(null);
  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    (async () => {
      try {
        if (role !== 'agent' || canDeleteRBAC || !user?.id) {
          if (!cancelled) setAgentDeleteFlags(null);
          return;
        }
        const res = await getMeAPI();
        const d = res?.data;
        if (!cancelled && d) {
          setAgentDeleteFlags({
            agent_can_delete_leads: !!d.agent_can_delete_leads,
            agent_can_delete_contacts: !!d.agent_can_delete_contacts,
          });
        } else if (!cancelled) {
          setAgentDeleteFlags(null);
        }
      } catch {
        if (!cancelled) setAgentDeleteFlags(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead, role, canDeleteRBAC, user?.id]);

  const canDelete = useMemo(() => {
    if (canDeleteRBAC) return true;
    if (role !== 'agent' || !agentDeleteFlags) return false;
    if (type === 'lead') return agentDeleteFlags.agent_can_delete_leads;
    return agentDeleteFlags.agent_can_delete_contacts;
  }, [canDeleteRBAC, role, agentDeleteFlags, type]);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [deleteItem, setDeleteItem] = useState(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignConfirmOpen, setUnassignConfirmOpen] = useState(false);
  const [unassignError, setUnassignError] = useState('');

  const showCampaign = type === 'lead' && canRead;
  const showManagerAgentColumns = (role === 'admin' || role === 'manager') && canRead;
  /** Tenant-defined contact custom fields — columns in Customize + values from list API `custom_field_values`. */
  const [leadCustomFieldDefs, setLeadCustomFieldDefs] = useState([]);
  const [contactCustomFieldDefs, setContactCustomFieldDefs] = useState([]);
  const leadApplicableColumns = useMemo(
    () =>
      type === 'lead'
        ? mergeApplicableLeadColumnsWithCustomFields(
            getApplicableLeadColumns({
              showCampaign,
              showManagerAgent: showManagerAgentColumns,
            }),
            leadCustomFieldDefs
          )
        : [],
    [type, showCampaign, showManagerAgentColumns, leadCustomFieldDefs]
  );
  const contactApplicableColumns = useMemo(
    () =>
      type === 'contact'
        ? mergeApplicableContactColumnsWithCustomFields(
            getApplicableContactColumns({ showManagerAgent: showManagerAgentColumns }),
            contactCustomFieldDefs
          )
        : [],
    [type, showManagerAgentColumns, contactCustomFieldDefs]
  );
  const [leadVisibleColumnIds, setLeadVisibleColumnIds] = useState(() =>
    type === 'lead'
      ? loadLeadVisibleColumnIds(
          mergeApplicableLeadColumnsWithCustomFields(
            getApplicableLeadColumns({
              showCampaign: type === 'lead' && canRead,
              showManagerAgent: (role === 'admin' || role === 'manager') && canRead,
            }),
            []
          )
        )
      : []
  );
  const [contactVisibleColumnIds, setContactVisibleColumnIds] = useState(() =>
    type === 'contact'
      ? loadContactVisibleColumnIds(
          mergeApplicableContactColumnsWithCustomFields(
            getApplicableContactColumns({
              showManagerAgent: (role === 'admin' || role === 'manager') && canRead,
            }),
            []
          )
        )
      : []
  );
  const [leadCustomizeOpen, setLeadCustomizeOpen] = useState(false);
  const [leadColumnPanelCol, setLeadColumnPanelCol] = useState(null);
  const [leadColumnFilters, setLeadColumnFilters] = useState([]);
  const leadTableScrollRef = useRef(null);
  /** When table is wider than the viewport (horizontal scrollbar), use ⋮ menu; else show Edit/Delete icons. */
  const [leadTableHasHorizontalOverflow, setLeadTableHasHorizontalOverflow] = useState(false);
  const [leadSortBy, setLeadSortBy] = useState(null);
  const [leadSortDir, setLeadSortDir] = useState('desc');
  const [contactCustomizeOpen, setContactCustomizeOpen] = useState(false);
  const [contactColumnPanelCol, setContactColumnPanelCol] = useState(null);
  const [contactColumnFilters, setContactColumnFilters] = useState([]);
  const contactTableScrollRef = useRef(null);
  const [contactTableHasHorizontalOverflow, setContactTableHasHorizontalOverflow] = useState(false);
  const [contactSortBy, setContactSortBy] = useState(null);
  const [contactSortDir, setContactSortDir] = useState('desc');

  const showOwnershipFilters = canRead && (role === 'admin' || role === 'manager');

  const [tenantUsers, setTenantUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignFilter, setCampaignFilter] = useState(FILTER_ALL);
  const [touchStatusFilter, setTouchStatusFilter] = useState(FILTER_ALL);
  const [minCallCountFilter, setMinCallCountFilter] = useState('');
  const [maxCallCountFilter, setMaxCallCountFilter] = useState('');
  const [lastCalledPreset, setLastCalledPreset] = useState(FILTER_ALL);
  const [draftManagerFilter, setDraftManagerFilter] = useState(FILTER_ALL);
  const [draftAgentFilter, setDraftAgentFilter] = useState(FILTER_ALL);
  const [appliedManagerFilter, setAppliedManagerFilter] = useState(FILTER_ALL);
  const [appliedAgentFilter, setAppliedAgentFilter] = useState(FILTER_ALL);
  useEffect(() => {
    if (!showOwnershipFilters) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false });
        if (!cancelled) setTenantUsers(res?.data?.data ?? []);
      } catch {
        if (!cancelled) setTenantUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showOwnershipFilters]);

  useEffect(() => {
    if (!showCampaign) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await campaignsAPI.list({
          page: 1,
          limit: 500,
          show_paused: true,
          type: 'static',
        });
        const list = res?.data?.data ?? res?.data ?? [];
        if (!cancelled) setCampaigns(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setCampaigns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCampaign]);

  useEffect(() => {
    if (type !== 'lead' || !canRead) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await contactsAPI.getCustomFields();
        const list = res?.data?.data ?? res?.data ?? [];
        if (!cancelled) setLeadCustomFieldDefs(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setLeadCustomFieldDefs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, canRead]);

  useEffect(() => {
    if (type !== 'contact' || !canRead) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await contactsAPI.getCustomFields();
        const list = res?.data?.data ?? res?.data ?? [];
        if (!cancelled) setContactCustomFieldDefs(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setContactCustomFieldDefs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, canRead]);

  /** Re-read localStorage when applicable set grows (e.g. custom fields loaded) so `cf:*` prefs apply. */
  useEffect(() => {
    if (type !== 'lead') return;
    setLeadVisibleColumnIds(loadLeadVisibleColumnIds(leadApplicableColumns));
  }, [type, leadApplicableColumns]);

  useEffect(() => {
    if (type !== 'contact') return;
    setContactVisibleColumnIds(loadContactVisibleColumnIds(contactApplicableColumns));
  }, [type, contactApplicableColumns]);

  const filterParamsForApi = useMemo(() => {
    const mid = role === 'manager' ? FILTER_ALL : appliedManagerFilter;
    const aid = appliedAgentFilter;
    const dialerParams = {};
    if (isDialer && type === 'lead') {
      if (touchStatusFilter && touchStatusFilter !== FILTER_ALL) {
        dialerParams.touch_status = touchStatusFilter;
      }
      if (minCallCountFilter !== '' && Number.isFinite(Number(minCallCountFilter))) {
        dialerParams.min_call_count = Number(minCallCountFilter);
      }
      if (maxCallCountFilter !== '' && Number.isFinite(Number(maxCallCountFilter))) {
        dialerParams.max_call_count = Number(maxCallCountFilter);
      }
      if (lastCalledPreset && lastCalledPreset !== FILTER_ALL) {
        const days = Number(lastCalledPreset);
        if (Number.isFinite(days) && days > 0) {
          const d = new Date();
          d.setDate(d.getDate() - days);
          dialerParams.last_called_after = d.toISOString();
        }
      }
    }

    return {
      filter_manager_id:
        !mid || mid === FILTER_ALL ? undefined : mid === 'unassigned' ? 'unassigned' : Number(mid),
      filter_assigned_user_id:
        !aid || aid === FILTER_ALL ? undefined : aid === 'unassigned' ? 'unassigned' : Number(aid),
      campaign_id:
        !showCampaign || !campaignFilter || campaignFilter === FILTER_ALL
          ? undefined
          : campaignFilter === 'none'
            ? 'none'
            : campaignFilter,
      ...dialerParams,
    };
  }, [
    role,
    appliedManagerFilter,
    appliedAgentFilter,
    showCampaign,
    campaignFilter,
    isDialer,
    type,
    touchStatusFilter,
    minCallCountFilter,
    maxCallCountFilter,
    lastCalledPreset,
  ]);

  const campaignFilterOptions = useMemo(() => {
    const rows = [...campaigns].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
    const opts = rows.map((c) => ({
      value: String(c.id),
      label: c.name || `#${c.id}`,
    }));
    return [
      { value: FILTER_ALL, label: 'All campaigns' },
      { value: 'none', label: 'No campaign' },
      ...opts,
    ];
  }, [campaigns]);

  const fetchContacts = useCallback(
    () =>
      contactsAPI.getAll({
        search: searchQuery || undefined,
        page,
        limit,
        type,
        ...filterParamsForApi,
        ...(type === 'lead' && leadSortBy
          ? { sort_by: leadSortBy, sort_dir: leadSortDir }
          : {}),
        ...(type === 'lead' && leadColumnFilters.length > 0 ? { column_filters: leadColumnFilters } : {}),
        ...(type === 'contact' && contactSortBy
          ? { sort_by: contactSortBy, sort_dir: contactSortDir }
          : {}),
        ...(type === 'contact' && contactColumnFilters.length > 0
          ? { column_filters: contactColumnFilters }
          : {}),
      }),
    [
      searchQuery,
      page,
      limit,
      type,
      filterParamsForApi,
      leadSortBy,
      leadSortDir,
      leadColumnFilters,
      contactSortBy,
      contactSortDir,
      contactColumnFilters,
    ]
  );

  const {
    data: contactsResponse,
    loading: loadingContacts,
    error: contactsError,
    refetch,
  } = useAsyncData(fetchContacts, [fetchContacts], {
    transform: (res) => res?.data ?? { data: [], pagination: { total: 0, totalPages: 1, page, limit } },
  });

  const contacts = contactsResponse?.data ?? [];
  const pagination = contactsResponse?.pagination ?? { total: 0, totalPages: 1, page, limit };

  const handleLeadCustomFieldCreated = useCallback(
    (created) => {
      const fid = created?.field_id ?? created?.id;
      if (fid == null) return;
      const colId = leadCustomFieldColumnId(fid);
      setLeadCustomFieldDefs((prev) => {
        if (prev.some((f) => Number(f.field_id ?? f.id) === Number(fid))) return prev;
        return [
          ...prev,
          {
            field_id: fid,
            name: created.name,
            label: created.label,
            type: created.type,
          },
        ];
      });
      setLeadVisibleColumnIds((prev) => {
        if (prev.includes(colId)) return prev;
        const next = [...prev, colId];
        saveLeadVisibleColumnIds(next);
        return next;
      });
      refetch();
    },
    [refetch]
  );

  const handleContactCustomFieldCreated = useCallback(
    (created) => {
      const fid = created?.field_id ?? created?.id;
      if (fid == null) return;
      const colId = leadCustomFieldColumnId(fid);
      setContactCustomFieldDefs((prev) => {
        if (prev.some((f) => Number(f.field_id ?? f.id) === Number(fid))) return prev;
        return [
          ...prev,
          {
            field_id: fid,
            name: created.name,
            label: created.label,
            type: created.type,
          },
        ];
      });
      setContactVisibleColumnIds((prev) => {
        if (prev.includes(colId)) return prev;
        const next = [...prev, colId];
        saveContactVisibleColumnIds(next);
        return next;
      });
      refetch();
    },
    [refetch]
  );

  useEffect(() => {
    if (type !== 'lead') return;
    const el = leadTableScrollRef.current;
    if (!el) return;
    const measure = () => {
      setLeadTableHasHorizontalOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const t = window.requestAnimationFrame(() => measure());
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [type, contacts.length, leadVisibleColumnIds, loadingContacts]);

  useEffect(() => {
    if (type !== 'contact') return;
    const el = contactTableScrollRef.current;
    if (!el) return;
    const measure = () => {
      setContactTableHasHorizontalOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const t = window.requestAnimationFrame(() => measure());
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [type, contacts.length, contactVisibleColumnIds, loadingContacts]);

  const { hasCompletedInitialFetch } = useTableLoadingState(loadingContacts);

  /** For bulk assign: infer shared manager from rows we have (same page). Cross-page selection → treat as ambiguous. */
  const bulkAssignContext = useMemo(() => {
    const selectedOnPage = contacts.filter((c) => selectedIds.has(c.id));
    const total = selectedIds.size;
    if (total === 0) {
      return { isMixed: false, sharedManagerId: undefined, selectionIncomplete: false };
    }
    if (selectedOnPage.length < total) {
      return { isMixed: true, sharedManagerId: undefined, selectionIncomplete: true };
    }
    const keys = new Set(
      selectedOnPage.map((c) => (c.manager_id == null ? '__pool__' : String(c.manager_id)))
    );
    if (keys.size > 1) {
      return { isMixed: true, sharedManagerId: undefined, selectionIncomplete: false };
    }
    const only = [...keys][0];
    if (only === '__pool__') {
      return { isMixed: false, sharedManagerId: null, selectionIncomplete: false };
    }
    return { isMixed: false, sharedManagerId: Number(only), selectionIncomplete: false };
  }, [contacts, selectedIds]);

  const createMutation = useMutation((payload) => contactsAPI.create(payload));
  const updateMutation = useMutation((id, payload) => contactsAPI.update(id, payload));
  const deleteMutation = useMutation((id) => contactsAPI.remove(id, { deleted_source: 'manual' }));
  const bulkDeleteMutation = useMutation((ids) => contactsAPI.removeBulk(ids, { deleted_source: 'manual' }));
  const assignMutation = useMutation((body) => contactsAPI.assign(body));

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /** Same component instance can be reused when switching /leads ↔ /contacts; lead IDs must not carry over. */
  useEffect(() => {
    clearSelection();
  }, [type, clearSelection]);

  const canBulkAssign = canUpdate && role !== 'agent';
  const canBulkDelete = canDelete;
  const showRowCheckboxes = isDialer || canBulkAssign || canBulkDelete;

  const managerFilterOptions = useMemo(() => {
    const managers = tenantUsers
      .filter((u) => u.role === 'manager')
      .map((u) => ({
        value: String(u.id),
        label: u.name || u.email || `#${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { value: FILTER_ALL, label: 'All managers' },
      { value: 'unassigned', label: 'Unassigned pool' },
      ...managers,
    ];
  }, [tenantUsers]);

  const agentFilterOptionsDraft = useMemo(() => {
    const agents = tenantUsers.filter((u) => u.role === 'agent');
    let pool = agents;
    if (role === 'manager' && user?.id) {
      pool = agents.filter((a) => Number(a.manager_id) === Number(user.id));
    } else if (role === 'admin') {
      if (draftManagerFilter === FILTER_ALL) {
        pool = agents;
      } else if (draftManagerFilter === 'unassigned') {
        pool = agents.filter((a) => a.manager_id == null);
      } else if (draftManagerFilter) {
        const m = Number(draftManagerFilter);
        pool = agents.filter((a) => Number(a.manager_id) === m);
      }
    }
    const opts = pool
      .map((u) => ({
        value: String(u.id),
        label: u.name || u.email || `#${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { value: FILTER_ALL, label: 'All agents' },
      { value: 'unassigned', label: 'No assigned agent' },
      ...opts,
    ];
  }, [tenantUsers, role, user?.id, draftManagerFilter]);

  const applyFilters = useCallback(() => {
    setAppliedManagerFilter(draftManagerFilter);
    setAppliedAgentFilter(draftAgentFilter);
    setPage(1);
    clearSelection();
  }, [draftManagerFilter, draftAgentFilter, clearSelection]);

  const resetFilters = useCallback(() => {
    setDraftManagerFilter(FILTER_ALL);
    setDraftAgentFilter(FILTER_ALL);
    setAppliedManagerFilter(FILTER_ALL);
    setAppliedAgentFilter(FILTER_ALL);
    setCampaignFilter(FILTER_ALL);
    setTouchStatusFilter(FILTER_ALL);
    setMinCallCountFilter('');
    setMaxCallCountFilter('');
    setLastCalledPreset(FILTER_ALL);
    setPage(1);
    clearSelection();
    setLeadSortBy(null);
    setLeadSortDir('desc');
    setLeadColumnFilters([]);
  }, [clearSelection]);

  const onCampaignFilterChange = (e) => {
    setCampaignFilter(e.target.value);
    setPage(1);
    clearSelection();
  };

  // Dialer: start session modal
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [dialingSets, setDialingSets] = useState([]);
  const [callScripts, setCallScripts] = useState([]);
  const [dialerDefaults, setDialerDefaults] = useState(null);
  const [startDialingSetId, setStartDialingSetId] = useState('');
  const [startCallScriptId, setStartCallScriptId] = useState('');
  const [startError, setStartError] = useState('');
  const [startBusy, setStartBusy] = useState(false);

  useEffect(() => {
    if (!isDialer) return;
    let cancelled = false;
    (async () => {
      try {
        const [dsRes, csRes, prefRes] = await Promise.all([
          dialingSetsAPI.getAll(true),
          callScriptsAPI.getAll({ includeInactive: false, page: 1, limit: 200 }),
          dialerPreferencesAPI.get(),
        ]);
        if (cancelled) return;
        setDialingSets(dsRes?.data?.data ?? []);
        setCallScripts(csRes?.data?.data ?? []);
        setDialerDefaults(prefRes?.data?.data ?? null);
      } catch {
        if (!cancelled) {
          setDialingSets([]);
          setCallScripts([]);
          setDialerDefaults(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDialer]);

  const dialingSetOptions = useMemo(() => {
    const rows = (dialingSets || []).filter((d) => (d?.is_deleted ?? 0) === 0);
    return [
      { value: '', label: '— Select dialing set —' },
      ...rows.map((d) => ({ value: String(d.id), label: d.name || d.id })),
    ];
  }, [dialingSets]);

  const callScriptOptions = useMemo(() => {
    const rows = callScripts || [];
    return [
      { value: '', label: '— Select script —' },
      ...rows.map((s) => ({ value: String(s.id), label: s.script_name || `#${s.id}` })),
    ];
  }, [callScripts]);

  const openStartModal = useCallback(
    (idsToUse) => {
      if (!isDialer) return;
      setStartError('');
      if (Array.isArray(idsToUse) && idsToUse.length > 0) {
        setSelectedIds(new Set(idsToUse));
      }

      const dsDefault =
        dialerDefaults?.default_dialing_set_id ||
        dialingSets.find((d) => d.is_default === 1)?.id ||
        dialingSets[0]?.id ||
        '';
      const csDefault =
        dialerDefaults?.default_call_script_id ||
        callScripts.find((s) => s.is_default === 1)?.id ||
        callScripts[0]?.id ||
        '';

      setStartDialingSetId(dsDefault ? String(dsDefault) : '');
      setStartCallScriptId(csDefault ? String(csDefault) : '');
      setStartModalOpen(true);
    },
    [isDialer, dialerDefaults, dialingSets, callScripts]
  );

  const confirmStartDialer = useCallback(async () => {
    setStartError('');
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setStartError('Select at least 1 lead.');
      return;
    }
    if (!startDialingSetId) {
      setStartError('Dialing set is required.');
      return;
    }
    if (!startCallScriptId) {
      setStartError('Call script is required.');
      return;
    }
    setStartBusy(true);
    try {
      const res = await dialerSessionsAPI.create({
        contact_ids: ids,
        provider: 'dummy',
        dialing_set_id: startDialingSetId,
        call_script_id: Number(startCallScriptId),
      });
      const s = res?.data?.data ?? null;
      setStartModalOpen(false);
      clearSelection();
      if (s?.id) {
        navigate(`/dialer/session/${s.id}`);
      }
    } catch (e) {
      setStartError(e?.response?.data?.error || e?.message || 'Failed to start dialer session');
    } finally {
      setStartBusy(false);
    }
  }, [selectedIds, startDialingSetId, startCallScriptId, navigate, clearSelection]);

  const handleDraftManagerChange = (e) => {
    const v = e.target.value;
    setDraftManagerFilter(v);
    setDraftAgentFilter(FILTER_ALL);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const pageIds = contacts.map((c) => c.id);
      const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
    clearSelection();
  };

  const applyLeadColumnPanel = useCallback(
    (col, { sort, filter }) => {
      if (sort === 'default') {
        setLeadSortBy(null);
        setLeadSortDir('desc');
      } else {
        setLeadSortBy(col.sortKey);
        setLeadSortDir(sort);
      }
      setLeadColumnFilters((prev) => {
        const rest = prev.filter((r) => r.field !== col.id);
        if (!filter || !filter.op) return rest;
        return [...rest, { field: col.id, op: filter.op, value: filter.value || '' }];
      });
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  const applyContactColumnPanel = useCallback(
    (col, { sort, filter }) => {
      if (sort === 'default') {
        setContactSortBy(null);
        setContactSortDir('desc');
      } else {
        setContactSortBy(col.sortKey);
        setContactSortDir(sort);
      }
      setContactColumnFilters((prev) => {
        const rest = prev.filter((r) => r.field !== col.id);
        if (!filter || !filter.op) return rest;
        return [...rest, { field: col.id, op: filter.op, value: filter.value || '' }];
      });
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  const confirmUnassignAgents = async () => {
    if (selectedIds.size === 0) return;
    setUnassignError('');
    const result = await assignMutation.mutate({
      contactIds: [...selectedIds],
      assigned_user_id: null,
    });
    if (result?.success) {
      setUnassignConfirmOpen(false);
      clearSelection();
      refetch();
    } else {
      setUnassignConfirmOpen(false);
      setUnassignError(result?.error || 'Could not unassign agent.');
    }
  };

  const openUnassignConfirm = () => {
    if (selectedIds.size === 0) return;
    setUnassignError('');
    setUnassignConfirmOpen(true);
  };

  const tableTitle = type === 'lead' ? 'Leads' : 'Contacts';

  const totalPages = Math.max(1, pagination.totalPages || 1);

  const hasActiveFilters =
    (type === 'lead' && leadColumnFilters.length > 0) ||
    (role === 'admin' && (appliedManagerFilter !== FILTER_ALL || appliedAgentFilter !== FILTER_ALL)) ||
    (role === 'manager' && appliedAgentFilter !== FILTER_ALL) ||
    (showCampaign && campaignFilter !== FILTER_ALL);

  return (
    <div className={listStyles.page}>
      <PageHeader
        title={isDialer ? 'Dialer' : tableTitle}
        description={
          isDialer
            ? 'Select leads and start a dialer session.'
            : role === 'agent'
              ? 'View and create your assigned leads/contacts'
              : 'Manage leads/contacts'
        }
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isDialer ? (
              <Button variant="secondary" onClick={() => navigate('/calls/history')}>
                Call history
              </Button>
            ) : null}
            {canRead && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const res = await contactsAPI.exportCsv({
                    search: searchQuery || undefined,
                    type,
                    ...filterParamsForApi,
                  });
                  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${type === 'lead' ? 'leads' : 'contacts'}_export.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </Button>
            )}
            {canCreate && (
              <Button variant="secondary" onClick={() => navigate(type === 'lead' ? '/leads/import' : '/contacts/import')}>
                Import
              </Button>
            )}
            {canCreate && !isDialer ? (
              <Button onClick={() => navigate(type === 'lead' ? '/leads/new' : '/contacts/new')}>
                + Add {type === 'lead' ? 'Lead' : 'Contact'}
              </Button>
            ) : null}
          </div>
        }
      />

      {contactsError && <Alert variant="error">{contactsError}</Alert>}
      {unassignError ? (
        <Alert variant="error" style={{ marginTop: contactsError ? 8 : 0 }}>
          {unassignError}
        </Alert>
      ) : null}

      {canRead && (showOwnershipFilters || showCampaign || isDialer) ? (
        <FilterBar onApply={applyFilters} onReset={resetFilters}>
          {showCampaign ? (
            <Select
              label="Campaign"
              value={campaignFilter}
              onChange={onCampaignFilterChange}
              options={campaignFilterOptions}
              className={pageStyles.filterSelect}
            />
          ) : null}
          {showOwnershipFilters && role === 'admin' ? (
            <Select
              label="Owning manager"
              value={draftManagerFilter}
              onChange={handleDraftManagerChange}
              options={managerFilterOptions}
              className={pageStyles.filterSelect}
            />
          ) : null}
          {showOwnershipFilters ? (
            <Select
              label="Assigned agent"
              value={draftAgentFilter}
              onChange={(e) => setDraftAgentFilter(e.target.value)}
              options={agentFilterOptionsDraft}
              className={pageStyles.filterSelect}
            />
          ) : null}
          {isDialer && type === 'lead' ? (
            <>
              <Select
                label="Call status"
                value={touchStatusFilter}
                onChange={(e) => setTouchStatusFilter(e.target.value)}
                options={[
                  { value: FILTER_ALL, label: 'All' },
                  { value: 'untouched', label: 'Never called' },
                  { value: 'touched', label: 'Called' },
                ]}
                className={pageStyles.filterSelect}
              />
              <Select
                label="Last called"
                value={lastCalledPreset}
                onChange={(e) => setLastCalledPreset(e.target.value)}
                options={[
                  { value: FILTER_ALL, label: 'Any time' },
                  { value: '1', label: 'Last 1 day' },
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                ]}
                className={pageStyles.filterSelect}
              />
              <Input
                label="Min calls"
                value={minCallCountFilter}
                onChange={(e) => setMinCallCountFilter(e.target.value)}
                placeholder="e.g. 0"
                className={pageStyles.filterSelect}
              />
              <Input
                label="Max calls"
                value={maxCallCountFilter}
                onChange={(e) => setMaxCallCountFilter(e.target.value)}
                placeholder="e.g. 5"
                className={pageStyles.filterSelect}
              />
            </>
          ) : null}
        </FilterBar>
      ) : null}

      <div className={listStyles.tableCard}>
        <div
          className={
            type === 'lead'
              ? `${listStyles.tableCardToolbarTop} ${listStyles.tableCardToolbarTopLead}`
              : listStyles.tableCardToolbarTop
          }
        >
          <div className={listStyles.tableCardToolbarLeft}>
            {showRowCheckboxes && contacts.length > 0 ? (
              <div className={listStyles.bulkToolbarSlot}>
                {selectedIds.size > 0 ? (
                  <>
                    <span className={listStyles.bulkSelectionCount}>{selectedIds.size} selected</span>
                    <Button size="sm" variant="secondary" onClick={clearSelection}>
                      Clear
                    </Button>
                    {isDialer && type === 'lead' ? (
                      <Button size="sm" onClick={() => openStartModal()}>
                        Call selected
                      </Button>
                    ) : (
                      <BulkActionsMenu
                        disabled={assignMutation.loading || bulkDeleteMutation.loading}
                        canBulkAssign={canBulkAssign}
                        canBulkDelete={canBulkDelete}
                        onAssign={() => setAssignOpen(true)}
                        onUnassign={openUnassignConfirm}
                        onBulkDelete={() => setBulkDeleteConfirmOpen(true)}
                      />
                    )}
                  </>
                ) : (
                  <span className={listStyles.bulkToolbarHint}>
                    {canBulkAssign && canBulkDelete
                      ? 'Select rows for bulk assign or delete'
                      : canBulkAssign
                        ? 'Select rows for bulk assign'
                        : canBulkDelete
                          ? 'Select rows to delete'
                          : ''}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <SearchInput value={searchQuery} onSearch={handleSearch} className={listStyles.searchInToolbar} placeholder="Search... (press Enter)" />
        </div>

        <TableDataRegion
          loading={loadingContacts}
          hasCompletedInitialFetch={hasCompletedInitialFetch}
          className={type === 'lead' ? listStyles.tableDataRegionLead : undefined}
        >
          {contacts.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📇"
                title={
                  searchQuery
                    ? 'No results found'
                    : hasActiveFilters
                      ? 'No records match filters'
                      : `No ${tableTitle} yet`
                }
                description={
                  searchQuery
                    ? 'Try another search.'
                    : hasActiveFilters
                      ? 'Change filters and click Apply, or Reset.'
                      : 'Add your first record to get started.'
                }
                action={
                  canCreate && !searchQuery && !hasActiveFilters
                    ? () => navigate(type === 'lead' ? '/leads/new' : '/contacts/new')
                    : undefined
                }
                actionLabel={canCreate && !searchQuery && !hasActiveFilters ? 'Add New' : undefined}
              />
            </div>
          ) : (
            <div
              className={
                type === 'lead'
                  ? `${listStyles.tableCardBody} ${listStyles.tableCardBodyLead}`
                  : listStyles.tableCardBody
              }
              ref={type === 'lead' ? leadTableScrollRef : type === 'contact' ? contactTableScrollRef : undefined}
            >
            {type === 'lead' ? (
              <LeadDataTable
                contacts={contacts}
                applicableColumns={leadApplicableColumns}
                visibleColumnIds={leadVisibleColumnIds}
                columnFilters={leadColumnFilters}
                canBulkAssign={showRowCheckboxes}
                showSelection={showRowCheckboxes}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAllOnPage={toggleSelectAllOnPage}
                sortBy={leadSortBy}
                sortDir={leadSortDir}
                onColumnHeaderClick={(col) => setLeadColumnPanelCol(col)}
                onOpenCustomizeColumns={() => setLeadCustomizeOpen(true)}
                useCompactRowActions={leadTableHasHorizontalOverflow}
                tableScrollContainerRef={leadTableScrollRef}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(c) => navigate(`/leads/${c.id}`)}
                onDelete={setDeleteItem}
                showDialerCall={isDialer}
                onDialerCall={(c) => openStartModal([c.id])}
              />
            ) : (
              <LeadDataTable
                contacts={contacts}
                applicableColumns={contactApplicableColumns}
                visibleColumnIds={contactVisibleColumnIds}
                columnFilters={contactColumnFilters}
                canBulkAssign={showRowCheckboxes}
                showSelection={showRowCheckboxes}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAllOnPage={toggleSelectAllOnPage}
                sortBy={contactSortBy}
                sortDir={contactSortDir}
                onColumnHeaderClick={(col) => setContactColumnPanelCol(col)}
                onOpenCustomizeColumns={() => setContactCustomizeOpen(true)}
                useCompactRowActions={contactTableHasHorizontalOverflow}
                tableScrollContainerRef={contactTableScrollRef}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(c) => navigate(`/contacts/${c.id}`)}
                onDelete={setDeleteItem}
              />
            )}
            </div>
          )}
        </TableDataRegion>

        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pagination.page || page}
            totalPages={totalPages}
            total={pagination.total || 0}
            limit={pagination.limit || limit}
            onPageChange={(p) => setPage(p)}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={unassignConfirmOpen}
        onClose={() => {
          if (!assignMutation.loading) {
            setUnassignConfirmOpen(false);
            setUnassignError('');
          }
        }}
        onConfirm={confirmUnassignAgents}
        title="Unassign agent"
        message={`Remove the assigned agent from ${selectedIds.size} selected record(s)? They will stay with their current manager (if any).`}
        confirmText="Unassign"
        variant="primary"
        loading={assignMutation.loading}
      />

      {isDialer ? (
        <Modal
          isOpen={startModalOpen}
          onClose={() => (!startBusy ? setStartModalOpen(false) : null)}
          title={`Start dialing (${selectedIds.size} selected)`}
          size="md"
          closeOnEscape
          footer={
            <ModalFooter>
              <Button variant="secondary" onClick={() => setStartModalOpen(false)} disabled={startBusy}>
                Cancel
              </Button>
              <Button onClick={confirmStartDialer} disabled={startBusy}>
                {startBusy ? 'Starting…' : 'Continue'}
              </Button>
            </ModalFooter>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {startError ? <Alert variant="error">{startError}</Alert> : null}
            <Select
              label="Dialing set"
              value={startDialingSetId}
              onChange={(e) => setStartDialingSetId(e.target.value)}
              options={dialingSetOptions}
            />
            <Select
              label="Call script"
              value={startCallScriptId}
              onChange={(e) => setStartCallScriptId(e.target.value)}
              options={callScriptOptions}
            />
          </div>
        </Modal>
      ) : null}

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (!deleteItem) return;
          const result = await deleteMutation.mutate(deleteItem.id);
          if (result?.success) {
            setDeleteItem(null);
            // if we deleted the last item on the page, try stepping back
            if (contacts.length === 1 && page > 1) setPage(page - 1);
            refetch();
          }
        }}
        title={`Delete ${type === 'lead' ? 'Lead' : 'Contact'}`}
        message={`Are you sure you want to delete "${deleteItem?.display_name || deleteItem?.first_name || deleteItem?.email || 'this record'}"?`}
        confirmText="Delete"
        loading={deleteMutation.loading}
      />

      <ConfirmModal
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => {
          if (!bulkDeleteMutation.loading) setBulkDeleteConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (selectedIds.size === 0) return;
          const n = selectedIds.size;
          const result = await bulkDeleteMutation.mutate([...selectedIds]);
          if (result?.success) {
            setBulkDeleteConfirmOpen(false);
            clearSelection();
            if (n >= contacts.length && page > 1) setPage(page - 1);
            refetch();
          }
        }}
        title={`Delete ${selectedIds.size} ${type === 'lead' ? 'leads' : 'contacts'}?`}
        message={`Remove ${selectedIds.size} selected record(s) from this list? They will be soft-deleted for your workspace.`}
        confirmText="Delete all"
        variant="danger"
        loading={bulkDeleteMutation.loading}
      />

      <AssignContactsBulkModal
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        selectedIds={[...selectedIds]}
        assignContext={bulkAssignContext}
        user={user}
        onSuccess={() => {
          clearSelection();
          refetch();
        }}
      />

      {type === 'lead' ? (
        <LeadColumnCustomizeModal
          isOpen={leadCustomizeOpen}
          onClose={() => setLeadCustomizeOpen(false)}
          applicableColumns={leadApplicableColumns}
          visibleColumnIds={leadVisibleColumnIds}
          onSave={setLeadVisibleColumnIds}
          canAddCustomField={canUpdate}
          onCustomFieldCreated={handleLeadCustomFieldCreated}
          title="Customize columns"
          persistVisibleIds={saveLeadVisibleColumnIds}
        />
      ) : null}

      {type === 'contact' ? (
        <LeadColumnCustomizeModal
          isOpen={contactCustomizeOpen}
          onClose={() => setContactCustomizeOpen(false)}
          applicableColumns={contactApplicableColumns}
          visibleColumnIds={contactVisibleColumnIds}
          onSave={setContactVisibleColumnIds}
          canAddCustomField={canUpdate}
          onCustomFieldCreated={handleContactCustomFieldCreated}
          title="Customize columns"
          getDefaults={getDefaultVisibleContactColumnIds}
          persistVisibleIds={saveContactVisibleColumnIds}
        />
      ) : null}

      {type === 'lead' ? (
        <LeadColumnSortFilterModal
          isOpen={!!leadColumnPanelCol}
          onClose={() => setLeadColumnPanelCol(null)}
          column={leadColumnPanelCol}
          sortBy={leadSortBy}
          sortDir={leadSortDir}
          filterRule={leadColumnFilters.find((r) => r.field === leadColumnPanelCol?.id)}
          onApply={(payload) => {
            if (leadColumnPanelCol) applyLeadColumnPanel(leadColumnPanelCol, payload);
          }}
        />
      ) : null}

      {type === 'contact' ? (
        <LeadColumnSortFilterModal
          isOpen={!!contactColumnPanelCol}
          onClose={() => setContactColumnPanelCol(null)}
          column={contactColumnPanelCol}
          sortBy={contactSortBy}
          sortDir={contactSortDir}
          filterRule={contactColumnFilters.find((r) => r.field === contactColumnPanelCol?.id)}
          onApply={(payload) => {
            if (contactColumnPanelCol) applyContactColumnPanel(contactColumnPanelCol, payload);
          }}
        />
      ) : null}
    </div>
  );
}

