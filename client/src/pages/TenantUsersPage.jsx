import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import listStyles from '../components/admin/adminDataList.module.scss';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { useMutation } from '../hooks/useAsyncData';
import styles from './TenantUsersPage.module.scss';

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

export function TenantUsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'agent',
    is_enabled: true,
    new_password: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const fetchedOnceRef = useRef(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantUsersAPI.getAll({
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
      fetchedOnceRef.current = true;
    }
  }, [search, showDisabled, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  const openCreate = () => {
    setEditing(null);
    setForm({
      email: '',
      password: '',
      name: '',
      role: 'agent',
      is_enabled: true,
      new_password: '',
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

  if (loading && !fetchedOnceRef.current) {
    return (
      <div className={styles.wrapper}>
        <div className={listStyles.page}>
          <PageHeader
            title="Users"
            description="Manage users in your organization"
            actions={
              <Button variant="primary" onClick={openCreate}>
                Add User
              </Button>
            }
          />
          <div className={listStyles.loadingInitial}>
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title="Users"
          description="Manage users in your organization"
          actions={
            <Button variant="primary" onClick={openCreate}>
              Add User
            </Button>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

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
          {users.length === 0 && !loading ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="👤"
                title={search || showDisabled ? 'No users found' : 'No users yet'}
                description={search || showDisabled ? 'Try a different search or clear filters.' : 'Add users to your organization.'}
                action={!search && !showDisabled ? openCreate : undefined}
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
                <TableHeaderCell width="100px">Status</TableHeaderCell>
                <TableHeaderCell width="120px">Last login</TableHeaderCell>
                <TableHeaderCell width="80px" align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.name || '—'}</TableCell>
                  <TableCell>{u.role || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!u.is_enabled} />
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
