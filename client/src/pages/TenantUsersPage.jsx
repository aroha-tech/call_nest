import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermission } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { EditIcon } from '../components/ui/ActionIcons';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterBar } from '../components/admin/FilterBar';
import listStyles from '../components/admin/adminDataList.module.scss';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { useMutation } from '../hooks/useAsyncData';
import { useTableLoadingState } from '../hooks/useTableLoadingState';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import styles from './TenantUsersPage.module.scss';
import { isNoListFilter, normalizeListFilterAll } from '../utils/listFilterNarrowing';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
];

const AGENT_ONLY_ROLE_OPTIONS = [{ value: 'agent', label: 'Agent' }];

export function TenantUsersPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const authUser = useAppSelector(selectUser);
  const isFullAccess = usePermission(PERMISSIONS.USERS_MANAGE);
  const hasTeamAccess = usePermission(PERMISSIONS.USERS_TEAM);
  const isManagerTeamView = authUser?.role === 'manager' && hasTeamAccess && !isFullAccess;

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [draftRoleFilter, setDraftRoleFilter] = useState('');
  const [appliedRoleFilter, setAppliedRoleFilter] = useState('');
  const [draftManagerFilter, setDraftManagerFilter] = useState('');
  const [appliedManagerFilter, setAppliedManagerFilter] = useState('');
  const [managersForFilter, setManagersForFilter] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'agent',
    is_enabled: true,
    new_password: '',
    manager_id: '',
    agent_can_delete_leads: false,
    agent_can_delete_contacts: false,
  });
  const [actionMessage, setActionMessage] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantUsersAPI.getAll({
        search,
        includeDisabled: showDisabled,
        page: pagination.page,
        limit: pagination.limit,
        ...(isFullAccess
          ? {
              role: !isNoListFilter(appliedRoleFilter) ? appliedRoleFilter : undefined,
              filterManagerId: !isNoListFilter(appliedManagerFilter) ? appliedManagerFilter : undefined,
            }
          : {}),
      });
      setUsers(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [
    search,
    showDisabled,
    pagination.page,
    pagination.limit,
    isFullAccess,
    appliedRoleFilter,
    appliedManagerFilter,
  ]);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!isFullAccess) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await tenantUsersAPI.getAll({ page: 1, limit: 500, role: 'manager' });
        if (!cancelled) setManagersForFilter(res.data?.data ?? []);
      } catch {
        if (!cancelled) setManagersForFilter([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFullAccess]);

  const managerFilterOptions = useMemo(
    () => [
      { value: 'unassigned', label: 'No manager' },
      ...managersForFilter.map((m) => ({
        value: String(m.id),
        label: m.name || m.email || '—',
      })),
    ],
    [managersForFilter]
  );

  const hasActiveUserFilters =
    isFullAccess && (!isNoListFilter(appliedRoleFilter) || !isNoListFilter(appliedManagerFilter));

  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((next) => {
    setPagination((p) => ({ ...p, page: next }));
  }, []);

  const handleLimitChange = useCallback((next) => {
    setPagination((p) => ({ ...p, limit: next, page: 1 }));
  }, []);

  const createMutation = useMutation((data) => tenantUsersAPI.create(data));
  const updateMutation = useMutation((id, data) => tenantUsersAPI.update(id, data));

  const managerOptionsForForm = useMemo(() => {
    const byId = new Map();
    for (const m of managersForFilter) {
      byId.set(m.id, m);
    }
    for (const u of users) {
      if (u.role === 'manager' && !byId.has(u.id)) byId.set(u.id, u);
    }
    return [...byId.values()]
      .map((m) => ({ value: String(m.id), label: m.name || m.email || '—' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users, managersForFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      email: '',
      password: '',
      name: '',
      role: 'agent',
      is_enabled: true,
      new_password: '',
      manager_id: '',
      agent_can_delete_leads: false,
      agent_can_delete_contacts: false,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      email: row.email,
      password: '',
      name: row.name || '',
      role: row.role || 'agent',
      is_enabled: !!row.is_enabled,
      new_password: '',
      manager_id: row.manager_id != null ? String(row.manager_id) : '',
      agent_can_delete_leads: !!row.agent_can_delete_leads,
      agent_can_delete_contacts: !!row.agent_can_delete_contacts,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!editing) {
      if (!form.email?.trim()) {
        setFormErrors({ email: 'Email is required' });
        return;
      }
      if (!form.password) {
        setFormErrors({ password: 'Password is required' });
        return;
      }
      if (!form.role) {
        setFormErrors({ role: 'Role is required' });
        return;
      }
    }
    if (editing) {
      const payload = {
        name: form.name?.trim() || null,
        role: form.role,
        is_enabled: form.is_enabled,
      };
      if (form.new_password?.trim()) payload.password = form.new_password.trim();
      const effectiveRole = form.role || editing.role;
      if (effectiveRole === 'agent' && isFullAccess) {
        payload.manager_id = form.manager_id ? Number(form.manager_id) : null;
      }
      if (effectiveRole === 'agent') {
        payload.agent_can_delete_leads = !!form.agent_can_delete_leads;
        payload.agent_can_delete_contacts = !!form.agent_can_delete_contacts;
      }
      const result = await updateMutation.mutate(editing.id, payload);
      if (result.success) {
        setModalOpen(false);
        fetchUsers();
      } else {
        setFormErrors({ submit: result.error });
      }
    } else {
      const result = await createMutation.mutate({
        email: form.email.trim(),
        password: form.password,
        name: form.name?.trim() || null,
        role: isManagerTeamView ? 'agent' : form.role,
        ...(isFullAccess && form.role === 'agent' && form.manager_id
          ? { manager_id: Number(form.manager_id) }
          : {}),
      });
      if (result.success) {
        setModalOpen(false);
        fetchUsers();
      } else {
        setFormErrors({ submit: result.error });
      }
    }
  };

  const pageTitle = isManagerTeamView ? 'My team' : 'Users';
  const pageDescription = isManagerTeamView
    ? 'Agents assigned to you by an administrator. Reporting assignments can only be changed by an admin.'
    : 'Manage users in your organization';
  const canAddUser = isFullAccess;

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title={pageTitle}
          description={pageDescription}
          actions={
            canAddUser ? (
              <Button variant="primary" onClick={openCreate}>
                {isManagerTeamView ? 'Add agent' : 'Add User'}
              </Button>
            ) : null
          }
        />

        {error && <Alert variant="error">{error}</Alert>}
        {actionMessage?.type === 'success' ? (
          <Alert variant="success" style={{ marginTop: error ? 8 : 0 }}>
            {actionMessage.text}
          </Alert>
        ) : null}
        {actionMessage?.type === 'error' ? (
          <Alert variant="error" style={{ marginTop: error ? 8 : 0 }}>
            {actionMessage.text}
          </Alert>
        ) : null}

        {isFullAccess ? (
          <FilterBar
            onApply={() => {
              setAppliedRoleFilter(normalizeListFilterAll(draftRoleFilter));
              setAppliedManagerFilter(
                draftRoleFilter === 'manager' || draftRoleFilter === 'admin'
                  ? ''
                  : normalizeListFilterAll(draftManagerFilter)
              );
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            onReset={() => {
              setDraftRoleFilter('');
              setAppliedRoleFilter('');
              setDraftManagerFilter('');
              setAppliedManagerFilter('');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <Select
              allowEmpty
              label="Role"
              placeholder="All roles"
              value={draftRoleFilter || ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraftRoleFilter(v);
                if (v === 'manager' || v === 'admin') {
                  setDraftManagerFilter('');
                }
              }}
              options={ROLE_OPTIONS}
              className={styles.filterSelect}
            />
            <Select
              allowEmpty
              label="Reports to (agents)"
              placeholder="All managers"
              value={draftManagerFilter || ''}
              onChange={(e) => setDraftManagerFilter(e.target.value)}
              options={managerFilterOptions}
              className={styles.filterSelect}
              disabled={draftRoleFilter === 'manager' || draftRoleFilter === 'admin'}
            />
          </FilterBar>
        ) : null}

        <div className={listStyles.tableCard}>
          <div className={listStyles.tableCardToolbarTop}>
            <div className={listStyles.tableCardToolbarLeft}>
              <PaginationPageSize limit={pagination.limit} onLimitChange={handleLimitChange} />
              <Checkbox
                label="Include disabled"
                checked={showDisabled}
                onChange={(e) => {
                  setShowDisabled(e.target.checked);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
            <SearchInput
              value={search}
              onSearch={handleSearch}
              placeholder="Search by email or name... (press Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
            {users.length === 0 ? (
              <div className={listStyles.tableCardEmpty}>
                <EmptyState
                  icon="👤"
                  title={
                    search || showDisabled || hasActiveUserFilters ? 'No users found' : 'No users yet'
                  }
                  description={
                    search || showDisabled || hasActiveUserFilters
                      ? 'Try a different search or change filters and click Apply, or Reset.'
                      : isManagerTeamView
                        ? 'No agents are assigned to you yet. An administrator can assign agents to your team.'
                        : 'Add users to your organization.'
                  }
                  action={
                    canAddUser && !search && !showDisabled && !hasActiveUserFilters ? openCreate : undefined
                  }
                  actionLabel="Add User"
                />
              </div>
            ) : (
              <div className={listStyles.tableCardBody}>
                <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Reports to</TableHeaderCell>
                <TableHeaderCell width="100px">Status</TableHeaderCell>
                <TableHeaderCell width="120px">Last login</TableHeaderCell>
                <TableHeaderCell width="80px" align="right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.name || '—'}</TableCell>
                  <TableCell>{u.role || '—'}</TableCell>
                  <TableCell>
                    {u.role === 'agent'
                      ? u.manager_name || u.manager_email || (u.manager_id ? '—' : '— No manager —')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!u.is_enabled} />
                  </TableCell>
                  <TableCell className={styles.dateCell}>{formatDateTime(u.last_login_at)}</TableCell>
                  <TableCell align="right">
                    {isFullAccess && authUser?.role === 'admin' && Number(u.id) === Number(authUser?.id) ? (
                      <IconButton title="Edit your profile from Profile page" size="sm" disabled>
                        <EditIcon />
                      </IconButton>
                    ) : (
                      <IconButton title="Edit" onClick={() => openEdit(u)} size="sm">
                        <EditIcon />
                      </IconButton>
                    )}
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
              page={pagination.page}
              totalPages={Math.max(1, pagination.totalPages || 1)}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              hidePageSize
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'Add User'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Basic</h3>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={formErrors.email}
              required={!editing}
              placeholder="user@company.com"
              readOnly={!!editing}
            />
            {!editing && (
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                error={formErrors.password}
                required
                placeholder="••••••••"
              />
            )}
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Display name"
            />
            <Select
              label="Role"
              options={isManagerTeamView ? AGENT_ONLY_ROLE_OPTIONS : ROLE_OPTIONS}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, manager_id: '' }))}
              error={formErrors.role}
              placeholder="Select role"
              disabled={!!editing && isManagerTeamView}
            />
            {!editing && isFullAccess && form.role === 'agent' ? (
              <Select
                label="Reporting manager (optional)"
                value={form.manager_id}
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                placeholder="— No manager —"
                options={[{ value: '', label: '— No manager —' }, ...managerOptionsForForm]}
              />
            ) : null}
            {editing &&
            (form.role === 'agent' || editing.role === 'agent') &&
            isFullAccess ? (
              <Select
                label="Reporting manager"
                value={form.manager_id}
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                placeholder="— No manager —"
                options={[{ value: '', label: '— No manager —' }, ...managerOptionsForForm]}
              />
            ) : null}
            {editing &&
            isManagerTeamView &&
            (form.role === 'agent' || editing.role === 'agent') ? (
              <Input
                label="Reporting manager"
                value={
                  editing.manager_id != null
                    ? editing.manager_name || editing.manager_email || '—'
                    : '— No manager —'
                }
                readOnly
                hint="Only an administrator can change who this agent reports to."
              />
            ) : null}
            {editing && (
              <Checkbox
                label="User enabled"
                checked={form.is_enabled}
                onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
              />
            )}
          </div>

          {editing && (
            <div className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>Account</h3>
              {(form.role === 'agent' || editing.role === 'agent') ? (
                <>
                  <h3 className={styles.formSectionTitle}>Agent delete permissions</h3>
                  <Checkbox
                    label="Allow this agent to delete leads"
                    checked={!!form.agent_can_delete_leads}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, agent_can_delete_leads: e.target.checked }))
                    }
                  />
                  <Checkbox
                    label="Allow this agent to delete contacts"
                    checked={!!form.agent_can_delete_contacts}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, agent_can_delete_contacts: e.target.checked }))
                    }
                  />
                </>
              ) : null}
              <Input
                label="New password (leave blank to keep current)"
                type="password"
                value={form.new_password}
                onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          {formErrors.submit && <div className={styles.formError}>{formErrors.submit}</div>}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createMutation.loading || updateMutation.loading}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
