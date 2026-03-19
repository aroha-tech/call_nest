import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { useAnyPermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
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
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import listStyles from '../../components/admin/adminDataList.module.scss';

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

const emptyForm = {
  name: '',
  type: 'static',
  manager_id: '',
  status: 'active',
  filter_source: '',
  filter_status_id: '',
  filter_record_type: '__all__',
};

export function CampaignsPage() {
  const navigate = useNavigate();
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

  const fetchList = useCallback(() => campaignsAPI.list(), []);
  const {
    data: campaigns,
    loading,
    error,
    refetch,
  } = useAsyncData(fetchList, [fetchList], {
    transform: (res) => res.data?.data ?? [],
  });

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await tenantUsersAPI.getAll({ page: 1, limit: 200, includeDisabled: false });
        const rows = res.data?.data ?? [];
        if (cancelled) return;
        const map = {};
        for (const u of rows) {
          if (u.role === 'manager') map[u.id] = u.name || u.email;
        }
        setManagerMap(map);
      } catch {
        if (!cancelled) setManagerMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createMut = useMutation((body) => campaignsAPI.create(body));
  const updateMut = useMutation((id, body) => campaignsAPI.update(id, body));
  const deleteMut = useMutation((id) => campaignsAPI.softDelete(id));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, manager_id: '' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    const f = parseFilters(row);
    setEditing(row);
    setForm({
      name: row.name || '',
      type: row.type || 'static',
      manager_id: row.manager_id != null ? String(row.manager_id) : '',
      status: row.status || 'active',
      filter_source: f.source ?? '',
      filter_status_id: f.status_id ?? '',
      filter_record_type: f.type ?? '__all__',
    });
    setFormError('');
    setModalOpen(true);
  };

  const buildFiltersPayload = () => {
    const o = {};
    if (form.filter_source?.trim()) o.source = form.filter_source.trim();
    if (form.filter_status_id?.trim()) o.status_id = form.filter_status_id.trim();
    if (form.filter_record_type && form.filter_record_type !== '__all__') {
      o.type = form.filter_record_type.trim();
    }
    return o;
  };

  const handleDelete = async (row) => {
    if (!row?.id) return;
    const ok = window.confirm(
      `Archive campaign "${row.name}"? It will be hidden from lists; audit fields record who deleted it and when.`
    );
    if (!ok) return;
    const result = await deleteMut.mutate(row.id);
    if (result?.success) refetch();
    else window.alert(result?.error || 'Could not archive campaign');
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name?.trim()) {
      setFormError('Name is required');
      return;
    }
    if (form.type === 'filter') {
      const f = buildFiltersPayload();
      if (!Object.keys(f).length) {
        setFormError('Filter campaigns need at least one rule (source, status, or record type).');
        return;
      }
    }

    const body = {
      name: form.name.trim(),
      type: form.type,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
      status: form.status,
      filters_json: form.type === 'filter' ? buildFiltersPayload() : null,
    };

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

  const managerOptions = useMemo(() => {
    return Object.entries(managerMap)
      .map(([id, label]) => ({ value: id, label: `${label} (#${id})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [managerMap]);

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
        description="Static campaigns tag contacts with campaign_id. Filter campaigns select contacts dynamically by rules. Agents only see their assigned records when opening a campaign."
        actions={
          isAdmin && canCreate ? (
            <Button onClick={openCreate}>+ New campaign</Button>
          ) : null
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!campaigns?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📣"
                title="No campaigns yet"
                description={isAdmin ? 'Optional owning manager (like contacts). Static campaigns use campaign_id on contacts; filter campaigns use rules.' : 'Your admin has not created campaigns yet.'}
                action={isAdmin && canCreate ? openCreate : undefined}
                actionLabel={isAdmin && canCreate ? 'Create campaign' : undefined}
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
                  const f = parseFilters(c);
                  const ruleBits = [f.source && `source: ${f.source}`, f.status_id && `status_id: ${f.status_id}`, f.type && `type: ${f.type}`].filter(Boolean);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.type}</TableCell>
                      <TableCell>{managerMap[c.manager_id] || (c.manager_id ? `#${c.manager_id}` : '—')}</TableCell>
                      <TableCell>{c.status}</TableCell>
                      <TableCell style={{ maxWidth: 280 }}>
                        {c.type === 'filter' ? (ruleBits.length ? ruleBits.join(' · ') : '—') : 'Set campaign on each contact / import'}
                      </TableCell>
                      <TableCell align="center">
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {role === 'agent' && c.status === 'active' ? (
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/campaigns/${c.id}/open`)}>
                              Open
                            </Button>
                          ) : null}
                          {isAdmin ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                                Edit
                              </Button>
                              {canDelete ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(c)}
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
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit campaign' : 'New campaign'}
        size="md"
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
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
            placeholder="e.g. March outbound – APAC"
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
            options={[
              { value: 'static', label: 'Static (campaign_id on contacts)' },
              { value: 'filter', label: 'Filter (dynamic rules)' },
            ]}
          />
          <Select
            label="Owning manager (optional)"
            value={form.manager_id}
            onChange={(e) => setForm((s) => ({ ...s, manager_id: e.target.value }))}
            placeholder="No manager — same as unassigned contacts"
            options={[
              { value: '', label: '— No manager —' },
              ...managerOptions,
            ]}
          />
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
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.85 }}>
                Match contacts where all filled fields apply (source, status id, record type).
              </p>
              <Input
                label="Source (optional)"
                value={form.filter_source}
                onChange={(e) => setForm((s) => ({ ...s, filter_source: e.target.value }))}
                placeholder="e.g. facebook"
              />
              <Input
                label="Status ID (optional)"
                value={form.filter_status_id}
                onChange={(e) => setForm((s) => ({ ...s, filter_status_id: e.target.value }))}
                placeholder="UUID from status master"
              />
              <Select
                label="Record type (optional)"
                value={form.filter_record_type}
                onChange={(e) => setForm((s) => ({ ...s, filter_record_type: e.target.value }))}
                placeholder="Any record type"
                options={[
                  { value: '__all__', label: 'Any' },
                  { value: 'lead', label: 'lead' },
                  { value: 'contact', label: 'contact' },
                ]}
              />
            </div>
          ) : null}
          {editing ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, opacity: 0.7 }}>
              Created {editing.created_at ? new Date(editing.created_at).toLocaleString() : '—'}
              {editing.updated_at
                ? ` · Updated ${new Date(editing.updated_at).toLocaleString()}`
                : ''}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
