import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { useAnyPermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { contactStatusesAPI } from '../../services/dispositionAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../components/ui/Table';
import { Modal, ModalFooter, ConfirmModal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { Checkbox } from '../../components/ui/Checkbox';
import { CampaignFilterBuilder } from './CampaignFilterBuilder';
import { defaultRule, getPropertyMeta, ruleNeedsValue, validateRulesForSave } from './campaignFilterConfig';
import listStyles from '../../components/admin/adminDataList.module.scss';
import pageStyles from './CampaignsPage.module.scss';

function parseFilters(campaign) {
  if (!campaign?.filters_json) return {};
  const raw = campaign.filters_json;
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function rulesFromCampaign(campaign) {
  const raw = parseFilters(campaign);
  if (raw.rules && Array.isArray(raw.rules) && raw.rules.length > 0) {
    const cleaned = raw.rules
      .filter((r) => r && r.property !== 'tag')
      .map((r) => {
        let property = r.property || 'type';
        let op = r.op || 'eq';
        let value = r.value;
        if (property === 'tag_id' && op === 'eq' && value != null && value !== '') {
          op = 'in';
          value = [value];
        }
        return { property, op, value };
      });
    if (cleaned.length) return cleaned;
  }
  const legacy = [];
  if (raw.source) legacy.push({ property: 'source', op: 'eq', value: raw.source });
  if (raw.status_id) legacy.push({ property: 'status_id', op: 'eq', value: raw.status_id });
  if (raw.type) legacy.push({ property: 'type', op: 'eq', value: raw.type });
  return legacy.length ? legacy : [defaultRule()];
}

function sanitizeRuleForApi(r) {
  const meta = getPropertyMeta(r.property);
  const out = { property: r.property, op: r.op };
  if (!ruleNeedsValue(r.op)) return out;

  if (r.op === 'in') {
    const arr = Array.isArray(r.value) ? r.value : [];
    if (['manager_id', 'assigned_user_id', 'campaign_id', 'tag_id'].includes(r.property)) {
      out.value = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    } else {
      out.value = arr;
    }
    return out;
  }

  if (['manager_id', 'assigned_user_id', 'campaign_id', 'tag_id'].includes(r.property)) {
    const v = r.value;
    out.value = v == null || v === '' || v === 'none' ? null : Number(v);
    return out;
  }

  if (meta.valueType === 'datetime' && typeof r.value === 'string' && r.value.includes('T')) {
    const s = r.value.replace('T', ' ');
    out.value = s.length === 16 ? `${s}:00` : s;
    return out;
  }

  out.value = r.value;
  return out;
}

const emptyForm = {
  name: '',
  type: 'static',
  manager_id: '',
  status: 'active',
  filterRules: [defaultRule()],
};

const FILTER_ALL = '__all__';

const TYPE_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'All types' },
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [managerMap, setManagerMap] = useState({});
  const [tenantUsers, setTenantUsers] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [draftManagerFilter, setDraftManagerFilter] = useState(FILTER_ALL);
  const [draftTypeFilter, setDraftTypeFilter] = useState(FILTER_ALL);

  const [appliedManagerFilter, setAppliedManagerFilter] = useState(FILTER_ALL);
  const [appliedTypeFilter, setAppliedTypeFilter] = useState(FILTER_ALL);

  /** Toolbar toggles (immediate refetch), same pattern as “Show inactive” on other list pages */
  const [showPaused, setShowPaused] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit] = useState(10);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewPagination, setPreviewPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [archiveCampaign, setArchiveCampaign] = useState(null);
  const [archiveError, setArchiveError] = useState('');

  const listParams = useMemo(() => {
    const params = {
      page,
      limit,
      search: searchQuery || undefined,
      show_paused: showPaused,
      include_archived: isAdmin ? includeArchived : false,
    };
    if (appliedTypeFilter !== FILTER_ALL) {
      params.type = appliedTypeFilter;
    }
    if (appliedManagerFilter === 'unassigned') {
      params.manager_id = 'unassigned';
    } else if (appliedManagerFilter !== FILTER_ALL) {
      params.manager_id = appliedManagerFilter;
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

  const campaigns = Array.isArray(listResponse?.data) ? listResponse.data : [];
  const pagination = listResponse?.pagination ?? { total: 0, totalPages: 1, page, limit };

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Agents cannot list tenant users (requires users.manage / users.team); skip to avoid breaking the whole page.
        const needsUserDirectory = role !== 'agent';
        const [uRes, stRes, tagRes, cRes] = await Promise.all([
          needsUserDirectory
            ? tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false })
            : Promise.resolve({ data: { data: [] } }),
          contactStatusesAPI.getOptions().catch(() => ({ data: { data: [] } })),
          contactTagsAPI.list().catch(() => ({ data: { data: [] } })),
          campaignsAPI.list({ page: 1, limit: 500, show_paused: true }).catch(() => ({ data: { data: [] } })),
        ]);
        if (cancelled) return;
        const rows = uRes.data?.data ?? [];
        setTenantUsers(rows);
        const map = {};
        for (const u of rows) {
          if (u.role === 'manager') map[u.id] = u.name || u.email;
        }
        setManagerMap(map);
        const st = stRes.data?.data ?? [];
        setStatusOptions(st.map((s) => ({ value: String(s.id), label: s.name || s.code || s.id })));
        const tags = tagRes.data?.data ?? [];
        setTagList(tags);
        setAllCampaigns(cRes.data?.data ?? []);
      } catch {
        if (!cancelled) {
          setTenantUsers([]);
          setManagerMap({});
          setStatusOptions([]);
          setTagList([]);
          setAllCampaigns([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const createMut = useMutation((body) => campaignsAPI.create(body));
  const updateMut = useMutation((id, body) => campaignsAPI.update(id, body));
  const deleteMut = useMutation((id) => campaignsAPI.softDelete(id));

  const managerOptions = useMemo(() => {
    return Object.entries(managerMap)
      .map(([id, label]) => ({ value: id, label: `${label} (#${id})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [managerMap]);

  const agentOptions = useMemo(() => {
    return tenantUsers
      .filter((u) => u.role === 'agent')
      .map((u) => ({ value: String(u.id), label: u.name || u.email || `#${u.id}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tenantUsers]);

  const staticCampaignOptions = useMemo(() => {
    return (allCampaigns || [])
      .filter((c) => c.type === 'static')
      .map((c) => ({ value: String(c.id), label: c.name || `#${c.id}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allCampaigns]);

  const tagOptions = useMemo(() => {
    return (tagList || []).map((t) => ({ value: String(t.id), label: t.name || `#${t.id}` }));
  }, [tagList]);

  const campaignManagerFilterOptions = useMemo(() => {
    if (role === 'admin') {
      return [
        { value: FILTER_ALL, label: 'All managers' },
        { value: 'unassigned', label: 'Unassigned pool' },
        ...managerOptions,
      ];
    }
    if (role === 'manager' && user?.id) {
      return [
        { value: FILTER_ALL, label: 'All visible' },
        { value: 'unassigned', label: 'Unassigned pool' },
        { value: String(user.id), label: 'My campaigns' },
      ];
    }
    return [{ value: FILTER_ALL, label: 'All' }];
  }, [role, user?.id, managerOptions]);

  const showCampaignFilters = role === 'admin' || role === 'manager' || role === 'agent';

  const applyFilters = useCallback(() => {
    setAppliedManagerFilter(draftManagerFilter);
    setAppliedTypeFilter(draftTypeFilter);
    setPage(1);
  }, [draftManagerFilter, draftTypeFilter]);

  const resetFilters = useCallback(() => {
    setDraftManagerFilter(FILTER_ALL);
    setDraftTypeFilter(FILTER_ALL);
    setAppliedManagerFilter(FILTER_ALL);
    setAppliedTypeFilter(FILTER_ALL);
    setPage(1);
    setSearchQuery('');
  }, []);

  const handleSearch = useCallback((value) => {
    setSearchQuery(value || '');
    setPage(1);
  }, []);

  const totalPages = Math.max(1, pagination.totalPages || 1);

  const hasActiveFilters = appliedManagerFilter !== FILTER_ALL || appliedTypeFilter !== FILTER_ALL;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, manager_id: '', filterRules: [defaultRule()] });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      type: row.type || 'static',
      manager_id: row.manager_id != null ? String(row.manager_id) : '',
      status: row.status || 'active',
      filterRules: row.type === 'filter' ? rulesFromCampaign(row) : [defaultRule()],
    });
    setFormError('');
    setModalOpen(true);
  };

  const buildFiltersPayload = () => {
    const rules = (form.filterRules || []).map(sanitizeRuleForApi);
    return { version: 2, rules };
  };

  const runPreview = () => {
    setFormError('');
    const err = validateRulesForSave(form.filterRules || []);
    if (err) {
      setFormError(err);
      return;
    }
    setPreviewError('');
    setPreviewPage(1);
    setPreviewSearch('');
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const res = await campaignsAPI.preview({
          filters_json: { version: 2, rules: (form.filterRules || []).map(sanitizeRuleForApi) },
          page: previewPage,
          limit: previewLimit,
          search: previewSearch || undefined,
        });
        if (cancelled) return;
        setPreviewRows(res.data?.data ?? []);
        setPreviewPagination(
          res.data?.pagination ?? { page: 1, limit: previewLimit, total: 0, totalPages: 1 }
        );
      } catch (e) {
        if (!cancelled) setPreviewError(e?.response?.data?.error || e?.message || 'Preview failed');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen, previewPage, previewSearch, previewLimit, form.filterRules]);

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
    } else {
      setArchiveError(result?.error || 'Could not archive campaign');
    }
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name?.trim()) {
      setFormError('Name is required');
      return;
    }
    if (form.type === 'filter') {
      const vErr = validateRulesForSave(form.filterRules || []);
      if (vErr) {
        setFormError(vErr);
        return;
      }
    }

    const body = {
      name: form.name.trim(),
      manager_id: form.manager_id ? Number(form.manager_id) : null,
      status: form.status,
      filters_json: form.type === 'filter' ? buildFiltersPayload() : null,
    };
    if (!editing) {
      body.type = form.type;
    }

    let result;
    if (editing) {
      result = await updateMut.mutate(editing.id, body);
    } else {
      result = await createMut.mutate(body);
    }
    if (result?.success) {
      setModalOpen(false);
      refetch();
    } else {
      setFormError(result?.error || 'Save failed');
    }
  };

  function campaignRulesSummary(c) {
    if (c.type !== 'filter') return 'Set campaign on each contact / import';
    const f = parseFilters(c);
    if (f.rules?.length) return `${f.rules.length} rule(s)`;
    const bits = [f.source && 'source', f.status_id && 'status', f.type && 'type'].filter(Boolean);
    return bits.length ? `Legacy: ${bits.join(' · ')}` : '—';
  }

  if (!canRead) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Campaigns" />
        <Alert variant="error">You do not have permission to view campaigns.</Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Campaigns"
        description={
          role === 'agent'
            ? 'Campaigns in the tenant pool (no owning manager) and campaigns assigned to your manager. Open a campaign to work contacts assigned to you.'
            : 'Static campaigns tag contacts with campaign_id. Filter campaigns use rules (Tag uses multi-select: is any of). Owning manager: if set, only that manager sees the campaign; if empty, all managers see it. Agents only see assigned records when opening a campaign.'
        }
        actions={
          isAdmin && canCreate ? (
            <Button onClick={openCreate}>+ New campaign</Button>
          ) : null
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      {showCampaignFilters ? (
        <FilterBar onApply={applyFilters} onReset={resetFilters}>
          {role === 'admin' || role === 'manager' ? (
            role === 'admin' ? (
              <Select
                label="Owning manager"
                value={draftManagerFilter}
                onChange={(e) => setDraftManagerFilter(e.target.value)}
                options={campaignManagerFilterOptions}
                className={pageStyles.filterSelect}
              />
            ) : (
              <Select
                label="Scope"
                value={draftManagerFilter}
                onChange={(e) => setDraftManagerFilter(e.target.value)}
                options={campaignManagerFilterOptions}
                className={pageStyles.filterSelect}
              />
            )
          ) : null}
          <Select
            label="Type"
            value={draftTypeFilter}
            onChange={(e) => setDraftTypeFilter(e.target.value)}
            options={TYPE_FILTER_OPTIONS}
            className={pageStyles.filterSelect}
          />
        </FilterBar>
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
            placeholder="Search... (press Enter)"
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
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
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Manager</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Rules / notes</TableHeaderCell>
                    <TableHeaderCell width="220px" align="center">
                      Actions
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map((c) => {
                    const isArchived = Boolean(c.deleted_at);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.type}</TableCell>
                        <TableCell>
                          {c.manager_id
                            ? managerMap[c.manager_id] || (role === 'agent' ? `Manager #${c.manager_id}` : `#${c.manager_id}`)
                            : role === 'agent'
                              ? 'Tenant pool (all managers)'
                              : 'All managers'}
                        </TableCell>
                        <TableCell>
                          {isArchived ? (
                            <span title={c.deleted_at ? formatDateTime(c.deleted_at) : ''}>Archived</span>
                          ) : (
                            c.status
                          )}
                        </TableCell>
                        <TableCell>{campaignRulesSummary(c)}</TableCell>
                        <TableCell align="center">
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {role === 'agent' && c.status === 'active' && !isArchived ? (
                              <Button variant="secondary" size="sm" onClick={() => navigate(`/campaigns/${c.id}/open`)}>
                                Open
                              </Button>
                            ) : null}
                            {isAdmin ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(c)}
                                  disabled={isArchived}
                                  title={isArchived ? 'Archived campaigns cannot be edited' : undefined}
                                >
                                  Edit
                                </Button>
                                {canDelete && !isArchived ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openArchiveConfirm(c)}
                                    disabled={deleteMut.loading}
                                  >
                                    Archive
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
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
          />
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit campaign' : 'New campaign'}
        size="lg"
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            {form.type === 'filter' ? (
              <Button variant="secondary" onClick={runPreview} disabled={previewLoading || createMut.loading || updateMut.loading}>
                {previewLoading ? 'Preview…' : 'Preview'}
              </Button>
            ) : null}
            <Button onClick={handleSave} disabled={createMut.loading || updateMut.loading}>
              {createMut.loading || updateMut.loading ? 'Saving…' : 'Save'}
            </Button>
          </ModalFooter>
        }
      >
        {formError ? (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {formError}
          </Alert>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            placeholder="Campaign name"
          />
          <Select
            label="Type"
            value={form.type}
            disabled={!!editing}
            onChange={(e) => {
              const t = e.target.value;
              setForm((s) => ({
                ...s,
                type: t,
                filterRules: t === 'filter' && (!s.filterRules || s.filterRules.length === 0) ? [defaultRule()] : s.filterRules,
              }));
            }}
            options={[
              { value: 'static', label: 'Static (campaign_id on contacts)' },
              { value: 'filter', label: 'Filter (dynamic rules)' },
            ]}
          />
          {editing ? (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
              Type is fixed after creation. Create a new campaign if you need the other type.
            </p>
          ) : null}
          <Select
            label="Owning manager (optional)"
            value={form.manager_id}
            onChange={(e) => setForm((s) => ({ ...s, manager_id: e.target.value }))}
            placeholder="Visible to all managers"
            options={[
              { value: '', label: '— All managers —' },
              ...managerOptions,
            ]}
          />
          <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
            If you pick a manager, only that manager sees and uses this campaign. Leave &quot;All managers&quot; for everyone.
          </p>
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
          />

          {form.type === 'filter' ? (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <CampaignFilterBuilder
                rules={form.filterRules || []}
                onChange={(next) => setForm((s) => ({ ...s, filterRules: next }))}
                statusOptions={statusOptions}
                tagOptions={tagOptions}
                managerOptions={managerOptions}
                agentOptions={agentOptions}
                campaignOptions={staticCampaignOptions}
              />
            </div>
          ) : null}
          {editing ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, opacity: 0.7 }}>
              Created {editing.created_at ? formatDateTime(editing.created_at) : '—'}
              {editing.updated_at ? ` · Updated ${formatDateTime(editing.updated_at)}` : ''}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview matching leads"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {previewError ? <Alert variant="error">{previewError}</Alert> : null}
        <div style={{ marginBottom: 12 }}>
          <SearchInput
            value={previewSearch}
            onSearch={(v) => {
              setPreviewSearch(v || '');
              setPreviewPage(1);
            }}
            placeholder="Search preview… (press Enter)"
          />
        </div>
        <TableDataRegion loading={previewLoading} hasCompletedInitialFetch={!previewLoading}>
          <Table variant="adminList">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Tag</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!previewRows?.length ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    {previewLoading ? 'Loading…' : 'No matching leads for these rules.'}
                  </TableCell>
                </TableRow>
              ) : (
                previewRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.display_name || '—'}</TableCell>
                    <TableCell>{r.email || '—'}</TableCell>
                    <TableCell>{r.tag_names || '—'}</TableCell>
                    <TableCell>{r.primary_phone || '—'}</TableCell>
                    <TableCell>{r.status_name || r.status_id || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableDataRegion>
        <Pagination
          page={previewPagination.page || 1}
          totalPages={Math.max(1, previewPagination.totalPages || 1)}
          total={previewPagination.total ?? 0}
          limit={previewPagination.limit ?? previewLimit}
          onPageChange={(p) => setPreviewPage(p)}
        />
      </Modal>

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
    </div>
  );
}
