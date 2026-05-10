import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { useAnyPermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignTypesAPI, campaignStatusesAPI } from '../../services/dispositionAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../components/ui/Table';
import { ConfirmModal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { Checkbox } from '../../components/ui/Checkbox';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, ViewIcon, ArchiveIcon, TrashIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { PipelineMetricCard } from '../contacts/PipelineMetricCard';
import leadDashStyles from '../contacts/LeadPipelineCards.module.scss';
import pageStyles from './CampaignsPage.module.scss';
import { isNoListFilter } from '../../utils/listFilterNarrowing';
import { dealsAPI } from '../../services/dealsAPI';
import { channelIconFromCampaign, readCampaignSettings } from './campaignFormHelpers';

function campaignRowStatusBadge(c) {
  if (c.deleted_at) {
    return { className: pageStyles.statusArchived, label: 'Archived' };
  }
  if (c.status === 'paused') {
    return { className: pageStyles.statusPaused, label: 'Paused' };
  }
  const name = (c.campaign_status_name || '').toLowerCase();
  if (name.includes('plan')) {
    return { className: pageStyles.statusPlanning, label: c.campaign_status_name || 'Planning' };
  }
  if (name.includes('complete')) {
    return { className: pageStyles.statusCompleted, label: c.campaign_status_name || 'Completed' };
  }
  if (name.includes('cancel')) {
    return { className: pageStyles.statusCancelled, label: c.campaign_status_name || 'Cancelled' };
  }
  return { className: pageStyles.statusActive, label: c.campaign_status_name || 'Active' };
}

const TYPE_FILTER_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'filter', label: 'Filter' },
];

export function CampaignsPage() {
  const navigate = useNavigate();
  const { formatDateTime } = useDateTimeDisplay();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';

  const canRead = useAnyPermission(['contacts.read', 'leads.read']);
  const canCreate = useAnyPermission(['contacts.create', 'leads.create']);
  const canDelete = useAnyPermission(['contacts.delete', 'leads.delete']);
  const isAdmin = role === 'admin';

  const [managerMap, setManagerMap] = useState({});
  const [campaignTypeRows, setCampaignTypeRows] = useState([]);
  const [campaignStatusRows, setCampaignStatusRows] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [draftManagerFilter, setDraftManagerFilter] = useState('');
  const [draftTypeFilter, setDraftTypeFilter] = useState('');

  const [appliedManagerFilter, setAppliedManagerFilter] = useState('');
  const [appliedTypeFilter, setAppliedTypeFilter] = useState('');

  /** Toolbar toggles (immediate refetch), same pattern as “Show inactive” on other list pages */
  const [showPaused, setShowPaused] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [archiveCampaign, setArchiveCampaign] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const [purgeCampaign, setPurgeCampaign] = useState(null);
  const [purgeError, setPurgeError] = useState('');

  const [pipelineOptions, setPipelineOptions] = useState([]);

  const [draftDealPipelineFilter, setDraftDealPipelineFilter] = useState('');
  const [draftMasterTypeId, setDraftMasterTypeId] = useState('');
  const [draftCrmStatusId, setDraftCrmStatusId] = useState('');
  const [appliedDealPipelineFilter, setAppliedDealPipelineFilter] = useState('');
  const [appliedMasterTypeId, setAppliedMasterTypeId] = useState('');
  const [appliedCrmStatusId, setAppliedCrmStatusId] = useState('');

  const listParams = useMemo(() => {
    const params = {
      page,
      limit,
      search: searchQuery || undefined,
      show_paused: showPaused,
      include_archived: isAdmin ? includeArchived : false,
    };
    if (!isNoListFilter(appliedTypeFilter)) {
      params.type = appliedTypeFilter;
    }
    if (appliedManagerFilter === 'unassigned') {
      params.manager_id = 'unassigned';
    } else if (!isNoListFilter(appliedManagerFilter)) {
      params.manager_id = appliedManagerFilter;
    }
    if (!isNoListFilter(appliedMasterTypeId)) {
      params.campaign_type_master_id = appliedMasterTypeId;
    }
    if (!isNoListFilter(appliedCrmStatusId)) {
      params.campaign_status_master_id = appliedCrmStatusId;
    }
    if (!isNoListFilter(appliedDealPipelineFilter)) {
      params.pipeline_id = appliedDealPipelineFilter;
    }
    return params;
  }, [
    page,
    limit,
    searchQuery,
    showPaused,
    includeArchived,
    appliedTypeFilter,
    appliedManagerFilter,
    appliedMasterTypeId,
    appliedCrmStatusId,
    appliedDealPipelineFilter,
    isAdmin,
  ]);

  const fetchList = useCallback(() => campaignsAPI.list(listParams), [listParams]);

  const {
    data: listResponse,
    loading,
    error,
    refetch,
  } = useAsyncData(fetchList, [fetchList], {
    transform: (res) => res?.data ?? { data: [], pagination: { total: 0, totalPages: 1, page: 1, limit: 20 } },
  });

  const fetchStats = useCallback(() => campaignsAPI.stats(), []);
  const { data: statsData, refetch: refetchStats, loading: statsLoading } = useAsyncData(fetchStats, [fetchStats], {
    transform: (res) => res?.data?.data ?? null,
  });

  const campaigns = Array.isArray(listResponse?.data) ? listResponse.data : [];
  const pagination = listResponse?.pagination ?? { total: 0, totalPages: 1, page, limit };

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Agents cannot list tenant users (requires users.manage / users.team); skip to avoid breaking the whole page.
        const needsUserDirectory = role !== 'agent';
        const [uRes, ctRes, csRes] = await Promise.all([
          needsUserDirectory
            ? tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false })
            : Promise.resolve({ data: { data: [] } }),
          campaignTypesAPI.getOptions().catch(() => ({ data: { data: [] } })),
          campaignStatusesAPI.getOptions().catch(() => ({ data: { data: [] } })),
        ]);
        if (cancelled) return;
        const rows = uRes.data?.data ?? [];
        const map = {};
        for (const u of rows) {
          if (u.role === 'manager') map[u.id] = u.name || u.email;
        }
        setManagerMap(map);
        setCampaignTypeRows(ctRes.data?.data ?? []);
        setCampaignStatusRows(csRes.data?.data ?? []);
      } catch {
        if (!cancelled) {
          setManagerMap({});
          setCampaignTypeRows([]);
          setCampaignStatusRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dealsAPI.list({ include_inactive: false });
        const rows = res.data?.data ?? [];
        if (!cancelled) {
          setPipelineOptions(rows.map((p) => ({ value: String(p.id), label: p.name || '—' })));
        }
      } catch {
        if (!cancelled) setPipelineOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteMut = useMutation((id) => campaignsAPI.softDelete(id));
  const purgeMut = useMutation((id) => campaignsAPI.permanentDelete(id));

  const managerOptions = useMemo(() => {
    return Object.entries(managerMap)
      .map(([id, label]) => ({ value: id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [managerMap]);

  const campaignManagerFilterOptions = useMemo(() => {
    if (role === 'admin') {
      return [{ value: 'unassigned', label: 'No manager' }, ...managerOptions];
    }
    if (role === 'manager' && user?.id) {
      return [
        { value: 'unassigned', label: 'No manager' },
        { value: String(user.id), label: 'My campaigns' },
      ];
    }
    return [];
  }, [role, user?.id, managerOptions]);

  const showCampaignFilters = role === 'admin' || role === 'manager' || role === 'agent';

  const applyFilters = useCallback(() => {
    setAppliedManagerFilter(draftManagerFilter);
    setAppliedTypeFilter(draftTypeFilter);
    setAppliedDealPipelineFilter(draftDealPipelineFilter);
    setAppliedMasterTypeId(draftMasterTypeId);
    setAppliedCrmStatusId(draftCrmStatusId);
    setPage(1);
  }, [draftManagerFilter, draftTypeFilter, draftDealPipelineFilter, draftMasterTypeId, draftCrmStatusId]);

  const resetFilters = useCallback(() => {
    setDraftManagerFilter('');
    setDraftTypeFilter('');
    setDraftDealPipelineFilter('');
    setDraftMasterTypeId('');
    setDraftCrmStatusId('');
    setAppliedManagerFilter('');
    setAppliedTypeFilter('');
    setAppliedDealPipelineFilter('');
    setAppliedMasterTypeId('');
    setAppliedCrmStatusId('');
    setPage(1);
    setSearchQuery('');
  }, []);

  const handleSearch = useCallback((value) => {
    setSearchQuery(value || '');
    setPage(1);
  }, []);

  const totalPages = Math.max(1, pagination.totalPages || 1);

  const hasActiveFilters =
    !isNoListFilter(appliedManagerFilter) ||
    !isNoListFilter(appliedTypeFilter) ||
    !isNoListFilter(appliedDealPipelineFilter) ||
    !isNoListFilter(appliedMasterTypeId) ||
    !isNoListFilter(appliedCrmStatusId);

  const pipelineNameById = useMemo(() => {
    const m = {};
    for (const o of pipelineOptions) {
      m[o.value] = o.label;
    }
    return m;
  }, [pipelineOptions]);

  const openCreate = () => navigate('/campaigns/new');

  const openEdit = (row) => {
    if (!row?.id || row.deleted_at) return;
    navigate(`/campaigns/${row.id}/edit`);
  };

  const openArchiveConfirm = (row) => {
    if (!row?.id) return;
    setArchiveError('');
    setArchiveCampaign(row);
  };

  const closeArchiveConfirm = () => {
    if (deleteMut.loading) return;
    setArchiveCampaign(null);
    setArchiveError('');
  };

  const confirmArchive = async () => {
    if (!archiveCampaign?.id) return;
    setArchiveError('');
    const result = await deleteMut.mutate(archiveCampaign.id);
    if (result?.success) {
      setArchiveCampaign(null);
      if (campaigns.length === 1 && page > 1) setPage((p) => p - 1);
      refetch();
      refetchStats();
    } else {
      setArchiveError(result?.error || 'Could not archive campaign');
    }
  };

  const closePurgeConfirm = () => {
    if (purgeMut.loading) return;
    setPurgeCampaign(null);
    setPurgeError('');
  };

  const confirmPurge = async () => {
    if (!purgeCampaign?.id) return;
    setPurgeError('');
    const result = await purgeMut.mutate(purgeCampaign.id);
    if (result?.success) {
      setPurgeCampaign(null);
      if (campaigns.length === 1 && page > 1) setPage((p) => p - 1);
      refetch();
      refetchStats();
    } else {
      setPurgeError(result?.error || 'Could not delete campaign');
    }
  };

  if (!canRead) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Campaigns" />
        <Alert variant="error" display="inline">
          You do not have permission to view campaigns.
        </Alert>
      </div>
    );
  }

  const totalCampaignsKpi = statsData?.total ?? 0;
  const activeDialerKpi = statsData?.activeDialer ?? 0;

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Campaigns"
        titleIcon="campaign"
        description={
          role === 'agent'
            ? 'Campaigns you can access—open one to work assigned records.'
            : 'Manage and track outbound programs: static membership, dynamic filters, and channel notes in one place.'
        }
        actions={
          isAdmin && canCreate ? (
            <Button variant="primary" onClick={openCreate}>
              + New campaign
            </Button>
          ) : null
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <section className={leadDashStyles.section} aria-label="Campaign summary">
        <div className={leadDashStyles.grid5}>
          <PipelineMetricCard
            variant="campaign_total"
            label="Total campaigns"
            value={totalCampaignsKpi.toLocaleString()}
            subtext="All non-archived you can see"
            loading={statsLoading}
          />
          <PipelineMetricCard
            variant="campaign_dialer"
            label="Dialer active"
            value={activeDialerKpi.toLocaleString()}
            subtext="Ready for agents to open"
            loading={statsLoading}
          />
          <PipelineMetricCard
            variant="campaign_filter"
            label="Filter audiences"
            value={(statsData?.filterType ?? 0).toLocaleString()}
            subtext="Dynamic rule campaigns"
            loading={statsLoading}
          />
          <PipelineMetricCard
            variant="campaign_engagement"
            label="Engagement"
            value={null}
            subtext="Opens / clicks when email analytics is linked"
            loading={statsLoading}
          />
          <PipelineMetricCard
            variant="campaign_click"
            label="Click rate"
            value={null}
            subtext="Reserved for future reporting"
            loading={statsLoading}
          />
        </div>
      </section>

      {showCampaignFilters ? (
        <div className={pageStyles.filterPanelWrap}>
          <FilterBar onApply={applyFilters} onReset={resetFilters} fluid>
            {role === 'admin' || role === 'manager' ? (
              role === 'admin' ? (
                <Select
                  allowEmpty
                  label="Owner"
                  placeholder="All managers"
                  value={draftManagerFilter || ''}
                  onChange={(e) => setDraftManagerFilter(e.target.value)}
                  options={campaignManagerFilterOptions}
                  className={pageStyles.filterSelect}
                />
              ) : (
                <Select
                  allowEmpty
                  label="Scope"
                  placeholder="All visible"
                  value={draftManagerFilter || ''}
                  onChange={(e) => setDraftManagerFilter(e.target.value)}
                  options={campaignManagerFilterOptions}
                  className={pageStyles.filterSelect}
                />
              )
            ) : null}
            <Select
              allowEmpty
              label="Pipelines"
              placeholder="All pipelines"
              value={draftDealPipelineFilter || ''}
              onChange={(e) => setDraftDealPipelineFilter(e.target.value)}
              options={[{ value: '', label: 'All pipelines' }, ...pipelineOptions]}
              className={pageStyles.filterSelect}
            />
            <Select
              allowEmpty
              label="CRM status"
              placeholder="All statuses"
              value={draftCrmStatusId || ''}
              onChange={(e) => setDraftCrmStatusId(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                ...campaignStatusRows.map((r) => ({ value: String(r.id), label: r.name || r.code || '—' })),
              ]}
              className={pageStyles.filterSelect}
            />
            <Select
              allowEmpty
              label="Campaign type"
              placeholder="All channel types"
              value={draftMasterTypeId || ''}
              onChange={(e) => setDraftMasterTypeId(e.target.value)}
              options={[
                { value: '', label: 'All types' },
                ...campaignTypeRows.map((r) => ({ value: String(r.id), label: r.name || r.code || '—' })),
              ]}
              className={pageStyles.filterSelect}
            />
            <Select
              allowEmpty
              label="Audience"
              placeholder="All audience modes"
              value={draftTypeFilter || ''}
              onChange={(e) => setDraftTypeFilter(e.target.value)}
              options={TYPE_FILTER_OPTIONS}
              className={pageStyles.filterSelect}
            />
          </FilterBar>
        </div>
      ) : null}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            <PaginationPageSize
              limit={pagination.limit || limit}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
            <Checkbox
              label="Show paused"
              checked={showPaused}
              onChange={(e) => {
                setShowPaused(e.target.checked);
                setPage(1);
              }}
            />
            {isAdmin ? (
              <Checkbox
                label="Show archived"
                checked={includeArchived}
                onChange={(e) => {
                  setIncludeArchived(e.target.checked);
                  setPage(1);
                }}
              />
            ) : null}
          </div>
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            className={listStyles.searchInToolbar}
            placeholder="Search campaigns… (press Enter)"
          />
        </div>
        <TableDataRegion
          loading={loading}
          hasCompletedInitialFetch={hasCompletedInitialFetch}
          skeletonColumns={11}
        >
          {!campaigns?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📣"
                title={
                  searchQuery
                    ? 'No results found'
                    : hasActiveFilters
                      ? 'No campaigns match filters'
                      : showPaused || (isAdmin && includeArchived)
                        ? 'No results found'
                        : 'No campaigns yet'
                }
                description={
                  searchQuery
                    ? 'Try another search.'
                    : hasActiveFilters
                      ? 'Change filters and click Apply, or Reset.'
                      : showPaused || (isAdmin && includeArchived)
                        ? 'Try a different search or turn off Show paused / Show archived.'
                        : isAdmin
                          ? 'Optional owning manager: assign to restrict visibility to one manager, or leave empty so every manager can use the campaign. Static campaigns use campaign_id on contacts; filter campaigns use dynamic rules.'
                          : 'Your admin has not created campaigns yet.'
                }
                action={
                  isAdmin &&
                  canCreate &&
                  !searchQuery &&
                  !hasActiveFilters &&
                  !showPaused &&
                  !includeArchived
                    ? openCreate
                    : undefined
                }
                actionLabel={
                  isAdmin &&
                  canCreate &&
                  !searchQuery &&
                  !hasActiveFilters &&
                  !showPaused &&
                  !includeArchived
                    ? 'Create campaign'
                    : undefined
                }
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
              <Table variant="adminList">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Campaign</TableHeaderCell>
                    <TableHeaderCell>Pipeline</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Audience</TableHeaderCell>
                    <TableHeaderCell>Est. size</TableHeaderCell>
                    <TableHeaderCell>Sent</TableHeaderCell>
                    <TableHeaderCell>Open rate</TableHeaderCell>
                    <TableHeaderCell>Click rate</TableHeaderCell>
                    <TableHeaderCell>Last activity</TableHeaderCell>
                    <TableHeaderCell width="200px" align="center">
                      Actions
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map((c) => {
                    const isArchived = Boolean(c.deleted_at);
                    const settings = readCampaignSettings(c);
                    const pipelineId =
                      settings.pipeline_id != null ? String(settings.pipeline_id) : '';
                    const pipelineLabel = pipelineId ? pipelineNameById[pipelineId] || '—' : '—';
                    const est =
                      settings.audience_estimate_total != null
                        ? Number(settings.audience_estimate_total)
                        : null;
                    const badge = campaignRowStatusBadge(c);
                    const chIcon = channelIconFromCampaign(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className={pageStyles.nameCell}>
                            <span className={pageStyles.nameCellIcon}>{chIcon}</span>
                            <div className={pageStyles.nameCellText}>
                              <span className={pageStyles.nameCellTitle}>{c.name}</span>
                              <div className={pageStyles.nameCellMeta}>ID: CMP-{c.id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{pipelineLabel}</TableCell>
                        <TableCell>{c.campaign_type_name || '—'}</TableCell>
                        <TableCell>
                          <span className={`${pageStyles.statusBadge} ${badge.className}`.trim()}>
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell>{c.type === 'filter' ? 'Dynamic filter' : 'Static'}</TableCell>
                        <TableCell>
                          {c.type === 'filter' && est != null && Number.isFinite(est)
                            ? est.toLocaleString()
                            : '—'}
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>
                          <span>—</span>
                          <span
                            className={pageStyles.miniBar}
                            style={{ '--bar-pct': '0%', '--bar-color': '#22c55e' }}
                          />
                        </TableCell>
                        <TableCell>
                          <span>—</span>
                          <span
                            className={pageStyles.miniBar}
                            style={{
                              '--bar-pct': '0%',
                              '--bar-color': 'var(--color-accent-brand)',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {c.updated_at ? formatDateTime(c.updated_at) : formatDateTime(c.created_at)}
                        </TableCell>
                        <TableCell align="center">
                          <RowActionGroup>
                            {role === 'agent' && c.status === 'active' && !isArchived ? (
                              <IconButton
                                size="sm"
                                variant="subtle"
                                title="Open campaign"
                                onClick={() => navigate(`/campaigns/${c.id}/open`)}
                              >
                                <ViewIcon />
                              </IconButton>
                            ) : null}
                            {isAdmin ? (
                              <>
                                <IconButton
                                  size="sm"
                                  title={isArchived ? 'Archived campaigns cannot be edited' : 'Edit'}
                                  onClick={() => openEdit(c)}
                                  disabled={isArchived}
                                >
                                  <EditIcon />
                                </IconButton>
                                {canDelete && !isArchived ? (
                                  <IconButton
                                    size="sm"
                                    variant="warning"
                                    title="Archive"
                                    onClick={() => openArchiveConfirm(c)}
                                    disabled={deleteMut.loading}
                                  >
                                    <ArchiveIcon />
                                  </IconButton>
                                ) : null}
                                {canDelete && isArchived && includeArchived ? (
                                  <IconButton
                                    size="sm"
                                    variant="danger"
                                    title="Permanently delete"
                                    onClick={() => {
                                      setPurgeError('');
                                      setPurgeCampaign(c);
                                    }}
                                    disabled={purgeMut.loading}
                                  >
                                    <TrashIcon />
                                  </IconButton>
                                ) : null}
                              </>
                            ) : null}
                          </RowActionGroup>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TableDataRegion>
        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pagination.page || page}
            totalPages={totalPages}
            total={pagination.total ?? 0}
            limit={pagination.limit || limit}
            onPageChange={(p) => setPage(p)}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
            hidePageSize
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={!!archiveCampaign}
        onClose={closeArchiveConfirm}
        onConfirm={confirmArchive}
        title="Archive campaign"
        message={
          archiveError ||
          `Archive “${archiveCampaign?.name || 'this campaign'}”? This archives the campaign (soft delete): it leaves the default list and cannot be edited or opened by agents. That is “finished” as a usable campaign, not the same as every lead being done—contacts can still be tied to this campaign until you change them. Use “Show archived” to find it later; audit fields record who archived it and when.`
        }
        confirmText="Archive"
        cancelText="Cancel"
        variant="primary"
        loading={deleteMut.loading}
      />

      <ConfirmModal
        isOpen={!!purgeCampaign}
        onClose={closePurgeConfirm}
        onConfirm={confirmPurge}
        title="Permanently delete campaign"
        message={
          purgeError ||
          `Permanently delete “${purgeCampaign?.name || 'this campaign'}”? This cannot be undone. The row must already be archived.`
        }
        confirmText="Delete permanently"
        cancelText="Cancel"
        variant="danger"
        loading={purgeMut.loading}
      />
    </div>
  );
}
