import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import listStyles from '../components/admin/adminDataList.module.scss';
import { FilterBar } from '../components/admin/FilterBar';
import { usersAPI, tenantsAPI } from '../services/adminAPI';
import { useMutation } from '../hooks/useAsyncData';
import { useTableLoadingState } from '../hooks/useTableLoadingState';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import styles from './UsersPage.module.scss';

const FILTER_ALL = '__all__';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
];

const ROLE_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'All roles' },
  ...ROLE_OPTIONS,
];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function UsersPage() {
  const [searchParams] = useSearchParams();
  const tenantIdFromUrl = searchParams.get('tenantId') || '';

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState(tenantIdFromUrl);
  const [tenantDraft, setTenantDraft] = useState(tenantIdFromUrl);
  const [draftRoleFilter, setDraftRoleFilter] = useState(FILTER_ALL);
  const [appliedRoleFilter, setAppliedRoleFilter] = useState(FILTER_ALL);
  const [draftManagerFilter, setDraftManagerFilter] = useState(FILTER_ALL);
  const [appliedManagerFilter, setAppliedManagerFilter] = useState(FILTER_ALL);
  const [managersForFilter, setManagersForFilter] = useState([]);
  const [showDisabled, setShowDisabled] = useState(false);
  const [tenantOptions, setTenantOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    tenant_id: '',
    email: '',
    password: '',
    name: '',
    role: 'agent',
    is_enabled: true,
    unlock: false,
    new_password: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersAPI.getAll({
        tenantId: tenantFilter || undefined,
        search,
        includeDisabled: showDisabled,
        page: pagination.page,
        limit: pagination.limit,
        role: appliedRoleFilter !== FILTER_ALL ? appliedRoleFilter : undefined,
        filterManagerId: appliedManagerFilter !== FILTER_ALL ? appliedManagerFilter : undefined,
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
    tenantFilter,
    search,
    showDisabled,
    pagination.page,
    pagination.limit,
    appliedRoleFilter,
    appliedManagerFilter,
  ]);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (tenantIdFromUrl) {
      setTenantFilter(tenantIdFromUrl);
      setTenantDraft(tenantIdFromUrl);
      setPagination((p) => ({ ...p, page: 1 }));
    }
  }, [tenantIdFromUrl]);

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

  useEffect(() => {
    tenantsAPI
      .getAll({ limit: 500 })
      .then((res) => {
        const list = res.data?.data || [];
        setTenantOptions([{ value: '', label: 'All tenants' }, ...list.map((t) => ({ value: String(t.id), label: `${t.name} (${t.slug})` }))]);
      })
      .catch(() => setTenantOptions([{ value: '', label: 'All tenants' }]));
  }, []);

  useEffect(() => {
    usersAPI
      .getAll({ limit: 500, role: 'manager' })
      .then((res) => setManagersForFilter(res.data?.data || []))
      .catch(() => setManagersForFilter([]));
  }, []);

  const createMutation = useMutation((data) => usersAPI.create(data));
  const updateMutation = useMutation((id, data) => usersAPI.update(id, data));

  const openCreate = () => {
    setEditing(null);
    setForm({
      tenant_id: tenantFilter || '',
      email: '',
      password: '',
      name: '',
      role: 'agent',
      is_enabled: true,
      unlock: false,
      new_password: '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      tenant_id: row.tenant_id,
      email: row.email,
      password: '',
      name: row.name || '',
      role: row.role || 'agent',
      is_enabled: !!row.is_enabled,
      unlock: false,
      new_password: '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!editing) {
      if (!form.tenant_id) {
        setFormErrors({ tenant_id: 'Tenant is required' });
        return;
      }
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
        unlock: form.unlock,
      };
      if (form.new_password?.trim()) payload.password = form.new_password.trim();
      const result = await updateMutation.mutate(editing.id, payload);
      if (result.success) {
        setModalOpen(false);
        fetchUsers();
      } else {
        setFormErrors({ submit: result.error });
      }
    } else {
      const result = await createMutation.mutate({
        tenant_id: form.tenant_id,
        email: form.email.trim(),
        password: form.password,
        name: form.name?.trim() || null,
        role: form.role,
      });
      if (result.success) {
        setModalOpen(false);
        fetchUsers();
      } else {
        setFormErrors({ submit: result.error });
      }
    }
  };

  const isLocked = (u) => u.account_locked_until && new Date(u.account_locked_until) > new Date();

  const managerFilterOptions = [
    { value: FILTER_ALL, label: 'All managers' },
    { value: 'unassigned', label: 'Unassigned pool' },
    ...managersForFilter.map((m) => ({
      value: String(m.id),
      label: `${m.name || m.email || `#${m.id}`}${m.tenant_name ? ` · ${m.tenant_name}` : ''}`,
    })),
  ];

  const hasActiveUserFilters =
    appliedRoleFilter !== FILTER_ALL || appliedManagerFilter !== FILTER_ALL;

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title="Users"
          description="Manage platform users across tenants"
          actions={
            <Button variant="primary" onClick={openCreate}>
              Add User
            </Button>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

        <FilterBar
          onApply={() => {
            setTenantFilter(tenantDraft);
            setAppliedRoleFilter(draftRoleFilter);
            setAppliedManagerFilter(
              draftRoleFilter === 'manager' || draftRoleFilter === 'admin'
                ? FILTER_ALL
                : draftManagerFilter
            );
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          onReset={() => {
            setTenantDraft('');
            setTenantFilter('');
            setDraftRoleFilter(FILTER_ALL);
            setAppliedRoleFilter(FILTER_ALL);
            setDraftManagerFilter(FILTER_ALL);
            setAppliedManagerFilter(FILTER_ALL);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        >
          <Select
            label="Tenant"
            options={tenantOptions}
            value={tenantDraft}
            onChange={(e) => setTenantDraft(e.target.value)}
            className={styles.tenantSelect}
          />
          <Select
            label="Role"
            value={draftRoleFilter}
            onChange={(e) => {
              const v = e.target.value;
              setDraftRoleFilter(v);
              if (v === 'manager' || v === 'admin') {
                setDraftManagerFilter(FILTER_ALL);
              }
            }}
            options={ROLE_FILTER_OPTIONS}
            className={styles.filterSelect}
          />
          <Select
            label="Reports to (agents)"
            value={draftManagerFilter}
            onChange={(e) => setDraftManagerFilter(e.target.value)}
            options={managerFilterOptions}
            className={styles.filterSelect}
            disabled={draftRoleFilter === 'manager' || draftRoleFilter === 'admin'}
          />
        </FilterBar>

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
                    search || showDisabled || tenantFilter || hasActiveUserFilters
                      ? 'No users found'
                      : 'No users yet'
                  }
                  description="Try a different search, filters, or add a user."
                  action={openCreate}
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
                <TableHeaderCell>Tenant</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell width="90px">Status</TableHeaderCell>
                <TableHeaderCell width="80px">Locked</TableHeaderCell>
                <TableHeaderCell width="120px">Last login</TableHeaderCell>
                <TableHeaderCell width="80px" align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.name || '—'}</TableCell>
                  <TableCell>{u.tenant_name ? `${u.tenant_name} (${u.tenant_slug})` : u.is_platform_admin ? 'Platform' : '—'}</TableCell>
                  <TableCell>{u.role || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!u.is_enabled} />
                  </TableCell>
                  <TableCell>
                    <span className={isLocked(u) ? styles.locked : styles.notLocked}>
                      {isLocked(u) ? 'Locked' : '—'}
                    </span>
                  </TableCell>
                  <TableCell className={styles.dateCell}>{formatDate(u.last_login_at)}</TableCell>
                  <TableCell align="right">
                    <IconButton title="Edit" onClick={() => openEdit(u)} size="sm">✏️</IconButton>
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
            {!editing && (
              <Select
                label="Tenant"
                options={tenantOptions.filter((o) => o.value !== '')}
                value={form.tenant_id}
                onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
                error={formErrors.tenant_id}
                placeholder="Select tenant"
              />
            )}
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={formErrors.email}
              required={!editing}
              placeholder="user@example.com"
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
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              error={formErrors.role}
              placeholder="Select role"
            />
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
              {editing.account_locked_until && new Date(editing.account_locked_until) > new Date() && (
                <Checkbox
                  label="Unlock account (clear lock and failed login attempts)"
                  checked={form.unlock}
                  onChange={(e) => setForm((f) => ({ ...f, unlock: e.target.checked }))}
                />
              )}
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
