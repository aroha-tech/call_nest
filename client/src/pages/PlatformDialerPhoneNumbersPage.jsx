import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import { platformDialerPhoneNumbersAPI, tenantsAPI } from '../services/adminAPI';
import styles from './DialerPhoneNumbersPage.module.scss';

export function PlatformDialerPhoneNumbersPage() {
  const [rows, setRows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTenantId, setFilterTenantId] = useState('');
  const [unallocatedOnly, setUnallocatedOnly] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    tenant_id: '',
    label: '',
    caller_id_e164: '',
    agent_leg_e164: '',
  });

  const [editRow, setEditRow] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editForm, setEditForm] = useState({
    tenant_id: '',
    label: '',
    caller_id_e164: '',
    agent_leg_e164: '',
  });

  const [allocateBusyId, setAllocateBusyId] = useState(null);
  const [toggleRow, setToggleRow] = useState(null);
  const [removeRow, setRemoveRow] = useState(null);

  const loadTenants = useCallback(async () => {
    const res = await tenantsAPI.getAll({ page: 1, limit: 500, includeDisabled: true });
    setTenants(res?.data?.data ?? []);
  }, []);

  const loadNumbers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformDialerPhoneNumbersAPI.list({
        tenant_id: filterTenantId || undefined,
        unallocated_only: unallocatedOnly,
      });
      setRows(res?.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterTenantId, unallocatedOnly]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    void loadNumbers();
  }, [loadNumbers]);

  const tenantOptions = useMemo(
    () => [
      { value: '', label: '— Unallocated (inventory) —' },
      ...tenants.map((t) => ({
        value: String(t.id),
        label: `${t.name || 'Workspace'} (${t.slug || t.id})`,
      })),
    ],
    [tenants]
  );

  const filterTenantOptions = useMemo(
    () => [{ value: '', label: 'All workspaces' }, ...tenantOptions.slice(1)],
    [tenantOptions]
  );

  async function saveWorkspaceAllocation(row, tenantIdRaw) {
    const tid =
      tenantIdRaw === '' || tenantIdRaw === undefined || tenantIdRaw === null ? null : Number(tenantIdRaw);
    setAllocateBusyId(row.id);
    setError(null);
    try {
      await platformDialerPhoneNumbersAPI.update(row.id, { tenant_id: tid });
      await loadNumbers();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Update failed');
    } finally {
      setAllocateBusyId(null);
    }
  }

  async function submitAdd(ev) {
    ev?.preventDefault?.();
    setAddBusy(true);
    setError(null);
    try {
      const body = {
        label: addForm.label.trim() || null,
        caller_id_e164: addForm.caller_id_e164.trim(),
        agent_leg_e164: addForm.agent_leg_e164.trim() || null,
      };
      if (addForm.tenant_id) body.tenant_id = Number(addForm.tenant_id);
      await platformDialerPhoneNumbersAPI.create(body);
      setAddOpen(false);
      setAddForm({ tenant_id: '', label: '', caller_id_e164: '', agent_leg_e164: '' });
      await loadNumbers();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not add number');
    } finally {
      setAddBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      tenant_id: row.tenant_id != null ? String(row.tenant_id) : '',
      label: row.label || '',
      caller_id_e164: row.caller_id_e164 || '',
      agent_leg_e164: row.agent_leg_e164 || '',
    });
  }

  async function submitEdit(ev) {
    ev?.preventDefault?.();
    if (!editRow) return;
    setEditBusy(true);
    setError(null);
    try {
      const tid =
        editForm.tenant_id === '' || editForm.tenant_id === undefined
          ? null
          : Number(editForm.tenant_id);
      await platformDialerPhoneNumbersAPI.update(editRow.id, {
        tenant_id: tid,
        label: editForm.label.trim() || null,
        caller_id_e164: editForm.caller_id_e164.trim(),
        agent_leg_e164: editForm.agent_leg_e164.trim() || null,
      });
      setEditRow(null);
      await loadNumbers();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save');
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmToggleActive() {
    if (!toggleRow) return;
    const next = !toggleRow.is_active;
    setError(null);
    try {
      await platformDialerPhoneNumbersAPI.update(toggleRow.id, { is_active: next });
      setToggleRow(null);
      await loadNumbers();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Update failed');
    }
  }

  async function confirmRemove() {
    if (!removeRow) return;
    setError(null);
    try {
      await platformDialerPhoneNumbersAPI.remove(removeRow.id);
      setRemoveRow(null);
      await loadNumbers();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Remove failed');
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Dialer phone inventory"
        titleIcon="call"
        description="Register Exotel numbers at platform level, allocate each line to a client workspace, then their admins assign agents under Dialer Workflow → Phone numbers."
        actions={
          <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
            Add number
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <Select
          label="Filter by workspace"
          value={filterTenantId}
          onChange={(e) => {
            setFilterTenantId(e.target.value);
            setUnallocatedOnly(false);
          }}
          options={filterTenantOptions}
          className={styles.filterSelect}
          disabled={unallocatedOnly}
        />
        <Checkbox
          label="Unallocated only"
          checked={unallocatedOnly}
          onChange={(e) => {
            setUnallocatedOnly(e.target.checked);
            if (e.target.checked) setFilterTenantId('');
          }}
        />
      </div>

      {error ? (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      ) : null}

      <Card className={styles.card}>
        {loading ? (
          <p className={styles.muted}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>
            No inventory rows match this filter. Add purchased Exotel lines here, then allocate them to a workspace.
          </p>
        ) : (
          <Table variant="adminList">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Workspace</TableHeaderCell>
                <TableHeaderCell>Label</TableHeaderCell>
                <TableHeaderCell>Caller ID</TableHeaderCell>
                <TableHeaderCell>Agent leg</TableHeaderCell>
                <TableHeaderCell>Assigned in tenant</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Select
                      value={r.tenant_id != null ? String(r.tenant_id) : ''}
                      onChange={(e) => void saveWorkspaceAllocation(r, e.target.value)}
                      options={tenantOptions}
                      disabled={allocateBusyId === r.id}
                      className={styles.assignSelect}
                    />
                  </TableCell>
                  <TableCell>{r.label || '—'}</TableCell>
                  <TableCell className={styles.mono}>{r.caller_id_e164}</TableCell>
                  <TableCell className={styles.mono}>{r.agent_leg_e164 || '—'}</TableCell>
                  <TableCell>
                    {r.assigned_user_id
                      ? `${r.assigned_user_name || 'User'} (${r.assigned_user_email || r.assigned_user_id})`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!r.is_active} />
                  </TableCell>
                  <TableCell align="right">
                    <div className={styles.rowActions}>
                      <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={r.is_active ? 'secondary' : 'primary'}
                        onClick={() => setToggleRow(r)}
                      >
                        {r.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setRemoveRow(r)}>
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add platform number"
        footer={
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" loading={addBusy} onClick={() => void submitAdd()}>
              Add
            </Button>
          </ModalFooter>
        }
      >
        <form className={styles.addForm} onSubmit={submitAdd}>
          <Select
            label="Allocate to workspace (optional)"
            value={addForm.tenant_id}
            onChange={(e) => setAddForm((f) => ({ ...f, tenant_id: e.target.value }))}
            options={tenantOptions}
          />
          <Input
            label="Label (optional)"
            value={addForm.label}
            onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Main line, Support DID, …"
          />
          <Input
            label="Outbound caller ID (E.164)"
            value={addForm.caller_id_e164}
            onChange={(e) => setAddForm((f) => ({ ...f, caller_id_e164: e.target.value }))}
            placeholder="+91XXXXXXXXXX"
            required
          />
          <Input
            label="Agent leg / first dial (optional)"
            value={addForm.agent_leg_e164}
            onChange={(e) => setAddForm((f) => ({ ...f, agent_leg_e164: e.target.value }))}
            placeholder="Softphone / SIP leg"
          />
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(editRow)}
        onClose={() => setEditRow(null)}
        title="Edit inventory row"
        footer={
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" loading={editBusy} onClick={() => void submitEdit()}>
              Save
            </Button>
          </ModalFooter>
        }
      >
        <form className={styles.addForm} onSubmit={submitEdit}>
          <Select
            label="Workspace"
            value={editForm.tenant_id}
            onChange={(e) => setEditForm((f) => ({ ...f, tenant_id: e.target.value }))}
            options={tenantOptions}
          />
          <Input
            label="Label (optional)"
            value={editForm.label}
            onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
          />
          <Input
            label="Outbound caller ID (E.164)"
            value={editForm.caller_id_e164}
            onChange={(e) => setEditForm((f) => ({ ...f, caller_id_e164: e.target.value }))}
            required
          />
          <Input
            label="Agent leg / first dial (optional)"
            value={editForm.agent_leg_e164}
            onChange={(e) => setEditForm((f) => ({ ...f, agent_leg_e164: e.target.value }))}
          />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(toggleRow)}
        title={toggleRow?.is_active ? 'Deactivate number' : 'Activate number'}
        message={
          toggleRow?.is_active
            ? 'Inactive numbers are not used for assignments or call resolution until activated again.'
            : 'This number becomes available for allocation and call resolution.'
        }
        confirmText={toggleRow?.is_active ? 'Deactivate' : 'Activate'}
        variant={toggleRow?.is_active ? 'danger' : 'primary'}
        onClose={() => setToggleRow(null)}
        onConfirm={() => void confirmToggleActive()}
      />

      <ConfirmModal
        isOpen={Boolean(removeRow)}
        title="Remove number from inventory"
        message="This soft-deletes the row. Workspaces will no longer see this line."
        confirmText="Remove"
        variant="danger"
        onClose={() => setRemoveRow(null)}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
