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
import { Table } from '../../components/ui/Table';
import { ConfirmModal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { AssignContactsBulkModal } from './AssignContactsBulkModal';
import { AddTagsBulkModal } from './AddTagsBulkModal';
import { RemoveTagsBulkModal } from './RemoveTagsBulkModal';
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
import { dialingSetsAPI, callScriptsAPI, contactStatusesAPI } from '../../services/dispositionAPI';
import { dialerPreferencesAPI } from '../../services/dialerPreferencesAPI';
import { ContactAdvancedFilterModal } from './ContactAdvancedFilterModal';
import { FilterOptionsModal } from './FilterOptionsModal';
import { BrowseSavedFiltersModal } from './BrowseSavedFiltersModal';
import { ExportCsvModal } from './ExportCsvModal';
import { LeadPipelineCards } from './LeadPipelineCards';
import { ContactDashboardCards } from './ContactDashboardCards';
import {
  IconChevronDown,
  IconColumns,
  IconExport,
  IconFilter,
  IconImport,
  IconPhone,
  IconPlus,
  IconTag,
  IconTagOff,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
} from './ListActionsMenuIcons';
import { savedListFiltersAPI } from '../../services/savedListFiltersAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';

const FILTER_ALL = '__all__';

function parseSavedListFilterSnapshot(row) {
  if (!row?.filter_json) return null;
  let snap = row.filter_json;
  if (typeof snap === 'string') {
    try {
      snap = JSON.parse(snap);
    } catch {
      return null;
    }
  }
  if (!snap || snap.version !== 1) return null;
  return snap;
}

function campaignMultiFromSnapshot(snap) {
  let campMulti = snap.campaignIdsMulti ?? snap.appliedCampaignIdsMulti ?? '';
  if (!campMulti && snap.campaignFilter != null && snap.campaignFilter !== FILTER_ALL) {
    campMulti =
      snap.campaignFilter === 'none' ? JSON.stringify(['none']) : JSON.stringify([String(snap.campaignFilter)]);
  }
  return campMulti || '';
}

function IconReset() {
  return (
    <svg className={pageStyles.toolbarResetIcon} viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden>
      <path
        d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function bulkToolbarHintText({ canBulkAssign, canBulkDelete, canBulkTag }) {
  const parts = [];
  if (canBulkAssign) parts.push('bulk assign');
  if (canBulkDelete) parts.push('delete');
  if (canBulkTag) parts.push('add tags');
  if (parts.length === 0) return '';
  const head = 'Select rows for ';
  if (parts.length === 1) {
    const [p] = parts;
    if (p === 'bulk assign') return 'Select rows for bulk assign';
    if (p === 'delete') return 'Select rows to delete';
    return 'Select rows to add tags';
  }
  if (parts.length === 2) {
    return `${head}${parts[0]} or ${parts[1]}`;
  }
  return `${head}${parts[0]}, ${parts[1]}, or ${parts[2]}`;
}

function ListActionsMenuDivider() {
  return <div className={pageStyles.actionsMenuDivider} role="separator" />;
}

function ListActionsMenuItem({ icon: Icon, children, danger, disabled, className = '', ...rest }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`${pageStyles.actionsMenuItem} ${danger ? pageStyles.actionsMenuItemDanger : ''} ${disabled ? pageStyles.actionsMenuItemDisabled : ''} ${className}`.trim()}
      {...rest}
    >
      <span className={pageStyles.actionsMenuIcon} aria-hidden>
        <Icon />
      </span>
      <span className={pageStyles.actionsMenuText}>{children}</span>
    </button>
  );
}

/** Single Actions menu: list tools (filters, import, export, add, columns) + selection + bulk ops. */
function ListActionsMenu({
  showFiltersEntry,
  onOpenFilters,
  canRead,
  canCreate,
  type,
  navigate,
  onCustomizeColumns,
  onOpenExport,
  isDialer,
  onCallSelected,
  canBulkAssign,
  canBulkDelete,
  canBulkTag,
  bulkBusy,
  noBulkSelection,
  onAssign,
  onUnassign,
  onBulkDelete,
  onAddTag,
  onRemoveTag,
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

  const showBulkSection =
    (isDialer && type === 'lead') || canBulkAssign || canBulkDelete || canBulkTag;
  const bulkDisabled = noBulkSelection || bulkBusy;

  const hasMenu =
    showFiltersEntry ||
    canRead ||
    canCreate ||
    (isDialer && type === 'lead') ||
    canBulkAssign ||
    canBulkDelete ||
    canBulkTag;

  if (!hasMenu) return null;

  const hasImportExport = canCreate || canRead;
  /** Divider after Filters when any list actions follow (import/export/new/customize). */
  const showDividerAfterFilters = showFiltersEntry;

  return (
    <div className={pageStyles.bulkActionsWrap} ref={wrapRef}>
      <Button
        size="sm"
        variant="primary"
        className={pageStyles.toolbarControlBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={pageStyles.actionsTriggerInner}>
          Actions
          <IconChevronDown className={pageStyles.actionsTriggerChevron} />
        </span>
      </Button>
      {open ? (
        <div className={pageStyles.bulkActionsMenu} role="menu">
          <div className={pageStyles.actionsMenuSection}>
            {showFiltersEntry ? (
              <ListActionsMenuItem
                icon={IconFilter}
                onClick={() => {
                  setOpen(false);
                  onOpenFilters();
                }}
              >
                Filters…
              </ListActionsMenuItem>
            ) : null}
            {showDividerAfterFilters ? <ListActionsMenuDivider /> : null}
            {canCreate ? (
              <ListActionsMenuItem
                icon={IconImport}
                onClick={() => {
                  setOpen(false);
                  navigate(type === 'lead' ? '/leads/import' : '/contacts/import');
                }}
              >
                Import CSV
              </ListActionsMenuItem>
            ) : null}
            {canRead ? (
              <ListActionsMenuItem
                icon={IconExport}
                onClick={() => {
                  setOpen(false);
                  onOpenExport();
                }}
              >
                Export CSV
              </ListActionsMenuItem>
            ) : null}
            {hasImportExport ? <ListActionsMenuDivider /> : null}
            {canCreate ? (
              <ListActionsMenuItem
                icon={IconPlus}
                onClick={() => {
                  setOpen(false);
                  navigate(type === 'lead' ? '/leads/new' : '/contacts/new');
                }}
              >
                {type === 'lead' ? 'New lead' : 'New contact'}
              </ListActionsMenuItem>
            ) : null}
            <ListActionsMenuItem
              icon={IconColumns}
              onClick={() => {
                setOpen(false);
                onCustomizeColumns();
              }}
            >
              Customize columns
            </ListActionsMenuItem>
          </div>

          {showBulkSection ? (
            <div className={pageStyles.actionsMenuSection}>
              <ListActionsMenuDivider />
              <p className={pageStyles.listActionsMenuHint}>With rows selected</p>
              {isDialer && type === 'lead' ? (
                <ListActionsMenuItem
                  icon={IconPhone}
                  disabled={bulkDisabled}
                  onClick={() => {
                    setOpen(false);
                    onCallSelected();
                  }}
                >
                  Call selected
                </ListActionsMenuItem>
              ) : null}
              {canBulkAssign ? (
                <>
                  <ListActionsMenuItem
                    icon={IconUserPlus}
                    disabled={bulkDisabled}
                    onClick={() => {
                      setOpen(false);
                      onAssign();
                    }}
                  >
                    Assign…
                  </ListActionsMenuItem>
                  <ListActionsMenuItem
                    icon={IconUserMinus}
                    disabled={bulkDisabled}
                    onClick={() => {
                      setOpen(false);
                      onUnassign();
                    }}
                  >
                    Unassign agent
                  </ListActionsMenuItem>
                </>
              ) : null}
              {canBulkTag ? (
                <>
                  <ListActionsMenuItem
                    icon={IconTag}
                    disabled={bulkDisabled}
                    onClick={() => {
                      setOpen(false);
                      onAddTag();
                    }}
                  >
                    Add tag…
                  </ListActionsMenuItem>
                  <ListActionsMenuItem
                    icon={IconTagOff}
                    disabled={bulkDisabled}
                    onClick={() => {
                      setOpen(false);
                      onRemoveTag();
                    }}
                  >
                    Remove tag…
                  </ListActionsMenuItem>
                </>
              ) : null}
              {canBulkDelete ? (
                <ListActionsMenuItem
                  icon={IconTrash}
                  danger
                  disabled={bulkDisabled}
                  onClick={() => {
                    setOpen(false);
                    onBulkDelete();
                  }}
                >
                  Delete selected
                </ListActionsMenuItem>
              ) : null}
            </div>
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
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkRemoveTagOpen, setBulkRemoveTagOpen] = useState(false);
  const [exportCsvOpen, setExportCsvOpen] = useState(false);
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
  /** JSON array string for MultiSelectDropdown: campaign ids + optional "none". */
  const [appliedCampaignIdsMulti, setAppliedCampaignIdsMulti] = useState('');
  const [appliedTagIdsMulti, setAppliedTagIdsMulti] = useState('');
  /** JSON array string: status master ids and/or "none" (no status). */
  const [appliedStatusIdsMulti, setAppliedStatusIdsMulti] = useState('');
  const [contactTags, setContactTags] = useState([]);
  const [contactStatuses, setContactStatuses] = useState([]);
  const [touchStatusFilter, setTouchStatusFilter] = useState(FILTER_ALL);
  const [minCallCountFilter, setMinCallCountFilter] = useState('');
  const [maxCallCountFilter, setMaxCallCountFilter] = useState('');
  const [lastCalledPreset, setLastCalledPreset] = useState(FILTER_ALL);
  const [appliedManagerFilter, setAppliedManagerFilter] = useState(FILTER_ALL);
  const [appliedAgentFilter, setAppliedAgentFilter] = useState(FILTER_ALL);
  /** Admin: JSON array string for MultiSelectDropdown (manager ids + optional "unassigned"). */
  const [appliedAdminManagersMulti, setAppliedAdminManagersMulti] = useState('');
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);
  const [browseFiltersOpen, setBrowseFiltersOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [editingSavedFilterId, setEditingSavedFilterId] = useState(null);
  const [editingSavedFilterName, setEditingSavedFilterName] = useState('');
  /** When editing from Browse → Edit, list is not updated until Apply; this holds JSON for modal + save metadata. */
  const [editingSavedFilterSnapshot, setEditingSavedFilterSnapshot] = useState(null);
  const [selectAllMatchingLoading, setSelectAllMatchingLoading] = useState(false);
  const [selectionIsAllMatching, setSelectionIsAllMatching] = useState(false);
  const [leadPipelineData, setLeadPipelineData] = useState(null);
  const [leadPipelineLoading, setLeadPipelineLoading] = useState(false);
  const [contactDashboardData, setContactDashboardData] = useState(null);
  const [contactDashboardLoading, setContactDashboardLoading] = useState(false);
  /** Bumps when list data changes counts (e.g. delete) so pipeline / dashboard cards refetch. */
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  useEffect(() => {
    if (type !== 'lead' || !canRead || isDialer) {
      setLeadPipelineData(null);
      setLeadPipelineLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLeadPipelineLoading(true);
      try {
        const res = await contactsAPI.getLeadPipelineSummary();
        if (!cancelled) setLeadPipelineData(res?.data?.data ?? null);
      } catch {
        if (!cancelled) setLeadPipelineData(null);
      } finally {
        if (!cancelled) setLeadPipelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, canRead, isDialer, summaryRefreshKey]);

  useEffect(() => {
    if (type !== 'contact' || !canRead || isDialer) {
      setContactDashboardData(null);
      setContactDashboardLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setContactDashboardLoading(true);
      try {
        const res = await contactsAPI.getContactDashboardSummary();
        if (!cancelled) setContactDashboardData(res?.data?.data ?? null);
      } catch {
        if (!cancelled) setContactDashboardData(null);
      } finally {
        if (!cancelled) setContactDashboardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, canRead, isDialer, summaryRefreshKey]);

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
    if (!canRead) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await contactTagsAPI.list();
        if (!cancelled) setContactTags(res?.data?.data ?? []);
      } catch {
        if (!cancelled) setContactTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await contactStatusesAPI.getOptions();
        const list = res?.data?.data ?? res?.data ?? [];
        if (!cancelled) setContactStatuses(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setContactStatuses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead]);

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
    const mid = role === 'manager' ? FILTER_ALL : role === 'admin' ? FILTER_ALL : appliedManagerFilter;
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

    let filter_manager_id =
      !mid || mid === FILTER_ALL ? undefined : mid === 'unassigned' ? 'unassigned' : Number(mid);
    let filter_manager_ids;
    let filter_unassigned_managers;
    if (role === 'admin' && appliedAdminManagersMulti) {
      try {
        const arr = JSON.parse(appliedAdminManagersMulti);
        if (Array.isArray(arr) && arr.length > 0) {
          filter_manager_id = undefined;
          const hasUn = arr.map(String).includes('unassigned');
          const ids = arr
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
          filter_unassigned_managers = hasUn || undefined;
          filter_manager_ids = ids.length ? ids : undefined;
        }
      } catch {
        /* ignore */
      }
    }

    let campaign_ids;
    try {
      if (showCampaign && appliedCampaignIdsMulti) {
        const arr = JSON.parse(appliedCampaignIdsMulti);
        if (Array.isArray(arr) && arr.length > 0) {
          campaign_ids = arr;
        }
      }
    } catch {
      /* ignore */
    }

    let filter_tag_ids;
    try {
      if (appliedTagIdsMulti) {
        const arr = JSON.parse(appliedTagIdsMulti);
        if (Array.isArray(arr) && arr.length > 0) {
          filter_tag_ids = [
            ...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)),
          ];
          if (filter_tag_ids.length === 0) filter_tag_ids = undefined;
        }
      }
    } catch {
      /* ignore */
    }

    let status_ids;
    try {
      if (appliedStatusIdsMulti) {
        const arr = JSON.parse(appliedStatusIdsMulti);
        if (Array.isArray(arr) && arr.length > 0) {
          const hasNone = arr.map(String).some((x) => x === 'none');
          const nums = [
            ...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)),
          ];
          if (hasNone && nums.length > 0) {
            status_ids = ['none', ...nums];
          } else if (hasNone) {
            status_ids = ['none'];
          } else if (nums.length > 0) {
            status_ids = nums;
          }
        }
      }
    } catch {
      /* ignore */
    }

    return {
      filter_manager_id,
      filter_manager_ids,
      filter_unassigned_managers,
      filter_assigned_user_id:
        !aid || aid === FILTER_ALL ? undefined : aid === 'unassigned' ? 'unassigned' : Number(aid),
      campaign_ids,
      filter_tag_ids,
      status_ids,
      ...dialerParams,
    };
  }, [
    role,
    appliedManagerFilter,
    appliedAgentFilter,
    appliedAdminManagersMulti,
    showCampaign,
    appliedCampaignIdsMulti,
    appliedTagIdsMulti,
    appliedStatusIdsMulti,
    isDialer,
    type,
    touchStatusFilter,
    minCallCountFilter,
    maxCallCountFilter,
    lastCalledPreset,
  ]);

  const exportListParams = useMemo(
    () => ({
      search: searchQuery || undefined,
      type,
      ...filterParamsForApi,
      ...(type === 'lead' && leadColumnFilters.length > 0 ? { column_filters: leadColumnFilters } : {}),
      ...(type === 'contact' && contactColumnFilters.length > 0 ? { column_filters: contactColumnFilters } : {}),
    }),
    [searchQuery, type, filterParamsForApi, leadColumnFilters, contactColumnFilters]
  );

  const campaignMultiOptions = useMemo(() => {
    const rows = [...campaigns].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
    return [
      { value: 'none', label: 'No campaign' },
      ...rows.map((c) => ({
        value: String(c.id),
        label: c.name || `#${c.id}`,
      })),
    ];
  }, [campaigns]);

  const tagMultiOptions = useMemo(
    () =>
      [...contactTags]
        .filter((t) => !t.deleted_at)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
        .map((t) => ({
          value: String(t.id),
          label: t.name || `#${t.id}`,
        })),
    [contactTags]
  );

  const statusMultiOptions = useMemo(() => {
    const rows = [...contactStatuses].filter((s) => s.is_active !== 0 && s.is_active !== false);
    rows.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
    return [
      { value: 'none', label: 'No status' },
      ...rows.map((s) => ({
        value: String(s.id),
        label: s.name || `#${s.id}`,
      })),
    ];
  }, [contactStatuses]);

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

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionIsAllMatching(false);
  }, []);

  /** Same component instance can be reused when switching /leads ↔ /contacts; lead IDs must not carry over. */
  useEffect(() => {
    clearSelection();
  }, [type, clearSelection]);

  const canBulkAssign = canUpdate && role !== 'agent';
  const canBulkDelete = canDelete;
  const canBulkTag = canUpdate;
  const showRowCheckboxes = isDialer || canBulkAssign || canBulkDelete || canBulkTag;
  const bulkHint = useMemo(
    () => bulkToolbarHintText({ canBulkAssign, canBulkDelete, canBulkTag }),
    [canBulkAssign, canBulkDelete, canBulkTag]
  );

  const adminManagerMultiOptions = useMemo(() => {
    const managers = tenantUsers
      .filter((u) => u.role === 'manager')
      .map((u) => ({
        value: String(u.id),
        label: u.name || u.email || `#${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'unassigned', label: 'Unassigned pool' }, ...managers];
  }, [tenantUsers]);

  const agentFilterOptionsForModal = useMemo(() => {
    const agents = tenantUsers.filter((u) => u.role === 'agent');
    let pool = agents;
    if (role === 'manager' && user?.id) {
      pool = agents.filter((a) => Number(a.manager_id) === Number(user.id));
    } else if (role === 'admin') {
      let multiActive = false;
      try {
        const arr = JSON.parse(appliedAdminManagersMulti || '');
        multiActive = Array.isArray(arr) && arr.length > 0;
      } catch {
        /* ignore */
      }
      if (multiActive) {
        pool = agents;
      } else if (appliedManagerFilter === FILTER_ALL) {
        pool = agents;
      } else if (appliedManagerFilter === 'unassigned') {
        pool = agents.filter((a) => a.manager_id == null);
      } else if (appliedManagerFilter) {
        const m = Number(appliedManagerFilter);
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
  }, [tenantUsers, role, user?.id, appliedManagerFilter, appliedAdminManagersMulti]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    const entity_type = type === 'lead' ? 'lead' : 'contact';
    savedListFiltersAPI
      .list({ entity_type })
      .then((res) => {
        if (!cancelled) setSavedFilters(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, type]);

  const applyContactsFilterSnapshot = useCallback(
    (snap) => {
      if (!snap || snap.version !== 1) return;
      setSearchQuery(snap.searchQuery ?? '');
      setAppliedCampaignIdsMulti(campaignMultiFromSnapshot(snap));
      setAppliedTagIdsMulti(snap.appliedTagIdsMulti ?? '');
      setAppliedStatusIdsMulti(snap.appliedStatusIdsMulti ?? '');
      setAppliedManagerFilter(snap.appliedManagerFilter ?? FILTER_ALL);
      const multi = snap.appliedAdminManagersMulti ?? snap.draftAdminManagersMultiForBar ?? '';
      setAppliedAdminManagersMulti(multi);
      setAppliedAgentFilter(snap.appliedAgentFilter ?? FILTER_ALL);
      setTouchStatusFilter(snap.touchStatusFilter ?? FILTER_ALL);
      setMinCallCountFilter(snap.minCallCountFilter ?? '');
      setMaxCallCountFilter(snap.maxCallCountFilter ?? '');
      setLastCalledPreset(snap.lastCalledPreset ?? FILTER_ALL);
      setLeadColumnFilters(Array.isArray(snap.leadColumnFilters) ? snap.leadColumnFilters : []);
      setContactColumnFilters(Array.isArray(snap.contactColumnFilters) ? snap.contactColumnFilters : []);
      setLeadSortBy(snap.leadSortBy ?? null);
      setLeadSortDir(snap.leadSortDir ?? 'desc');
      setContactSortBy(snap.contactSortBy ?? null);
      setContactSortDir(snap.contactSortDir ?? 'desc');
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  const handleBrowseSavedApply = useCallback(
    (row) => {
      const snap = parseSavedListFilterSnapshot(row);
      if (!snap) return;
      applyContactsFilterSnapshot(snap);
    },
    [applyContactsFilterSnapshot]
  );

  const handleBrowseSavedEdit = useCallback((row) => {
    const snap = parseSavedListFilterSnapshot(row);
    if (!snap || !row?.id) return;
    setEditingSavedFilterId(row.id);
    setEditingSavedFilterName(String(row.name || '').trim());
    setEditingSavedFilterSnapshot(snap);
    setBrowseFiltersOpen(false);
    setAdvancedFilterOpen(true);
  }, []);

  const handleBrowseSavedDelete = useCallback(
    async (row) => {
      if (!row?.id) return;
      try {
        await savedListFiltersAPI.remove(row.id);
        const entity_type = type === 'lead' ? 'lead' : 'contact';
        const res = await savedListFiltersAPI.list({ entity_type });
        setSavedFilters(res?.data?.data ?? []);
      } catch (e) {
        window.alert(e?.response?.data?.error || e?.message || 'Could not delete saved filter.');
      }
    },
    [type]
  );

  // Dialer: defaults for standalone setup page
  const [dialingSets, setDialingSets] = useState([]);
  const [callScripts, setCallScripts] = useState([]);
  const [dialerDefaults, setDialerDefaults] = useState(null);

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

  const openStartModal = useCallback(
    (idsToUse) => {
      if (!isDialer) return;
      const ids = Array.isArray(idsToUse) && idsToUse.length > 0 ? idsToUse : [...selectedIds];
      if (!ids.length) return;

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

      clearSelection();
      navigate('/dialer/session/setup', {
        state: {
          contactIds: ids,
          dialingSetId: dsDefault ? String(dsDefault) : '',
          callScriptId: csDefault ? String(csDefault) : '',
        },
      });
    },
    [isDialer, dialerDefaults, dialingSets, callScripts, selectedIds, navigate, clearSelection]
  );

  const toggleSelect = (id) => {
    setSelectionIsAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectionIsAllMatching(false);
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

  const handleSelectAllToggle = useCallback(async () => {
    if (!showRowCheckboxes) return;
    if (selectionIsAllMatching && selectedIds.size > 0) {
      clearSelection();
      return;
    }
    setSelectAllMatchingLoading(true);
    try {
      const res = await contactsAPI.listIds({
        search: searchQuery || undefined,
        type,
        ...filterParamsForApi,
        ...(type === 'lead' && leadColumnFilters.length > 0 ? { column_filters: leadColumnFilters } : {}),
        ...(type === 'contact' && contactColumnFilters.length > 0 ? { column_filters: contactColumnFilters } : {}),
      });
      const { ids = [], total = 0, truncated, cap } = res?.data ?? {};
      if (truncated) {
        window.alert(
          `Your filters match ${total} records. Only the first ${cap} IDs were loaded for selection — narrow filters to include everyone in bulk actions.`
        );
      }
      setSelectedIds(new Set(ids));
      setSelectionIsAllMatching(ids.length > 0);
    } catch (e) {
      window.alert(e?.response?.data?.error || e?.message || 'Could not select all matching records.');
    } finally {
      setSelectAllMatchingLoading(false);
    }
  }, [
    showRowCheckboxes,
    selectionIsAllMatching,
    selectedIds.size,
    clearSelection,
    searchQuery,
    type,
    filterParamsForApi,
    leadColumnFilters,
    contactColumnFilters,
  ]);

  const handleFilterModalApply = useCallback(
    (payload) => {
      if (type === 'lead') setLeadColumnFilters(payload.columnRules ?? []);
      else setContactColumnFilters(payload.columnRules ?? []);
      setAppliedCampaignIdsMulti(payload.campaignIdsMulti ?? '');
      setAppliedAdminManagersMulti(payload.adminManagersMulti ?? '');
      setAppliedAgentFilter(payload.agentFilter ?? FILTER_ALL);
      setAppliedTagIdsMulti(payload.tagIdsMulti ?? '');
      setAppliedStatusIdsMulti(payload.statusIdsMulti ?? '');
      setTouchStatusFilter(payload.touchStatus ?? FILTER_ALL);
      setMinCallCountFilter(payload.minCallCount ?? '');
      setMaxCallCountFilter(payload.maxCallCount ?? '');
      setLastCalledPreset(payload.lastCalledPreset ?? FILTER_ALL);
      setPage(1);
      clearSelection();
    },
    [type, clearSelection]
  );

  const buildFilterJsonSnapshot = useCallback(
    (payload) => {
      const base = editingSavedFilterSnapshot;
      const useBase = base != null && base.version === 1;
      const mgr = useBase ? base.appliedManagerFilter ?? FILTER_ALL : appliedManagerFilter;
      return {
        version: 1,
        type,
        searchQuery: useBase ? base.searchQuery ?? '' : searchQuery,
        campaignIdsMulti: payload.campaignIdsMulti ?? '',
        appliedCampaignIdsMulti: payload.campaignIdsMulti ?? '',
        appliedTagIdsMulti: payload.tagIdsMulti ?? '',
        appliedStatusIdsMulti: payload.statusIdsMulti ?? '',
        appliedManagerFilter: mgr,
        appliedAdminManagersMulti: payload.adminManagersMulti ?? '',
        draftAdminManagersMultiForBar: payload.adminManagersMulti ?? '',
        appliedAgentFilter: payload.agentFilter ?? FILTER_ALL,
        draftManagerFilter: role === 'admin' ? FILTER_ALL : mgr,
        touchStatusFilter: payload.touchStatus ?? FILTER_ALL,
        minCallCountFilter: payload.minCallCount ?? '',
        maxCallCountFilter: payload.maxCallCount ?? '',
        lastCalledPreset: payload.lastCalledPreset ?? FILTER_ALL,
        leadColumnFilters:
          type === 'lead'
            ? payload.columnRules ?? []
            : useBase
              ? Array.isArray(base.leadColumnFilters)
                ? base.leadColumnFilters
                : []
              : leadColumnFilters,
        contactColumnFilters:
          type === 'contact'
            ? payload.columnRules ?? []
            : useBase
              ? Array.isArray(base.contactColumnFilters)
                ? base.contactColumnFilters
                : []
              : contactColumnFilters,
        leadSortBy: useBase ? base.leadSortBy ?? null : leadSortBy,
        leadSortDir: useBase ? base.leadSortDir ?? 'desc' : leadSortDir,
        contactSortBy: useBase ? base.contactSortBy ?? null : contactSortBy,
        contactSortDir: useBase ? base.contactSortDir ?? 'desc' : contactSortDir,
      };
    },
    [
      editingSavedFilterSnapshot,
      type,
      searchQuery,
      appliedManagerFilter,
      role,
      leadColumnFilters,
      contactColumnFilters,
      leadSortBy,
      leadSortDir,
      contactSortBy,
      contactSortDir,
    ]
  );

  const handleFilterSaveNamed = useCallback(
    async (name, payload) => {
      handleFilterModalApply(payload);
      const filter_json = buildFilterJsonSnapshot(payload);
      try {
        await savedListFiltersAPI.create({
          entity_type: type === 'lead' ? 'lead' : 'contact',
          name,
          filter_json,
        });
        const entity_type = type === 'lead' ? 'lead' : 'contact';
        const res = await savedListFiltersAPI.list({ entity_type });
        setSavedFilters(res?.data?.data ?? []);
      } catch (e) {
        window.alert(e?.response?.data?.error || e?.message || 'Could not save filter.');
      }
    },
    [type, handleFilterModalApply, buildFilterJsonSnapshot]
  );

  const handleUpdateNamedFilter = useCallback(
    async (id, name, payload) => {
      handleFilterModalApply(payload);
      const filter_json = buildFilterJsonSnapshot(payload);
      try {
        await savedListFiltersAPI.update(id, { name, filter_json });
        const entity_type = type === 'lead' ? 'lead' : 'contact';
        const res = await savedListFiltersAPI.list({ entity_type });
        setSavedFilters(res?.data?.data ?? []);
      } catch (e) {
        window.alert(e?.response?.data?.error || e?.message || 'Could not update filter.');
      }
    },
    [type, handleFilterModalApply, buildFilterJsonSnapshot]
  );

  const resetAllListFilters = useCallback(() => {
    setSearchQuery('');
    setAppliedCampaignIdsMulti('');
    setAppliedTagIdsMulti('');
    setAppliedStatusIdsMulti('');
    setAppliedManagerFilter(FILTER_ALL);
    setAppliedAdminManagersMulti('');
    setAppliedAgentFilter(FILTER_ALL);
    setTouchStatusFilter(FILTER_ALL);
    setMinCallCountFilter('');
    setMaxCallCountFilter('');
    setLastCalledPreset(FILTER_ALL);
    setLeadColumnFilters([]);
    setContactColumnFilters([]);
    setLeadSortBy(null);
    setLeadSortDir('desc');
    setContactSortBy(null);
    setContactSortDir('desc');
    setPage(1);
    clearSelection();
    setEditingSavedFilterId(null);
    setEditingSavedFilterName('');
    setEditingSavedFilterSnapshot(null);
  }, [clearSelection]);

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

  const adminManagersFilterActive = useMemo(() => {
    if (role !== 'admin' || !appliedAdminManagersMulti) return false;
    try {
      const a = JSON.parse(appliedAdminManagersMulti);
      return Array.isArray(a) && a.length > 0;
    } catch {
      return false;
    }
  }, [role, appliedAdminManagersMulti]);

  const campaignFilterActive = useMemo(() => {
    try {
      const a = JSON.parse(appliedCampaignIdsMulti || '[]');
      return Array.isArray(a) && a.length > 0;
    } catch {
      return false;
    }
  }, [appliedCampaignIdsMulti]);

  const tagFilterActive = useMemo(() => {
    try {
      const a = JSON.parse(appliedTagIdsMulti || '[]');
      return Array.isArray(a) && a.length > 0;
    } catch {
      return false;
    }
  }, [appliedTagIdsMulti]);

  const statusFilterActive = useMemo(() => {
    try {
      const a = JSON.parse(appliedStatusIdsMulti || '[]');
      return Array.isArray(a) && a.length > 0;
    } catch {
      return false;
    }
  }, [appliedStatusIdsMulti]);

  const dialerFilterActive =
    isDialer &&
    type === 'lead' &&
    ((touchStatusFilter && touchStatusFilter !== FILTER_ALL) ||
      (minCallCountFilter !== '' && Number.isFinite(Number(minCallCountFilter))) ||
      (maxCallCountFilter !== '' && Number.isFinite(Number(maxCallCountFilter))) ||
      (lastCalledPreset && lastCalledPreset !== FILTER_ALL));

  const hasActiveFilters =
    (type === 'lead' && leadColumnFilters.length > 0) ||
    (type === 'contact' && contactColumnFilters.length > 0) ||
    (role === 'admin' &&
      (appliedManagerFilter !== FILTER_ALL || adminManagersFilterActive || appliedAgentFilter !== FILTER_ALL)) ||
    (role === 'manager' && appliedAgentFilter !== FILTER_ALL) ||
    (showCampaign && campaignFilterActive) ||
    tagFilterActive ||
    statusFilterActive ||
    dialerFilterActive;

  const filterModalBasicsFromSnapshot = useMemo(() => {
    if (!editingSavedFilterSnapshot || editingSavedFilterSnapshot.version !== 1 || editingSavedFilterId == null) {
      return null;
    }
    const s = editingSavedFilterSnapshot;
    return {
      initialRules:
        type === 'lead'
          ? Array.isArray(s.leadColumnFilters)
            ? s.leadColumnFilters
            : []
          : Array.isArray(s.contactColumnFilters)
            ? s.contactColumnFilters
            : [],
      initialCampaignIdsMulti: campaignMultiFromSnapshot(s),
      initialAdminManagersMulti: s.appliedAdminManagersMulti ?? s.draftAdminManagersMultiForBar ?? '',
      initialAgentFilter: s.appliedAgentFilter ?? FILTER_ALL,
      initialTagIdsMulti: s.appliedTagIdsMulti ?? '',
      initialStatusIdsMulti: s.appliedStatusIdsMulti ?? '',
      initialTouchStatus: s.touchStatusFilter ?? FILTER_ALL,
      initialMinCallCount: s.minCallCountFilter ?? '',
      initialMaxCallCount: s.maxCallCountFilter ?? '',
      initialLastCalledPreset: s.lastCalledPreset ?? FILTER_ALL,
    };
  }, [editingSavedFilterSnapshot, editingSavedFilterId, type]);

  const showListReset = canRead && (hasActiveFilters || Boolean(searchQuery.trim()));

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
          isDialer ? (
            <Button variant="secondary" onClick={() => navigate('/calls/history')}>
              Call history
            </Button>
          ) : null
        }
      />

      {contactsError && <Alert variant="error">{contactsError}</Alert>}
      {unassignError ? (
        <Alert variant="error" style={{ marginTop: contactsError ? 8 : 0 }}>
          {unassignError}
        </Alert>
      ) : null}

      {type === 'lead' && canRead && !isDialer ? (
        <LeadPipelineCards data={leadPipelineData} loading={leadPipelineLoading} />
      ) : null}

      {type === 'contact' && canRead && !isDialer ? (
        <ContactDashboardCards data={contactDashboardData} loading={contactDashboardLoading} />
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
                  <span className={listStyles.bulkSelectionCount}>{selectedIds.size} selected</span>
                ) : bulkHint ? (
                  <span className={listStyles.bulkToolbarHint}>{bulkHint}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={pageStyles.toolbarSearchAndBulk}>
            {showListReset ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={resetAllListFilters}
                className={`${pageStyles.toolbarResetBtn} ${pageStyles.toolbarControlBtn}`.trim()}
              >
                <IconReset />
                Reset
              </Button>
            ) : null}
            {showRowCheckboxes && (pagination.total || 0) > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={pageStyles.toolbarControlBtn}
                disabled={selectAllMatchingLoading}
                onClick={() => void handleSelectAllToggle()}
              >
                {selectAllMatchingLoading
                  ? 'Loading…'
                  : selectionIsAllMatching && selectedIds.size > 0
                    ? 'Deselect all'
                    : 'Select all'}
              </Button>
            ) : null}
            {canRead || canCreate || showRowCheckboxes || (isDialer && type === 'lead') ? (
              <div className={pageStyles.toolbarBulkActionsGroup}>
                <ListActionsMenu
                  showFiltersEntry={canRead}
                  onOpenFilters={() => setFilterOptionsOpen(true)}
                  canRead={canRead}
                  canCreate={canCreate}
                  type={type}
                  navigate={navigate}
                  onCustomizeColumns={() =>
                    type === 'lead' ? setLeadCustomizeOpen(true) : setContactCustomizeOpen(true)
                  }
                  onOpenExport={() => setExportCsvOpen(true)}
                  isDialer={isDialer}
                  onCallSelected={() => openStartModal()}
                  canBulkAssign={canBulkAssign}
                  canBulkDelete={canBulkDelete}
                  canBulkTag={canBulkTag}
                  bulkBusy={assignMutation.loading || bulkDeleteMutation.loading}
                  noBulkSelection={selectedIds.size === 0}
                  onAssign={() => setAssignOpen(true)}
                  onUnassign={openUnassignConfirm}
                  onBulkDelete={() => setBulkDeleteConfirmOpen(true)}
                  onAddTag={() => setBulkTagOpen(true)}
                  onRemoveTag={() => setBulkRemoveTagOpen(true)}
                />
              </div>
            ) : null}
            <SearchInput
              value={searchQuery}
              onSearch={handleSearch}
              className={pageStyles.toolbarSearchField}
              placeholder="Search... (press Enter)"
            />
          </div>
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
                      ? 'Adjust filters from Actions → Filters.'
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
                onView={(c) => navigate(`/leads/${c.id}?mode=view`)}
                onEdit={(c) => navigate(`/leads/${c.id}?mode=edit`)}
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
                onView={(c) => navigate(`/contacts/${c.id}?mode=view`)}
                onEdit={(c) => navigate(`/contacts/${c.id}?mode=edit`)}
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

      {/* Dialer start modal removed (setup is now a standalone page). */}

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (!deleteItem) return;
          const deletedId = deleteItem.id;
          const result = await deleteMutation.mutate(deletedId);
          if (result?.success) {
            setDeleteItem(null);
            setSelectedIds((prev) => {
              if (!prev.has(deletedId)) return prev;
              const next = new Set(prev);
              next.delete(deletedId);
              return next;
            });
            // if we deleted the last item on the page, try stepping back
            if (contacts.length === 1 && page > 1) setPage(page - 1);
            refetch();
            setSummaryRefreshKey((k) => k + 1);
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
            setSummaryRefreshKey((k) => k + 1);
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

      <AddTagsBulkModal
        isOpen={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        selectedIds={[...selectedIds]}
        recordLabel={type === 'lead' ? 'leads' : 'contacts'}
        onSuccess={() => {
          clearSelection();
          refetch();
        }}
      />

      <RemoveTagsBulkModal
        isOpen={bulkRemoveTagOpen}
        onClose={() => setBulkRemoveTagOpen(false)}
        selectedIds={[...selectedIds]}
        recordLabel={type === 'lead' ? 'leads' : 'contacts'}
        onSuccess={() => {
          clearSelection();
          refetch();
        }}
      />

      <ExportCsvModal
        isOpen={exportCsvOpen}
        onClose={() => setExportCsvOpen(false)}
        type={type}
        listQueryParams={exportListParams}
        applicableColumns={type === 'lead' ? leadApplicableColumns : contactApplicableColumns}
        visibleColumnIds={type === 'lead' ? leadVisibleColumnIds : contactVisibleColumnIds}
        selectedIds={selectedIds}
        totalMatching={pagination.total || 0}
        allowSelectedScope={showRowCheckboxes}
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

      {canRead ? (
        <>
          <FilterOptionsModal
            isOpen={filterOptionsOpen}
            onClose={() => setFilterOptionsOpen(false)}
            onCreateNew={() => {
              setEditingSavedFilterId(null);
              setEditingSavedFilterName('');
              setEditingSavedFilterSnapshot(null);
              setAdvancedFilterOpen(true);
            }}
            onBrowseExisting={() => setBrowseFiltersOpen(true)}
          />
          <BrowseSavedFiltersModal
            isOpen={browseFiltersOpen}
            onClose={() => setBrowseFiltersOpen(false)}
            filters={savedFilters}
            onApply={handleBrowseSavedApply}
            onEdit={handleBrowseSavedEdit}
            onDelete={handleBrowseSavedDelete}
          />
          <ContactAdvancedFilterModal
            isOpen={advancedFilterOpen}
            onClose={() => {
              setAdvancedFilterOpen(false);
              setEditingSavedFilterId(null);
              setEditingSavedFilterName('');
              setEditingSavedFilterSnapshot(null);
            }}
            initialRules={
              filterModalBasicsFromSnapshot
                ? filterModalBasicsFromSnapshot.initialRules
                : type === 'lead'
                  ? leadColumnFilters
                  : contactColumnFilters
            }
            onApply={handleFilterModalApply}
            onSaveNamedFilter={handleFilterSaveNamed}
            onUpdateNamedFilter={handleUpdateNamedFilter}
            savedFilterId={editingSavedFilterId}
            initialSavedFilterName={editingSavedFilterName}
            showCampaign={showCampaign}
            campaignOptions={campaignMultiOptions}
            initialCampaignIdsMulti={
              filterModalBasicsFromSnapshot?.initialCampaignIdsMulti ?? appliedCampaignIdsMulti
            }
            showManagersMulti={showOwnershipFilters && role === 'admin'}
            adminManagerOptions={adminManagerMultiOptions}
            initialAdminManagersMulti={
              filterModalBasicsFromSnapshot?.initialAdminManagersMulti ?? appliedAdminManagersMulti
            }
            showAgent={showOwnershipFilters}
            agentOptions={agentFilterOptionsForModal}
            initialAgentFilter={filterModalBasicsFromSnapshot?.initialAgentFilter ?? appliedAgentFilter}
            showTags={canRead}
            tagOptions={tagMultiOptions}
            initialTagIdsMulti={filterModalBasicsFromSnapshot?.initialTagIdsMulti ?? appliedTagIdsMulti}
            showStatuses={canRead}
            statusOptions={statusMultiOptions}
            initialStatusIdsMulti={
              filterModalBasicsFromSnapshot?.initialStatusIdsMulti ?? appliedStatusIdsMulti
            }
            showDialerFilters={isDialer && type === 'lead'}
            initialTouchStatus={filterModalBasicsFromSnapshot?.initialTouchStatus ?? touchStatusFilter}
            initialMinCallCount={filterModalBasicsFromSnapshot?.initialMinCallCount ?? minCallCountFilter}
            initialMaxCallCount={filterModalBasicsFromSnapshot?.initialMaxCallCount ?? maxCallCountFilter}
            initialLastCalledPreset={
              filterModalBasicsFromSnapshot?.initialLastCalledPreset ?? lastCalledPreset
            }
            existingSavedFilters={savedFilters.map((f) => ({ id: f.id, name: f.name }))}
          />
        </>
      ) : null}
    </div>
  );
}

