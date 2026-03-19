import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { tenantsAPI } from '../services/adminAPI';
import { industriesAPI } from '../services/dispositionAPI';
import { useMutation } from '../hooks/useAsyncData';
import { useTableLoadingState } from '../hooks/useTableLoadingState';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import styles from './TenantsPage.module.scss';

const defaultForm = () => ({
  name: '',
  slug: '',
  industry_id: '',
  is_enabled: true,
  admin_email: '',
  admin_password: '',
  admin_name: '',
  whatsapp_send_mode: 'manual',
  whatsapp_module_enabled: false,
  whatsapp_automation_enabled: false,
  email_communication_enabled: false,
  email_module_enabled: false,
  email_automation_enabled: false,
});

export function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [industryOptions, setIndustryOptions] = useState([]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantsAPI.getAll({
        search,
        includeDisabled: showDisabled,
        page: pagination.page,
        limit: pagination.limit,
      });
      setTenants(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [search, showDisabled, pagination.page, pagination.limit]);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

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
    industriesAPI
      .getOptions()
      .then((res) => {
        const list = res.data?.data || [];
        setIndustryOptions(list.map((i) => ({ value: i.id, label: i.name })));
      })
      .catch(() => setIndustryOptions([]));
  }, []);

  const createMutation = useMutation((data) => tenantsAPI.create(data));
  const updateMutation = useMutation((id, data) => tenantsAPI.update(id, data));

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      slug: row.slug || '',
      industry_id: row.industry_id || '',
      is_enabled: !!row.is_enabled,
      whatsapp_send_mode: row.whatsapp_send_mode === 'automatic' ? 'automatic' : 'manual',
      whatsapp_module_enabled: !!row.whatsapp_module_enabled,
      whatsapp_automation_enabled: !!row.whatsapp_automation_enabled,
      email_communication_enabled: !!row.email_communication_enabled,
      email_module_enabled: !!row.email_module_enabled,
      email_automation_enabled: !!row.email_automation_enabled,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const payloadFromForm = () => {
    const base = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      industry_id: form.industry_id || null,
      is_enabled: form.is_enabled ? 1 : 0,
      whatsapp_send_mode: form.whatsapp_send_mode,
      whatsapp_module_enabled: form.whatsapp_module_enabled ? 1 : 0,
      whatsapp_automation_enabled: form.whatsapp_automation_enabled ? 1 : 0,
      email_communication_enabled: form.email_communication_enabled ? 1 : 0,
      email_module_enabled: form.email_module_enabled ? 1 : 0,
      email_automation_enabled: form.email_automation_enabled ? 1 : 0,
    };
    if (!editing) {
      base.admin_email = form.admin_email?.trim() || '';
      base.admin_password = form.admin_password || '';
      base.admin_name = form.admin_name?.trim() || null;
    }
    return base;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!form.name?.trim()) {
      setFormErrors({ name: 'Name is required' });
      return;
    }
    if (!form.slug?.trim()) {
      setFormErrors({ slug: 'Slug is required' });
      return;
    }
    if (!editing) {
      if (!form.admin_email?.trim()) {
        setFormErrors({ admin_email: 'Admin email is required' });
        return;
      }
      if (!form.admin_password) {
        setFormErrors({ admin_password: 'Password is required for the first admin' });
        return;
      }
    }
    const payload = payloadFromForm();
    const result = editing
      ? await updateMutation.mutate(editing.id, payload)
      : await createMutation.mutate(payload);
    if (result.success) {
      setModalOpen(false);
      fetchTenants();
    } else {
      setFormErrors({ submit: result.error });
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title="Tenants"
          description="Manage platform tenants and module access"
          actions={
            <Button variant="primary" onClick={openCreate}>
              Add Tenant
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
              placeholder="Search tenants... (press Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
            {tenants.length === 0 ? (
              <div className={listStyles.tableCardEmpty}>
                <EmptyState
                  icon="🏢"
                  title={search || showDisabled ? 'No tenants found' : 'No tenants yet'}
                  description={
                    search || showDisabled
                      ? 'Try a different search or clear filters.'
                      : 'Add a tenant to onboard a new organization.'
                  }
                  action={!search && !showDisabled ? openCreate : undefined}
                  actionLabel="Add Tenant"
                />
              </div>
            ) : (
              <div className={listStyles.tableCardBody}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Slug</TableHeaderCell>
                <TableHeaderCell>Industry</TableHeaderCell>
                <TableHeaderCell width="90px">Users</TableHeaderCell>
                <TableHeaderCell width="90px">Status</TableHeaderCell>
                <TableHeaderCell width="90px">WhatsApp</TableHeaderCell>
                <TableHeaderCell width="90px">Email</TableHeaderCell>
                <TableHeaderCell width="80px" align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.slug}</TableCell>
                  <TableCell>{industryOptions.find((o) => o.value === t.industry_id)?.label || '—'}</TableCell>
                  <TableCell>
                    <Link to={`/admin/users?tenantId=${t.id}`} className={styles.userCountLink}>
                      {t.user_count ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!t.is_enabled} />
                  </TableCell>
                  <TableCell>
                    <span className={t.whatsapp_module_enabled ? styles.moduleOn : styles.moduleOff}>
                      {t.whatsapp_module_enabled ? 'On' : 'Off'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={t.email_module_enabled ? styles.moduleOn : styles.moduleOff}>
                      {t.email_module_enabled ? 'On' : 'Off'}
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    {t.id !== 1 && (
                      <IconButton title="Edit" onClick={() => openEdit(t)} size="sm">✏️</IconButton>
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
        title={editing ? 'Edit Tenant' : 'Add Tenant'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Basic</h3>
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={formErrors.name}
              required
              placeholder="Company name"
            />
            <Input
              label="Slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              error={formErrors.slug}
              required
              placeholder="company-slug"
              readOnly={!!editing}
            />
            <Select
              label="Industry"
              options={industryOptions}
              value={form.industry_id}
              onChange={(e) => setForm((f) => ({ ...f, industry_id: e.target.value }))}
              placeholder="Select industry"
            />
            <Checkbox
              label="Tenant enabled"
              checked={form.is_enabled}
              onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
            />
          </div>

          {!editing && (
            <div className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>First admin user</h3>
              <p className={styles.formSectionHint}>Every tenant must have at least one admin. This user will have full access to the tenant.</p>
              <Input
                label="Admin email"
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                error={formErrors.admin_email}
                required
                placeholder="admin@company.com"
              />
              <Input
                label="Admin password"
                type="password"
                value={form.admin_password}
                onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                error={formErrors.admin_password}
                required
                placeholder="••••••••"
              />
              <Input
                label="Admin name"
                value={form.admin_name}
                onChange={(e) => setForm((f) => ({ ...f, admin_name: e.target.value }))}
                placeholder="Display name"
              />
            </div>
          )}

          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>WhatsApp</h3>
            <Checkbox
              label="WhatsApp module enabled (purchased)"
              checked={form.whatsapp_module_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_module_enabled: e.target.checked }))}
            />
            <Checkbox
              label="WhatsApp automation enabled (API send)"
              checked={form.whatsapp_automation_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_automation_enabled: e.target.checked }))}
            />
            <Select
              label="WhatsApp send mode"
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'automatic', label: 'Automatic' },
              ]}
              value={form.whatsapp_send_mode}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_send_mode: e.target.value }))}
            />
          </div>

          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Email</h3>
            <Checkbox
              label="Email communication plan (tracking, automation)"
              checked={form.email_communication_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_communication_enabled: e.target.checked }))}
            />
            <Checkbox
              label="Email module enabled (purchased)"
              checked={form.email_module_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_module_enabled: e.target.checked }))}
            />
            <Checkbox
              label="Email automation enabled"
              checked={form.email_automation_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_automation_enabled: e.target.checked }))}
            />
          </div>

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
