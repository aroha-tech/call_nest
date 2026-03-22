import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { usePermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactsAPI } from '../../services/contactsAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { ConfirmModal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { FilterBar } from '../../components/admin/FilterBar';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { AssignContactsBulkModal } from './AssignContactsBulkModal';
import listStyles from '../../components/admin/adminDataList.module.scss';
import pageStyles from './ContactsPage.module.scss';

const FILTER_ALL = '__all__';

export function ContactsPage({ type }) {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';

  const canRead = usePermission(type === 'lead' ? 'leads.read' : 'contacts.read');
  const canCreate = usePermission(type === 'lead' ? 'leads.create' : 'contacts.create');
  const canUpdate = usePermission(type === 'lead' ? 'leads.update' : 'contacts.update');
  const canDelete = usePermission(type === 'lead' ? 'leads.delete' : 'contacts.delete');

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [deleteItem, setDeleteItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignConfirmOpen, setUnassignConfirmOpen] = useState(false);
  const [unassignError, setUnassignError] = useState('');

  const showOwnershipFilters = canRead && (role === 'admin' || role === 'manager');
  const showCampaign = type === 'lead' && canRead;

  const [tenantUsers, setTenantUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignFilter, setCampaignFilter] = useState(FILTER_ALL);
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
        const res = await campaignsAPI.list({ page: 1, limit: 500, show_paused: true });
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

  const filterParamsForApi = useMemo(() => {
    const mid = role === 'manager' ? FILTER_ALL : appliedManagerFilter;
    const aid = appliedAgentFilter;
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
    };
  }, [role, appliedManagerFilter, appliedAgentFilter, showCampaign, campaignFilter]);

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
      }),
    [searchQuery, page, limit, type, filterParamsForApi]
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
  const assignMutation = useMutation((body) => contactsAPI.assign(body));

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const canBulkAssign = canUpdate && role !== 'agent';

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
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const onCampaignFilterChange = (e) => {
    setCampaignFilter(e.target.value);
    setPage(1);
    clearSelection();
  };

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
    (role === 'admin' && (appliedManagerFilter !== FILTER_ALL || appliedAgentFilter !== FILTER_ALL)) ||
    (role === 'manager' && appliedAgentFilter !== FILTER_ALL) ||
    (showCampaign && campaignFilter !== FILTER_ALL);

  return (
    <div className={listStyles.page}>
      <PageHeader
        title={tableTitle}
        description={role === 'agent' ? 'View and create your assigned leads/contacts' : 'Manage leads/contacts'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                Import CSV
              </Button>
            )}
            {canCreate ? (
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

      {showOwnershipFilters ? (
        <FilterBar onApply={applyFilters} onReset={resetFilters}>
          {role === 'admin' ? (
            <Select
              label="Owning manager"
              value={draftManagerFilter}
              onChange={handleDraftManagerChange}
              options={managerFilterOptions}
              className={pageStyles.filterSelect}
            />
          ) : null}
          <Select
            label="Assigned agent"
            value={draftAgentFilter}
            onChange={(e) => setDraftAgentFilter(e.target.value)}
            options={agentFilterOptionsDraft}
            className={pageStyles.filterSelect}
          />
        </FilterBar>
      ) : null}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            {canBulkAssign && contacts.length > 0 ? (
              <div className={listStyles.bulkToolbarSlot}>
                {selectedIds.size > 0 ? (
                  <>
                    <span className={listStyles.bulkSelectionCount}>{selectedIds.size} selected</span>
                    <Button size="sm" variant="secondary" onClick={clearSelection}>
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => setAssignOpen(true)}>
                      Assign…
                    </Button>
                    <Button size="sm" variant="secondary" onClick={openUnassignConfirm}>
                      Unassign agent
                    </Button>
                  </>
                ) : (
                  <span className={listStyles.bulkToolbarHint}>Select rows for bulk assign</span>
                )}
              </div>
            ) : null}
          </div>
          <SearchInput value={searchQuery} onSearch={handleSearch} className={listStyles.searchInToolbar} placeholder="Search... (press Enter)" />
        </div>

        <TableDataRegion loading={loadingContacts} hasCompletedInitialFetch={hasCompletedInitialFetch}>
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
            <div className={listStyles.tableCardBody}>
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  {canBulkAssign ? (
                    <TableHeaderCell width="44px" align="center">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={
                          contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))
                        }
                        onChange={toggleSelectAllOnPage}
                      />
                    </TableHeaderCell>
                  ) : null}
                  <TableHeaderCell>Display Name</TableHeaderCell>
                  <TableHeaderCell>Primary Phone</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Tag</TableHeaderCell>
                  {showCampaign ? <TableHeaderCell>Campaign</TableHeaderCell> : null}
                  <TableHeaderCell>Type</TableHeaderCell>
                  {(role === 'admin' || role === 'manager') && canRead ? (
                    <>
                      <TableHeaderCell>Manager</TableHeaderCell>
                      <TableHeaderCell>Agent</TableHeaderCell>
                    </>
                  ) : null}
                  <TableHeaderCell width="160px" align="center">
                    Actions
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    {canBulkAssign ? (
                      <TableCell align="center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          aria-label={`Select ${c.display_name || c.id}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>{c.display_name || c.first_name || c.email || '—'}</TableCell>
                    <TableCell>{c.primary_phone || '—'}</TableCell>
                    <TableCell>{c.email || '—'}</TableCell>
                    <TableCell>{c.tag_names || '—'}</TableCell>
                    {showCampaign ? <TableCell>{c.campaign_name || '—'}</TableCell> : null}
                    <TableCell>{c.type}</TableCell>
                    {(role === 'admin' || role === 'manager') && canRead ? (
                      <>
                        <TableCell>
                          {c.manager_name || (c.manager_id != null ? `#${c.manager_id}` : '—')}
                        </TableCell>
                        <TableCell>
                          {c.assigned_user_name || (c.assigned_user_id != null ? `#${c.assigned_user_id}` : '—')}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell align="center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        {canUpdate && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(type === 'lead' ? `/leads/${c.id}` : `/contacts/${c.id}`)}>
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="danger" size="sm" onClick={() => setDeleteItem(c)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}

