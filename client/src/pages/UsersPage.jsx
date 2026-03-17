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
import { Spinner } from '../components/ui/Spinner';
import { StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { usersAPI, tenantsAPI } from '../services/adminAPI';
import { useMutation } from '../hooks/useAsyncData';
import styles from './UsersPage.module.scss';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantIdFromUrl = searchParams.get('tenantId') || '';

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState(tenantIdFromUrl);
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
      });
      setUsers(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, search, showDisabled, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Sync tenant filter from URL when navigating with ?tenantId=
  useEffect(() => {
    if (tenantIdFromUrl && tenantIdFromUrl !== tenantFilter) {
      setTenantFilter(tenantIdFromUrl);
    }
  }, [tenantIdFromUrl]);

  useEffect(() => {
    tenantsAPI
      .getAll({ limit: 500 })
      .then((res) => {
        const list = res.data?.data || [];
        setTenantOptions([{ value: '', label: 'All tenants' }, ...list.map((t) => ({ value: String(t.id), label: `${t.name} (${t.slug})` }))]);
      })
      .catch(() => setTenantOptions([{ value: '', label: 'All tenants' }]));
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

  return (
    <div className={styles.wrapper}>
      <PageHeader
        title="Users"
        description="Manage platform users across tenants"
        actions={
          <Button variant="primary" onClick={openCreate}>
            Add User
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <Select
          options={tenantOptions}
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className={styles.tenantSelect}
        />
        <SearchInput
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
        />
        <Checkbox
          label="Include disabled"
          checked={showDisabled}
          onChange={(e) => setShowDisabled(e.target.checked)}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>
          <Spinner size="lg" />
        </div>
      ) : (
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
      )}

      {pagination.totalPages > 1 && (
        <div className={styles.pagination}>
          Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
        </div>
      )}

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
